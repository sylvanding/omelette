"""RAG knowledge base service — LlamaIndex-powered index, retrieval, and answer generation.

This replaces the original direct-ChromaDB implementation with LlamaIndex's
ChromaVectorStore, SentenceSplitter, and query engine for:
  - Proper embedding via GPU-aware local model or cloud API
  - SentenceSplitter chunking with metadata
  - Incremental insert/delete (no full rebuild needed)
  - Source-node-based citation tracking
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING

import chromadb
from chromadb.config import Settings as ChromaSettings
from llama_index.core import Settings as LlamaSettings
from llama_index.core import StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import Document, NodeRelationship, RelatedNodeInfo, TextNode

from app.config import settings
from app.services.llm_client import LLMClient

if TYPE_CHECKING:
    from llama_index.core.embeddings import BaseEmbedding

logger = logging.getLogger(__name__)


class RAGService:
    """LlamaIndex-powered RAG service with ChromaDB vector store."""

    def __init__(
        self,
        llm: LLMClient | None = None,
        *,
        chroma_client: chromadb.ClientAPI | None = None,
        embed_model: BaseEmbedding | None = None,
    ):
        self.llm = llm
        self._chroma_client = chroma_client
        self._embed_model = embed_model

    def _get_chroma_client(self) -> chromadb.ClientAPI:
        if self._chroma_client is None:
            persist_dir = Path(settings.chroma_db_dir)
            persist_dir.mkdir(parents=True, exist_ok=True)
            self._chroma_client = chromadb.PersistentClient(
                path=str(persist_dir),
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        return self._chroma_client

    def _get_collection(self, project_id: int) -> chromadb.Collection:
        return self._get_chroma_client().get_or_create_collection(
            name=f"project_{project_id}",
            metadata={"hnsw:space": "cosine"},
        )

    def _ensure_embed_model(self) -> BaseEmbedding:
        if self._embed_model is None:
            from app.services.embedding_service import get_embedding_model

            self._embed_model = get_embedding_model()
        LlamaSettings.embed_model = self._embed_model
        return self._embed_model

    def _get_vector_store(self, project_id: int):
        from llama_index.vector_stores.chroma import ChromaVectorStore

        collection = self._get_collection(project_id)
        return ChromaVectorStore(chroma_collection=collection)

    def _get_index(self, project_id: int) -> VectorStoreIndex:
        self._ensure_embed_model()
        vector_store = self._get_vector_store(project_id)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        return VectorStoreIndex.from_vector_store(
            vector_store,
            storage_context=storage_context,
            embed_model=self._embed_model,
        )

    async def index_chunks(
        self,
        project_id: int,
        chunks: list[dict],
        *,
        on_progress: Callable[[str, int], None] | None = None,
        batch_size: int = 64,
    ) -> dict:
        """Index paper chunks into ChromaDB via LlamaIndex.

        Converts raw chunk dicts to LlamaIndex TextNodes with metadata,
        then inserts them in batches, reporting progress via *on_progress*.
        """
        if not chunks:
            return {"indexed": 0}

        if on_progress:
            on_progress("loading_model", 0)

        index = self._get_index(project_id)

        if on_progress:
            on_progress("preparing", 5)

        nodes: list[TextNode] = []
        for chunk in chunks:
            node_id = f"paper_{chunk['paper_id']}_chunk_{chunk['chunk_index']}"
            ref_doc_id = f"paper_{chunk['paper_id']}"
            node = TextNode(
                id_=node_id,
                text=chunk["content"],
                metadata={
                    "paper_id": chunk["paper_id"],
                    "paper_title": chunk.get("paper_title", ""),
                    "chunk_type": chunk.get("chunk_type", "text"),
                    "page_number": chunk.get("page_number", 0),
                    "chunk_index": chunk.get("chunk_index", 0),
                },
                excluded_embed_metadata_keys=["paper_id", "chunk_index"],
                excluded_llm_metadata_keys=["paper_id", "chunk_index"],
            )
            node.relationships[NodeRelationship.SOURCE] = RelatedNodeInfo(node_id=ref_doc_id)
            nodes.append(node)

        import asyncio

        total = len(nodes)
        indexed = 0
        for i in range(0, total, batch_size):
            batch = nodes[i : i + batch_size]
            await asyncio.to_thread(index.insert_nodes, batch)
            indexed += len(batch)
            if on_progress:
                pct = 10 + int(90 * indexed / total)
                on_progress("indexing", min(pct, 99))

        return {"indexed": total, "collection": f"project_{project_id}"}

    async def index_documents(
        self,
        project_id: int,
        documents: list[Document],
        *,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
    ) -> dict:
        """Split documents with SentenceSplitter, then index the resulting nodes."""
        if not documents:
            return {"indexed": 0}

        splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        nodes = splitter.get_nodes_from_documents(documents)

        import asyncio

        index = self._get_index(project_id)
        await asyncio.to_thread(index.insert_nodes, nodes)
        return {"indexed": len(nodes), "collection": f"project_{project_id}"}

    def _get_adjacent_chunks(
        self,
        collection: chromadb.Collection,
        paper_id: int,
        chunk_index: int,
        window: int = 1,
    ) -> str:
        """Fetch adjacent chunks for context expansion.

        Returns combined text of [chunk_index - window, ..., chunk_index + window].
        """
        target_ids = [
            f"paper_{paper_id}_chunk_{chunk_index + offset}" for offset in range(-window, window + 1) if offset != 0
        ]
        if not target_ids:
            return ""

        try:
            result = collection.get(ids=target_ids, include=["documents"])
            docs = result.get("documents") or []
            return "\n".join(d for d in docs if d)
        except Exception:
            return ""

    async def query(
        self,
        project_id: int,
        question: str,
        top_k: int = 10,
        use_reranker: bool = False,
        include_sources: bool = True,
    ) -> dict:
        """Query the knowledge base and generate an answer with citations."""
        collection = self._get_collection(project_id)
        if collection.count() == 0:
            return {
                "answer": "No documents have been indexed yet. Please process and index papers first.",
                "sources": [],
                "confidence": 0.0,
            }

        import asyncio

        index = self._get_index(project_id)
        retriever = index.as_retriever(similarity_top_k=min(top_k, collection.count()))
        retrieved_nodes = await asyncio.to_thread(retriever.retrieve, question)

        if not retrieved_nodes:
            return {"answer": "No relevant documents found.", "sources": [], "confidence": 0.0}

        contexts = []
        sources = []
        for node_with_score in retrieved_nodes:
            node = node_with_score.node
            meta = node.metadata or {}
            score = node_with_score.score or 0.0
            text = node.get_content()

            paper_id = meta.get("paper_id")
            chunk_idx = meta.get("chunk_index")
            adjacent_text = ""
            if paper_id is not None and chunk_idx is not None:
                adjacent_text = await asyncio.to_thread(
                    self._get_adjacent_chunks,
                    collection,
                    paper_id,
                    chunk_idx,
                )

            full_context = f"{adjacent_text}\n{text}\n{adjacent_text}".strip() if adjacent_text else text

            contexts.append(
                f"[Source: {meta.get('paper_title', 'Unknown')}, p.{meta.get('page_number', '?')}]\n{full_context}"
            )
            sources.append(
                {
                    "paper_id": paper_id,
                    "paper_title": meta.get("paper_title", ""),
                    "page_number": meta.get("page_number"),
                    "chunk_type": meta.get("chunk_type", "text"),
                    "relevance_score": round(float(score), 3),
                    "excerpt": full_context[:800] + "..." if len(full_context) > 800 else full_context,
                }
            )

        context_text = "\n\n---\n\n".join(contexts)

        if self.llm:
            answer = await self._generate_answer(question, context_text)
        else:
            answer = f"Retrieved {len(sources)} relevant passages. LLM not available for answer generation."

        avg_score = sum(s["relevance_score"] for s in sources) / len(sources) if sources else 0

        return {
            "answer": answer,
            "sources": sources if include_sources else [],
            "confidence": round(avg_score, 3),
        }

    async def _generate_answer(self, question: str, context: str) -> str:
        prompt = (
            "Based on the following scientific literature excerpts, answer the question.\n"
            "Include in-text citations referencing the source papers.\n"
            "If the context doesn't contain enough information, say so honestly.\n\n"
            f"Question: {question}\n\n"
            f"Context:\n{context}\n\n"
            "Provide a comprehensive answer with citations."
        )
        return await self.llm.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a scientific research assistant. "
                        "Answer questions based strictly on the provided context. "
                        "Cite sources accurately."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            task_type="rag_answer",
        )

    async def delete_index(self, project_id: int) -> dict:
        """Delete the entire vector index for a project."""
        client = self._get_chroma_client()
        name = f"project_{project_id}"
        try:
            client.delete_collection(name)
            return {"deleted": True, "collection": name}
        except ValueError:
            return {"deleted": False, "message": "Collection not found"}

    async def delete_paper(self, project_id: int, paper_id: int) -> dict:
        """Delete all chunks for a single paper from the index."""
        collection = self._get_collection(project_id)
        try:
            collection.delete(where={"paper_id": paper_id})
            return {"deleted": True, "paper_id": paper_id}
        except Exception as e:
            logger.warning("Failed to delete paper %d from index: %s", paper_id, e)
            return {"deleted": False, "paper_id": paper_id, "error": str(e)}

    async def get_stats(self, project_id: int) -> dict:
        """Get index statistics for a project."""
        try:
            collection = self._get_collection(project_id)
            return {
                "total_chunks": collection.count(),
                "collection_name": f"project_{project_id}",
            }
        except Exception:
            return {"total_chunks": 0, "collection_name": f"project_{project_id}"}

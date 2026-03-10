"""RAG knowledge base service — index, retrieve, and answer questions with citations."""

import logging
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


class RAGService:
    """Manages ChromaDB vector index and retrieval-augmented generation."""

    def __init__(self, llm: LLMClient | None = None):
        self.llm = llm
        self._client: chromadb.ClientAPI | None = None

    def _get_client(self) -> chromadb.ClientAPI:
        if self._client is None:
            persist_dir = Path(settings.chroma_db_dir)
            persist_dir.mkdir(parents=True, exist_ok=True)
            self._client = chromadb.PersistentClient(
                path=str(persist_dir),
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        return self._client

    def _get_collection(self, project_id: int) -> chromadb.Collection:
        client = self._get_client()
        return client.get_or_create_collection(
            name=f"project_{project_id}",
            metadata={"hnsw:space": "cosine"},
        )

    async def index_chunks(self, project_id: int, chunks: list[dict]) -> dict:
        """Index paper chunks into ChromaDB."""
        if not chunks:
            return {"indexed": 0}

        collection = self._get_collection(project_id)

        ids = []
        documents = []
        metadatas = []

        for chunk in chunks:
            chunk_id = f"paper_{chunk['paper_id']}_chunk_{chunk['chunk_index']}"
            ids.append(chunk_id)
            documents.append(chunk["content"])
            metadatas.append(
                {
                    "paper_id": chunk["paper_id"],
                    "paper_title": chunk.get("paper_title", ""),
                    "chunk_type": chunk.get("chunk_type", "text"),
                    "page_number": chunk.get("page_number", 0),
                    "chunk_index": chunk.get("chunk_index", 0),
                }
            )

        # ChromaDB handles embedding internally with its default model
        collection.upsert(ids=ids, documents=documents, metadatas=metadatas)

        return {"indexed": len(ids), "collection": f"project_{project_id}"}

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

        # Check if collection has data
        if collection.count() == 0:
            return {
                "answer": "No documents have been indexed yet. Please process and index papers first.",
                "sources": [],
                "confidence": 0.0,
            }

        # Retrieve relevant chunks
        results = collection.query(
            query_texts=[question],
            n_results=min(top_k, collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"] or not results["documents"][0]:
            return {"answer": "No relevant documents found.", "sources": [], "confidence": 0.0}

        # Build context from retrieved chunks
        contexts = []
        sources = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            contexts.append(f"[Source: {meta.get('paper_title', 'Unknown')}, p.{meta.get('page_number', '?')}]\n{doc}")
            sources.append(
                {
                    "paper_id": meta.get("paper_id"),
                    "paper_title": meta.get("paper_title", ""),
                    "page_number": meta.get("page_number"),
                    "chunk_type": meta.get("chunk_type", "text"),
                    "relevance_score": round(1 - dist, 3),  # cosine similarity
                    "excerpt": doc[:200] + "..." if len(doc) > 200 else doc,
                }
            )

        context_text = "\n\n---\n\n".join(contexts)

        # Generate answer with LLM
        if self.llm:
            answer = await self._generate_answer(question, context_text, sources)
        else:
            answer = f"Retrieved {len(sources)} relevant passages. LLM not available for answer generation."

        avg_score = sum(s["relevance_score"] for s in sources) / len(sources) if sources else 0

        return {
            "answer": answer,
            "sources": sources if include_sources else [],
            "confidence": round(avg_score, 3),
        }

    async def _generate_answer(self, question: str, context: str, sources: list[dict]) -> str:
        """Use LLM to generate an answer based on retrieved context."""
        prompt = f"""Based on the following scientific literature excerpts, answer the question.
Include in-text citations referencing the source papers.
If the context doesn't contain enough information, say so honestly.

Question: {question}

Context:
{context}

Provide a comprehensive answer with citations."""

        try:
            answer = await self.llm.chat(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a scientific research assistant. Answer questions based strictly on the provided context. Cite sources accurately.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                task_type="rag_answer",
            )
            return answer
        except Exception as e:
            logger.error(f"LLM answer generation failed: {e}")
            return f"Error generating answer: {e}"

    async def delete_index(self, project_id: int) -> dict:
        """Delete the vector index for a project."""
        client = self._get_client()
        collection_name = f"project_{project_id}"
        try:
            client.delete_collection(collection_name)
            return {"deleted": True, "collection": collection_name}
        except Exception:
            return {"deleted": False, "message": "Collection not found"}

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

"""Multi-source literature search service with standardized metadata output."""

import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from abc import ABC, abstractmethod

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


# Use proxy if configured
def _get_proxy() -> str | None:
    return settings.http_proxy or None


class StandardizedPaper:
    """Unified paper metadata format across all sources."""

    def __init__(self, **kwargs):
        self.doi = kwargs.get("doi", "")
        self.title = kwargs.get("title", "")
        self.abstract = kwargs.get("abstract", "")
        self.authors = kwargs.get("authors", [])  # list of {"name": "...", "affiliation": "..."}
        self.journal = kwargs.get("journal", "")
        self.year = kwargs.get("year")
        self.citation_count = kwargs.get("citation_count", 0)
        self.source = kwargs.get("source", "")
        self.source_id = kwargs.get("source_id", "")
        self.pdf_url = kwargs.get("pdf_url", "")
        self.url = kwargs.get("url", "")
        self.extra_metadata = kwargs.get("extra_metadata", {})

    def to_dict(self) -> dict:
        return {
            "doi": self.doi,
            "title": self.title,
            "abstract": self.abstract,
            "authors": self.authors,
            "journal": self.journal,
            "year": self.year,
            "citation_count": self.citation_count,
            "source": self.source,
            "source_id": self.source_id,
            "pdf_url": self.pdf_url,
            "url": self.url,
            "extra_metadata": self.extra_metadata,
        }


class SearchProvider(ABC):
    @abstractmethod
    async def search(self, query: str, max_results: int = 100) -> list[StandardizedPaper]: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


def _reconstruct_abstract_from_inverted_index(inv_index: dict) -> str:
    """Reconstruct abstract text from OpenAlex abstract_inverted_index."""
    if not inv_index:
        return ""
    positions: list[tuple[int, str]] = []
    for word, idx_list in inv_index.items():
        for idx in idx_list:
            positions.append((idx, word))
    positions.sort(key=lambda x: x[0])
    return " ".join(w for _, w in positions)


class SemanticScholarProvider(SearchProvider):
    """Semantic Scholar API — 100 req/5min without key, higher with key."""

    BASE = "https://api.semanticscholar.org/graph/v1/paper/search"
    FIELDS = "title,abstract,authors,journal,year,citationCount,externalIds,openAccessPdf,url"

    @property
    def name(self) -> str:
        return "semantic_scholar"

    async def search(self, query: str, max_results: int = 100) -> list[StandardizedPaper]:
        params = {
            "query": query,
            "limit": min(max_results, 100),
            "fields": self.FIELDS,
        }
        headers = {}
        if settings.semantic_scholar_api_key:
            headers["x-api-key"] = settings.semantic_scholar_api_key

        async with httpx.AsyncClient(proxy=_get_proxy(), timeout=30.0) as client:
            resp = await client.get(self.BASE, params=params, headers=headers or None)
            resp.raise_for_status()
            data = resp.json()

        papers = []
        for item in data.get("data", []):
            authors = []
            for a in item.get("authors", []) or []:
                authors.append({"name": a.get("name", ""), "affiliation": ""})
            doi = ""
            ext = item.get("externalIds") or {}
            if ext.get("DOI"):
                doi = ext["DOI"] if isinstance(ext["DOI"], str) else ext["DOI"].get("value", "")
            pdf_url = ""
            oa = item.get("openAccessPdf") or {}
            if oa.get("url"):
                pdf_url = oa["url"]
            papers.append(
                StandardizedPaper(
                    doi=doi,
                    title=item.get("title", ""),
                    abstract=item.get("abstract", ""),
                    authors=authors,
                    journal=(item.get("journal") or {}).get("name", ""),
                    year=item.get("year"),
                    citation_count=item.get("citationCount", 0),
                    source=self.name,
                    source_id=item.get("paperId", ""),
                    pdf_url=pdf_url,
                    url=item.get("url", ""),
                )
            )
        return papers


class OpenAlexProvider(SearchProvider):
    """OpenAlex API — polite pool with email param."""

    BASE = "https://api.openalex.org/works"

    @property
    def name(self) -> str:
        return "openalex"

    async def search(self, query: str, max_results: int = 100) -> list[StandardizedPaper]:
        params = {"search": query, "per_page": min(max_results, 200)}
        if settings.unpaywall_email:
            params["mailto"] = settings.unpaywall_email

        async with httpx.AsyncClient(proxy=_get_proxy(), timeout=30.0) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
            data = resp.json()

        papers = []
        for item in data.get("results", []):
            authors = []
            for a in item.get("authorships", []) or []:
                author = a.get("author") or {}
                name = author.get("display_name", "")

                def _affiliation(auth: dict) -> str:
                    insts = auth.get("institutions") or []
                    if not insts:
                        return ""
                    return "; ".join(i.get("display_name", "") for i in insts if i.get("display_name"))

                authors.append({"name": name, "affiliation": _affiliation(a)})

            doi = ""
            ids = item.get("ids") or {}
            if ids.get("doi"):
                doi_url = ids["doi"]
                if isinstance(doi_url, str) and "doi.org/" in doi_url:
                    doi = doi_url.replace("https://doi.org/", "").strip()
                else:
                    doi = str(doi_url)

            abstract = ""
            inv = item.get("abstract_inverted_index")
            if inv:
                abstract = _reconstruct_abstract_from_inverted_index(inv)

            journal = ""
            loc = item.get("primary_location") or {}
            src = loc.get("source") or {}
            if src.get("display_name"):
                journal = src["display_name"]

            pdf_url = (loc.get("pdf_url") or "") or ""
            if not pdf_url:
                oa = item.get("best_oa_location") or {}
                pdf_url = oa.get("pdf_url") or ""

            url = item.get("doi") or item.get("id")
            if isinstance(url, str) and url.startswith("http"):
                pass
            else:
                url = f"https://doi.org/{doi}" if doi else item.get("id", "")

            source_id = item.get("id", "")
            if isinstance(source_id, str) and "openalex.org/" in source_id:
                source_id = source_id.split("/")[-1]

            papers.append(
                StandardizedPaper(
                    doi=doi,
                    title=item.get("display_name", ""),
                    abstract=abstract,
                    authors=authors,
                    journal=journal,
                    year=item.get("publication_year"),
                    citation_count=item.get("cited_by_count", 0),
                    source=self.name,
                    source_id=source_id,
                    pdf_url=pdf_url,
                    url=url,
                )
            )
        return papers


class ArXivProvider(SearchProvider):
    """arXiv API — Atom XML feed."""

    BASE = "https://export.arxiv.org/api/query"

    @property
    def name(self) -> str:
        return "arxiv"

    async def search(self, query: str, max_results: int = 100) -> list[StandardizedPaper]:
        params = {
            "search_query": f"all:{query}",
            "max_results": min(max_results, 200),
        }

        async with httpx.AsyncClient(proxy=_get_proxy(), timeout=30.0) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)

        ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
        papers = []
        for entry in root.findall(".//atom:entry", ns):
            title_el = entry.find("atom:title", ns)
            title = (title_el.text or "").strip().replace("\n", " ")

            summary_el = entry.find("atom:summary", ns)
            abstract = (summary_el.text or "").strip().replace("\n", " ") if summary_el is not None else ""

            authors = []
            for author in entry.findall("atom:author", ns):
                name_el = author.find("atom:name", ns)
                if name_el is not None and name_el.text:
                    authors.append({"name": name_el.text.strip(), "affiliation": ""})

            id_el = entry.find("atom:id", ns)
            arxiv_id = (id_el.text or "").strip() if id_el is not None else ""
            source_id = ""
            if "arxiv.org/abs/" in arxiv_id:
                m = re.search(r"arxiv\.org/abs/([\d.]+v?\d*)", arxiv_id)
                if m:
                    source_id = m.group(1)

            pdf_url = ""
            for link in entry.findall("atom:link", ns):
                rel = link.get("rel", "")
                if rel == "related" and link.get("type") == "application/pdf":
                    pdf_url = link.get("href", "")
                    break

            url = arxiv_id
            if not url and source_id:
                url = f"https://arxiv.org/abs/{source_id}"

            papers.append(
                StandardizedPaper(
                    doi="",
                    title=title,
                    abstract=abstract,
                    authors=authors,
                    journal="arXiv",
                    year=None,
                    citation_count=0,
                    source=self.name,
                    source_id=source_id,
                    pdf_url=pdf_url,
                    url=url,
                )
            )
        return papers


class CrossrefProvider(SearchProvider):
    """Crossref API — metadata for scholarly works."""

    BASE = "https://api.crossref.org/works"

    @property
    def name(self) -> str:
        return "crossref"

    async def search(self, query: str, max_results: int = 100) -> list[StandardizedPaper]:
        params = {"query": query, "rows": min(max_results, 1000)}

        async with httpx.AsyncClient(proxy=_get_proxy(), timeout=30.0) as client:
            resp = await client.get(self.BASE, params=params)
            resp.raise_for_status()
            data = resp.json()

        papers = []
        for item in data.get("message", {}).get("items", []):
            titles = item.get("title", [])
            title = titles[0] if titles else ""

            authors = []
            for a in item.get("author", []) or []:
                given = a.get("given", "")
                family = a.get("family", "")
                name = f"{given} {family}".strip() or a.get("name", "")
                aff = a.get("affiliation") or []
                affiliation = "; ".join(str(x.get("name", x) if isinstance(x, dict) else x) for x in aff) if aff else ""
                authors.append({"name": name, "affiliation": affiliation})

            doi = item.get("DOI", "")
            if isinstance(doi, str):
                doi = doi.strip()

            container = item.get("container-title", [])
            journal = container[0] if container else ""

            year = None
            if item.get("published"):
                parts = item["published"].get("date-parts", [[]])
                if parts and parts[0]:
                    year = parts[0][0]

            if year is None and item.get("issued"):
                parts = item["issued"].get("date-parts", [[]])
                if parts and parts[0]:
                    year = parts[0][0]

            url = item.get("URL", "") or (f"https://doi.org/{doi}" if doi else "")

            papers.append(
                StandardizedPaper(
                    doi=doi,
                    title=title,
                    abstract=item.get("abstract", ""),
                    authors=authors,
                    journal=journal,
                    year=year,
                    citation_count=item.get("is-referenced-by-count", 0),
                    source=self.name,
                    source_id=doi or item.get("URL", ""),
                    pdf_url="",
                    url=url,
                )
            )
        return papers


class SearchService:
    def __init__(self):
        self.providers: dict[str, SearchProvider] = {
            "semantic_scholar": SemanticScholarProvider(),
            "openalex": OpenAlexProvider(),
            "arxiv": ArXivProvider(),
            "crossref": CrossrefProvider(),
        }

    async def search(self, query: str, sources: list[str] | None = None, max_results: int = 100) -> dict:
        """Run federated search across selected sources."""
        if sources is None:
            sources = list(self.providers.keys())

        tasks = []
        for source in sources:
            if source in self.providers:
                tasks.append(self._search_source(source, query, max_results))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_papers = []
        source_stats = {}
        for source, result in zip(sources, results):
            if isinstance(result, Exception):
                source_stats[source] = {"count": 0, "error": str(result)}
                logger.error("Search failed for %s: %s", source, result)
            else:
                source_stats[source] = {"count": len(result)}
                all_papers.extend(result)

        return {
            "papers": [p.to_dict() for p in all_papers],
            "total": len(all_papers),
            "source_stats": source_stats,
        }

    async def _search_source(self, source: str, query: str, max_results: int) -> list[StandardizedPaper]:
        provider = self.providers[source]
        return await provider.search(query, max_results)

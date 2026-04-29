"""Bibliography export service — generates BibTeX, RIS, and EndNote XML formats."""

from app.models import Paper


def _author_names(authors) -> list[str]:
    if not authors:
        return []
    return [a.get("name", str(a)) if isinstance(a, dict) else str(a) for a in authors]


def _to_bibtex(papers: list[Paper]) -> str:
    entries = []
    for paper in papers:
        names = _author_names(paper.authors)
        first_author = names[0] if names else "unknown"
        last_name = first_author.split()[-1] if first_author else "unknown"
        year = paper.year or "no-date"
        keyword = "".join(paper.title.split()[:3])
        key = "".join(c for c in f"{last_name}{year}{keyword}" if c.isalnum())

        authors_str = " and ".join(n.strip() for n in names)
        lines = [
            f"@article{{{key},",
            f"  title = {{{paper.title}}},",
            f"  author = {{{authors_str}}},",
        ]
        if paper.journal:
            lines.append(f"  journal = {{{paper.journal}}},")
        if paper.year:
            lines.append(f"  year = {{{paper.year}}},")
        if paper.doi:
            lines.append(f"  doi = {{{paper.doi}}},")
        if paper.abstract:
            lines.append(f"  abstract = {{{paper.abstract}}},")
        lines.append("}")
        entries.append("\n".join(lines))
    return "\n\n".join(entries)


def _to_ris(papers: list[Paper]) -> str:
    entries = []
    for paper in papers:
        names = _author_names(paper.authors)
        lines = ["TY  - JOUR", f"TI  - {paper.title}"]
        for name in names:
            lines.append(f"AU  - {name.strip()}")
        if paper.journal:
            lines.append(f"JO  - {paper.journal}")
        if paper.year:
            lines.append(f"PY  - {paper.year}")
        if paper.abstract:
            lines.append(f"AB  - {paper.abstract}")
        if paper.doi:
            lines.append(f"DO  - {paper.doi}")
        lines.append("ER  - ")
        entries.append("\n".join(lines))
    return "\n\n".join(entries)


def _to_endnote(papers: list[Paper]) -> str:
    records = []
    for paper in papers:
        names = _author_names(paper.authors)
        authors_xml = "\n".join(f"    <author>{n.strip()}</author>" for n in names)
        record_lines = [
            "  <record>",
            f'    <database name="Omelette">{paper.title}</database>',
            "    <authors>",
            authors_xml,
            "    </authors>",
            f"    <title>{paper.title}</title>",
        ]
        if paper.journal:
            record_lines.append(f"    <journal>{paper.journal}</journal>")
        if paper.year:
            record_lines.append(f"    <year>{paper.year}</year>")
        if paper.abstract:
            record_lines.append(f"    <abstract>{paper.abstract}</abstract>")
        if paper.doi:
            record_lines.append(f"    <doi>{paper.doi}</doi>")
        record_lines.append("  </record>")
        records.append("\n".join(record_lines))

    return '<?xml version="1.0" encoding="UTF-8"?>\n<xml>\n<records>\n' + "\n\n".join(records) + "\n</records>\n</xml>"


FORMAT_GENERATORS = {
    "bibtex": _to_bibtex,
    "ris": _to_ris,
    "endnote": _to_endnote,
}

FORMAT_EXTENSIONS = {
    "bibtex": "bib",
    "ris": "ris",
    "endnote": "xml",
}

FORMAT_MIME_TYPES = {
    "bibtex": "application/x-bibtex",
    "ris": "application/x-research-info-systems",
    "endnote": "application/xml",
}


def generate_export(papers: list[Paper], fmt: str) -> str:
    generator = FORMAT_GENERATORS[fmt]
    return generator(papers)

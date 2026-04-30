import type { Paper, Author } from '@/types';

/**
 * Format utilities for bibliography export.
 */

function getAuthorNames(authors: Author[] | null): string[] {
  if (!authors) return [];
  return authors.map((a) => (typeof a === 'object' && 'name' in a ? a.name : String(a)));
}

function formatAuthorsBibtex(names: string[]): string {
  return names.map((name) => name.trim()).join(' and ');
}

function formatAuthorsRis(names: string[]): string[] {
  return names.map((name) => `AU  - ${name.trim()}`);
}

function generateBibtexKey(paper: Paper): string {
  const names = getAuthorNames(paper.authors);
  const firstAuthor = names[0] ?? 'unknown';
  const lastName = firstAuthor.split(/\s+/).pop() ?? 'unknown';
  const year = paper.year ?? 'no-date';
  const keyword = paper.title.split(/\s+/).slice(0, 3).join('');
  return `${lastName}${year}${keyword}`.replace(/[^a-zA-Z0-9]/g, '');
}

function sanitizeBibtex(value: string): string {
  return value.replace(/[{}]/g, (m) => (m === '{' ? '{' : '}'));
}

/**
 * Convert papers to BibTeX format string.
 */
export function toBibTeX(papers: Paper[]): string {
  return papers
    .map((paper) => {
      const key = generateBibtexKey(paper);
      const authors = formatAuthorsBibtex(getAuthorNames(paper.authors));
      const title = sanitizeBibtex(paper.title);
      const journal = paper.journal ? `  journal = {${paper.journal}},` : '';
      const doi = paper.doi ? `  doi = {${paper.doi}},` : '';
      const year = paper.year ? `  year = {${paper.year}},` : '';
      const abstract = paper.abstract ? `  abstract = {${sanitizeBibtex(paper.abstract)}},` : '';

      return `@article{${key},
  title = {${title}},
  author = {${authors}},
${[journal, year, doi, abstract].filter(Boolean).join('\n')}
}`;
    })
    .join('\n\n');
}

/**
 * Convert papers to APA 7th edition format string.
 */
export function toAPA(papers: Paper[]): string {
  return papers
    .map((paper) => {
      const names = getAuthorNames(paper.authors);
      const formatted = formatAPAAuthors(names);
      const year = paper.year ? `(${paper.year})` : '(n.d.)';
      const title = paper.title;
      const journal = paper.journal ? `*${paper.journal}*` : '';
      const doi = paper.doi ? `https://doi.org/${paper.doi}` : '';

      const parts = [`${formatted} ${year}. ${title}.`];
      if (journal) parts.push(` ${journal}.`);
      if (doi) parts.push(` ${doi}`);

      return parts.join('');
    })
    .join('\n\n');
}

function formatAPAAuthors(names: string[]): string {
  if (names.length === 0) return 'Unknown';
  if (names.length === 1) return formatAuthorName(names[0]);
  if (names.length === 2) return `${formatAuthorName(names[0])}, & ${formatAuthorName(names[1])}`;
  if (names.length <= 20) {
    const formatted = names.slice(0, -1).map(formatAuthorName).join(', ');
    return `${formatted}, & ${formatAuthorName(names[names.length - 1])}`;
  }
  // 21+ authors: first 19 + ellipsis + last author
  const first19 = names.slice(0, 19).map(formatAuthorName).join(', ');
  return `${first19}, ..., ${formatAuthorName(names[names.length - 1])}`;
}

function formatAuthorName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name.trim();
  const lastName = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return `${lastName}, ${initials}.`;
}

/**
 * Convert papers to MLA 9th edition format string.
 */
export function toMLA(papers: Paper[]): string {
  return papers
    .map((paper) => {
      const names = getAuthorNames(paper.authors);
      const formatted = formatMLAAuthors(names);
      const title = `"${paper.title}."`;
      const journal = paper.journal ? `*${paper.journal}*` : '';
      const year = paper.year ? `${paper.year}` : 'n.d.';
      const doi = paper.doi ? `https://doi.org/${paper.doi}` : '';

      const parts = [`${formatted} ${title}`];
      if (journal) parts.push(` ${journal},`);
      parts.push(` ${year}`);
      if (doi) parts.push(`, ${doi}`);
      parts.push('.');

      return parts.join('');
    })
    .join('\n\n');
}

function formatMLAAuthors(names: string[]): string {
  if (names.length === 0) return 'Unknown';
  if (names.length === 1) return formatMLAAuthorName(names[0]);
  if (names.length === 2)
    return `${formatMLAAuthorName(names[0])}, and ${formatMLAAuthorName(names[1])}`;
  return `${formatMLAAuthorName(names[0])}, et al.`;
}

function formatMLAAuthorName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name.trim();
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return `${lastName}, ${firstName}`;
}

/**
 * Convert papers to RIS format string.
 */
export function toRIS(papers: Paper[]): string {
  return papers
    .map((paper) => {
      const lines = ['TY  - JOUR', `TI  - ${paper.title}`];

      const authorLines = formatAuthorsRis(getAuthorNames(paper.authors));
      lines.push(...authorLines);

      if (paper.journal) lines.push(`JO  - ${paper.journal}`);
      if (paper.year) lines.push(`PY  - ${paper.year}`);
      if (paper.abstract) lines.push(`AB  - ${paper.abstract}`);
      if (paper.doi) lines.push(`DO  - ${paper.doi}`);
      lines.push('ER  - ');

      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Convert papers to EndNote XML format string.
 */
export function toEndNote(papers: Paper[]): string {
  const records = papers
    .map((paper) => {
      const names = getAuthorNames(paper.authors);
      const authors = names
        .map((name) => `    <author>${name.trim()}</author>`)
        .join('\n');

      return `  <record>
    <database name="Omelette">${paper.title}</database>
    <authors>
${authors}
    </authors>
    <title>${paper.title}</title>
${paper.journal ? `    <journal>${paper.journal}</journal>` : ''}
${paper.year ? `    <year>${paper.year}</year>` : ''}
${paper.abstract ? `    <abstract>${paper.abstract}</abstract>` : ''}
${paper.doi ? `    <doi>${paper.doi}</doi>` : ''}
  </record>`;
    })
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xml>
<records>
${records}
</records>
</xml>`;
}

/**
 * Supported export formats.
 */
export type ExportFormat = 'bibtex' | 'ris' | 'endnote';

/**
 * Export papers in the given format and trigger a browser download.
 */
export function downloadExport(papers: Paper[], format: ExportFormat, projectName: string): void {
  const extension: Record<ExportFormat, string> = { bibtex: 'bib', ris: 'ris', endnote: 'xml' };
  const mimeType: Record<ExportFormat, string> = {
    bibtex: 'application/x-bibtex',
    ris: 'application/x-research-info-systems',
    endnote: 'application/xml',
  };
  const generator: Record<ExportFormat, (papers: Paper[]) => string> = {
    bibtex: toBibTeX,
    ris: toRIS,
    endnote: toEndNote,
  };

  const content = generator[format](papers);
  const fileName = `${projectName.replace(/\s+/g, '-').toLowerCase()}-${format}.${extension[format]}`;

  const blob = new Blob([content], { type: mimeType[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

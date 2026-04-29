import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toBibTeX, toRIS, toEndNote, downloadExport } from '../bibliography-export';
import type { Paper } from '@/types';

const now = new Date().toISOString();

const mockPapers: Paper[] = [
  {
    id: 1,
    project_id: 1,
    doi: '10.1234/example',
    title: 'Deep Learning for NLP',
    abstract: 'A comprehensive survey of deep learning methods.',
    authors: [{ name: 'Jane Doe', affiliation: 'MIT' }, { name: 'John Smith', affiliation: 'Stanford' }],
    journal: 'Journal of AI Research',
    year: 2024,
    citation_count: 42,
    source: 'semantic_scholar',
    source_id: 'ss-1',
    pdf_path: '/papers/1.pdf',
    pdf_url: 'https://example.com/1.pdf',
    status: 'indexed',
    tags: ['dl', 'nlp'],
    notes: '',
    created_at: now,
    updated_at: now,
  },
  {
    id: 2,
    project_id: 1,
    doi: null,
    title: 'Transformer Architectures',
    abstract: '',
    authors: [{ name: 'Alice Wang' }],
    journal: '',
    year: 2023,
    citation_count: 10,
    source: 'arxiv',
    source_id: 'arxiv-123',
    pdf_path: '',
    pdf_url: '',
    status: 'pending',
    tags: null,
    notes: '',
    created_at: now,
    updated_at: now,
  },
];

describe('toBibTeX', () => {
  it('produces valid BibTeX entries for papers', () => {
    const output = toBibTeX(mockPapers);
    expect(output).toContain('@article{Doe2024Deep');
    expect(output).toContain('title = {Deep Learning for NLP}');
    expect(output).toContain('author = {Jane Doe and John Smith}');
    expect(output).toContain('journal = {Journal of AI Research}');
    expect(output).toContain('year = {2024}');
    expect(output).toContain('doi = {10.1234/example}');
    expect(output).toContain('abstract = {A comprehensive survey of deep learning methods.}');
  });

  it('handles missing optional fields gracefully', () => {
    const output = toBibTeX([mockPapers[1]]);
    expect(output).toContain('@article{Wang2023Transformer');
    expect(output).not.toContain('doi =');
    expect(output).not.toContain('journal =');
    expect(output).not.toContain('abstract =');
  });

  it('handles null authors', () => {
    const paperWithoutAuthors: Paper = {
      ...mockPapers[0],
      authors: null,
    };
    const output = toBibTeX([paperWithoutAuthors]);
    expect(output).toContain('author = {}');
  });

  it('separates multiple entries with blank lines', () => {
    const output = toBibTeX(mockPapers);
    const entries = output.split('\n\n');
    expect(entries.length).toBe(2);
  });
});

describe('toRIS', () => {
  it('produces valid RIS format', () => {
    const output = toRIS(mockPapers);
    expect(output).toContain('TY  - JOUR');
    expect(output).toContain('TI  - Deep Learning for NLP');
    expect(output).toContain('AU  - Jane Doe');
    expect(output).toContain('AU  - John Smith');
    expect(output).toContain('JO  - Journal of AI Research');
    expect(output).toContain('PY  - 2024');
    expect(output).toContain('AB  - A comprehensive survey of deep learning methods.');
    expect(output).toContain('DO  - 10.1234/example');
    expect(output).toContain('ER  - ');
  });

  it('handles papers without optional fields', () => {
    const output = toRIS([mockPapers[1]]);
    expect(output).toContain('TY  - JOUR');
    expect(output).toContain('TI  - Transformer Architectures');
    expect(output).toContain('AU  - Alice Wang');
    expect(output).not.toContain('JO  -');
    expect(output).not.toContain('AB  -');
    expect(output).not.toContain('DO  -');
  });

  it('separates multiple entries with blank lines', () => {
    const output = toRIS(mockPapers);
    const entries = output.split('\n\n');
    expect(entries.length).toBe(2);
  });
});

describe('toEndNote', () => {
  it('produces valid XML structure', () => {
    const output = toEndNote(mockPapers);
    expect(output).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(output).toContain('<xml>');
    expect(output).toContain('<records>');
    expect(output).toContain('</records>');
    expect(output).toContain('</xml>');
  });

  it('includes paper details in record elements', () => {
    const output = toEndNote(mockPapers);
    expect(output).toContain('<title>Deep Learning for NLP</title>');
    expect(output).toContain('<journal>Journal of AI Research</journal>');
    expect(output).toContain('<year>2024</year>');
    expect(output).toContain('<doi>10.1234/example</doi>');
    expect(output).toContain('<author>Jane Doe</author>');
    expect(output).toContain('<author>John Smith</author>');
  });

  it('handles missing optional fields', () => {
    const output = toEndNote([mockPapers[1]]);
    expect(output).toContain('<title>Transformer Architectures</title>');
    expect(output).not.toContain('<journal>');
    expect(output).not.toContain('<doi>');
  });
});

describe('downloadExport', () => {
  let mockClick: ReturnType<typeof vi.fn>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let origCreateElement: typeof document.createElement;
  let origURL: typeof URL;

  beforeEach(() => {
    mockClick = vi.fn();
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();
    origCreateElement = document.createElement;
    origURL = window.URL;

    window.URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    } as unknown as typeof URL;

    document.createElement = vi.fn(() => ({
      href: '',
      download: '',
      click: mockClick,
    })) as unknown as typeof document.createElement;
  });

  afterEach(() => {
    window.URL = origURL;
    document.createElement = origCreateElement;
    vi.restoreAllMocks();
  });

  it('creates a blob and triggers download for BibTeX', () => {
    downloadExport(mockPapers, 'bibtex', 'Test Project');
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('creates a blob and triggers download for RIS', () => {
    downloadExport(mockPapers, 'ris', 'Test Project');
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  it('creates a blob and triggers download for EndNote', () => {
    downloadExport(mockPapers, 'endnote', 'Test Project');
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });
});

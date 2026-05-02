export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'gb_t_7714';

export const CITATION_STYLES: { value: CitationStyle; label: string }[] = [
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'ieee', label: 'IEEE' },
  { value: 'gb_t_7714', label: 'GB/T 7714' },
];

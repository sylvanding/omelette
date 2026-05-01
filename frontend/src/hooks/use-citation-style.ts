import { useState } from 'react';
import type { CitationStyle } from '@/components/citation/CitationStylePicker';

const STORAGE_KEY = 'omelette:citation-style';

export function useCitationStyle(defaultStyle: CitationStyle = 'gb_t_7714') {
  const [style, setStyle] = useState<CitationStyle>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['apa', 'mla', 'chicago', 'ieee', 'gb_t_7714'].includes(stored)) {
        return stored as CitationStyle;
      }
    } catch {
      // localStorage unavailable
    }
    return defaultStyle;
  });

  const updateStyle = (newStyle: CitationStyle) => {
    setStyle(newStyle);
    try {
      localStorage.setItem(STORAGE_KEY, newStyle);
    } catch {
      // localStorage unavailable
    }
  };

  return { style, setStyle: updateStyle };
}

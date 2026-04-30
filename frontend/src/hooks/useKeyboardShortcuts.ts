import { useEffect, useRef } from 'react';

interface Shortcut {
  key: string;
  callback: () => void;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], deps: unknown[] = []) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        const matchesKey = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesMeta = shortcut.metaKey ? e.metaKey : true;
        const matchesCtrl = shortcut.ctrlKey ? e.ctrlKey : true;
        const matchesShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;

        if (matchesKey && matchesMeta && matchesCtrl && matchesShift) {
          if (shortcut.preventDefault !== false) {
            e.preventDefault();
          }
          shortcut.callback();
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shortcuts managed via ref
  }, deps);
}

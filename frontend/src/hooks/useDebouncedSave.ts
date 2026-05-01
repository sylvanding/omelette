import { useRef, useCallback, useState, useEffect } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useDebouncedSave(
  saveFn: (content: string) => Promise<void>,
  delayMs: number,
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedContentRef = useRef<string>('');
  const pendingContentRef = useRef<string>('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const flushSave = useCallback(async () => {
    const content = pendingContentRef.current;
    if (content === savedContentRef.current) {
      setStatus('idle');
      return;
    }

    try {
      await saveFn(content);
      savedContentRef.current = content;
      if (!mountedRef.current) return;
      setStatus('saved');

      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setStatus((s) => (s === 'saved' ? 'idle' : s));
      }, 3000);
    } catch {
      if (!mountedRef.current) return;
      setStatus('error');
    }
  }, [saveFn]);

  const triggerSave = useCallback(
    (content: string) => {
      pendingContentRef.current = content;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setStatus('saving');

      timerRef.current = setTimeout(() => {
        void flushSave();
      }, delayMs);
    },
    [delayMs, flushSave],
  );

  return { status, triggerSave };
}

import { useState, useEffect, useRef } from 'react';

/**
 * Throttle a rapidly changing value (e.g. SSE streaming content).
 * Prevents excessive re-renders from per-token updates by batching
 * value changes within the given interval.
 */
export function useThrottledValue<T>(value: T, intervalMs = 60): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdate.current;

    if (elapsed >= intervalMs) {
      setThrottled(value);
      lastUpdate.current = now;
    } else {
      clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        setThrottled(value);
        lastUpdate.current = Date.now();
      }, intervalMs - elapsed);
    }

    return () => clearTimeout(pending.current);
  }, [value, intervalMs]);

  return throttled;
}

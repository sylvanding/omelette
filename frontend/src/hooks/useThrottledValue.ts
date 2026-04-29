/* eslint-disable react-hooks/refs -- intentional: ref-based throttle for streaming UX */
import { useState, useRef, useCallback } from 'react';

/**
 * Throttle a rapidly changing value (e.g. SSE streaming content).
 * Prevents excessive re-renders from per-token updates by batching
 * value changes within the given interval.
 */
export function useThrottledValue<T>(value: T, intervalMs = 60): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valueRef = useRef(value);
  valueRef.current = value;

  const throttledUpdate = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastUpdate.current;
    if (elapsed >= intervalMs) {
      setThrottled(valueRef.current);
      lastUpdate.current = now;
    } else {
      clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        setThrottled(valueRef.current);
        lastUpdate.current = Date.now();
      }, intervalMs - elapsed);
    }
  }, [intervalMs]);

  throttledUpdate();

  return throttled;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSave } from '../useDebouncedSave';

describe('useDebouncedSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns idle status initially', () => {
    const { result } = renderHook(() =>
      useDebouncedSave(async () => {}, 2000),
    );
    expect(result.current.status).toBe('idle');
  });

  it('transitions through saving -> saved after debounce', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 2000));

    act(() => {
      result.current.triggerSave('test content');
    });

    expect(result.current.status).toBe('saving');
    expect(saveFn).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(saveFn).toHaveBeenCalledWith('test content');
    expect(result.current.status).toBe('saved');
  });

  it('resets to idle after saved timeout', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 2000));

    act(() => {
      result.current.triggerSave('test');
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.status).toBe('saved');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.status).toBe('idle');
  });

  it('debounces rapid calls — only saves the latest value', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 2000));

    act(() => {
      result.current.triggerSave('first');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.triggerSave('second');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.triggerSave('third');
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('third');
  });

  it('sets error status when save fails', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDebouncedSave(saveFn, 2000));

    act(() => {
      result.current.triggerSave('fail');
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe('error');
  });

  it('only saves when content changes', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(saveFn, 2000));

    // First save
    act(() => {
      result.current.triggerSave('content');
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Same content again — should not trigger another save
    act(() => {
      result.current.triggerSave('content');
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(saveFn).toHaveBeenCalledTimes(1);
  });
});

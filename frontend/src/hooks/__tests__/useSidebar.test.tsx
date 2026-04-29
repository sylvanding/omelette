import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSidebarState } from '../use-sidebar';

describe('useSidebarState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to expanded sidebar', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.isExpanded).toBe(true);
  });

  it('starts with mobile sidebar closed', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.isMobileOpen).toBe(false);
  });

  it('toggles sidebar expansion', async () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.isExpanded).toBe(true);
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isExpanded).toBe(false);
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.isExpanded).toBe(true);
  });

  it('expands and collapses explicitly', async () => {
    const { result } = renderHook(() => useSidebarState());
    await act(async () => {
      result.current.collapse();
    });
    expect(result.current.isExpanded).toBe(false);
    await act(async () => {
      result.current.expand();
    });
    expect(result.current.isExpanded).toBe(true);
  });

  it('opens and closes mobile sidebar', async () => {
    const { result } = renderHook(() => useSidebarState());
    await act(async () => {
      result.current.openMobile();
    });
    expect(result.current.isMobileOpen).toBe(true);
    await act(async () => {
      result.current.closeMobile();
    });
    expect(result.current.isMobileOpen).toBe(false);
  });

  it('persists expansion state to localStorage', async () => {
    const { result } = renderHook(() => useSidebarState());
    await act(async () => {
      result.current.collapse();
    });
    await waitFor(() => {
      expect(localStorage.getItem('omelette-sidebar-expanded')).toBe('false');
    });
  });

  it('reads initial state from localStorage', () => {
    localStorage.setItem('omelette-sidebar-expanded', 'false');
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.isExpanded).toBe(false);
  });

  it('handles localStorage errors gracefully', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage error');
    });
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.isExpanded).toBe(true);
  });
});

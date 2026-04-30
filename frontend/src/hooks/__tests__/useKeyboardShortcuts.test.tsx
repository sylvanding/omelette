import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  it('calls callback when shortcut matches', () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: 'k', metaKey: true, ctrlKey: true, callback }]));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true }));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not call callback when modifier does not match', () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: 'k', metaKey: true, ctrlKey: true, callback }]));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(callback).not.toHaveBeenCalled();
  });

  it('calls callback for Escape key without modifiers', () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: 'Escape', callback }]));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('removes listener on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: 'k', metaKey: true, ctrlKey: true, callback }])
    );
    unmount();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true }));
    expect(callback).not.toHaveBeenCalled();
  });

  it('prevents default by default', () => {
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'n', metaKey: true, ctrlKey: true, callback: vi.fn() }])
    );

    const event = new KeyboardEvent('keydown', { key: 'n', metaKey: true, ctrlKey: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('does not prevent default when preventDefault is false', () => {
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', callback: vi.fn(), preventDefault: false }])
    );

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const STORAGE_KEY = 'omelette-sidebar-expanded';

interface SidebarState {
  isExpanded: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

export function useSidebarState(): SidebarState {
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isExpanded));
    } catch { /* noop */ }
  }, [isExpanded]);

  const toggle = useCallback(() => setIsExpanded((v) => !v), []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);
  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  return { isExpanded, isMobileOpen, toggle, expand, collapse, openMobile, closeMobile };
}

export { SidebarContext };

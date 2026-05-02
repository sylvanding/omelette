import { useEffect } from 'react';

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed — app still works offline
      });
    });
  }
}

export function useServiceWorker() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
}

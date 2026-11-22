// Stop Safari from zooming, scrolling, selecting text or showing callouts during play.
export function blockSafariGestures() {
  const prevent = (e: Event) => e.preventDefault();
  // iOS pinch-zoom gesture events (non-standard, Safari only)
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(t, prevent, { passive: false });
  }
  document.addEventListener('contextmenu', prevent);
  document.addEventListener('selectstart', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) e.preventDefault();
  });
  // Multi-touch zoom & pull-to-refresh: cancel touchmove unless inside a scrollable panel.
  document.addEventListener('touchmove', (e) => {
    const t = e.target as HTMLElement | null;
    if (e.touches.length > 1 || !t?.closest('.panel')) e.preventDefault();
  }, { passive: false });
  // Double-tap zoom
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 300) {
      const t = e.target as HTMLElement | null;
      if (!t || !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
}

let current: HTMLElement | null = null;

/** Show a single toast. duration 0 = stays until tapped. */
export function showToast(text: string, onTap?: () => void, duration = 3000) {
  current?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  el.addEventListener('pointerup', () => { onTap?.(); el.remove(); });
  document.getElementById('ui')!.appendChild(el);
  current = el;
  if (duration > 0) setTimeout(() => { if (current === el) { el.remove(); current = null; } }, duration);
}

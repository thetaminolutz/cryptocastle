// Simple engraved-style icons (inline SVG, no files).
const S = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="#f3e8cf" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const GLYPH: Record<string, string> = {
  attack: S('<path d="M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15Z"/><path d="M6 12l6 6"/><path d="M3 21l3-3"/>'),
  block: S('<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M12 7v10"/>'),
  dodge: S('<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>'),
  jump: S('<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>'),
  interact: S('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1-5.5-3L3.5 13.5a1.5 1.5 0 0 1 2.3-1.9L8 14"/>'),
  move: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
  look: S('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'),
  lock: S('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  build: S('<path d="M14 6l4 4-9 9H5v-4z"/><path d="M13 7l4 4"/>'),
  bow: S('<path d="M6 3c8 3 12 9 15 15"/><path d="M6 3l15 15"/><path d="M14 10l7-1-1 7"/>'),
  map: S('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>')
};

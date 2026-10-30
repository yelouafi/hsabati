import type { Theme } from './types';

const BG = { light: '#fbf6f3', dark: '#1d181b' };

/**
 * Light/dark: "auto" follows the phone. The choice is mirrored in
 * localStorage so index.html can apply it before the first paint.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try { localStorage.setItem('hsabati-theme', theme); } catch { /* private mode */ }
  // Status bar colour: each media-specific meta takes the forced colour.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => {
    m.content = theme === 'auto' ? (m.media.includes('dark') ? BG.dark : BG.light) : BG[theme];
  });
}

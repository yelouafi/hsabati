import { signal } from '@preact/signals';
import type { ComponentChild } from 'preact';
import { backupData, liveExpenses, now, saveSettings } from './store';
import { todayISO } from './format';

// ---------------------------------------------------------------- router

export const hash = signal(location.hash || '#/');
window.addEventListener('hashchange', () => { hash.value = location.hash || '#/'; });

export const go = (to: string) => { location.hash = to; };

// ---------------------------------------------------------------- sheet

// Opening pushes a history entry so Android's back button closes the sheet.
export const sheetContent = signal<ComponentChild | null>(null);
export const sheetOpen = signal(false);
let sheetHistory = false;
let sheetClosed: (() => void) | null = null;

export function openSheet(content: ComponentChild): void {
  sheetContent.value = content;
  requestAnimationFrame(() => { sheetOpen.value = true; });
  if (!sheetHistory) { history.pushState({ sheet: true }, ''); sheetHistory = true; }
}

function hideSheet() {
  sheetOpen.value = false;
  setTimeout(() => { if (!sheetOpen.value) sheetContent.value = null; }, 220);
}

/** Close the sheet; resolves once the history entry is popped (safe to navigate after). */
export function closeSheet(): Promise<void> {
  hideSheet();
  if (!sheetHistory) return Promise.resolve();
  return new Promise(resolve => { sheetClosed = resolve; history.back(); });
}

window.addEventListener('popstate', () => {
  if (!sheetHistory) return;
  sheetHistory = false;
  hideSheet();
  const done = sheetClosed;
  sheetClosed = null;
  done?.();
});

// ---------------------------------------------------------------- toast

export type ToastAction = { label: string; run: () => void };
export const toastState = signal<{ msg: ComponentChild; action?: ToastAction; key: number } | null>(null);
export const toastVisible = signal(false);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: ComponentChild, action?: ToastAction): void {
  toastState.value = { msg, action, key: now() };
  toastVisible.value = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2600);
}

export function hideToast(): void {
  toastVisible.value = false;
  setTimeout(() => { if (!toastVisible.value) toastState.value = null; }, 250);
}

// ---------------------------------------------------------------- effects

export function confetti(origin: Element): void {
  const box = origin.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.style.left = `${box.left + box.width / 2}px`;
  layer.style.top = `${box.top + box.height / 2}px`;
  const shapes = ['♥', '✿', '•', '✦'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const d = 50 + Math.random() * 60;
    s.textContent = shapes[i % shapes.length];
    s.style.setProperty('--x', `${Math.cos(a) * d}px`);
    s.style.setProperty('--y', `${Math.sin(a) * d - 30}px`);
    s.style.setProperty('--r', `${Math.random() * 180 - 90}deg`);
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 900);
}

// ---------------------------------------------------------------- files

/** Share (or download) a file. Resolves to false if the user cancelled. */
export async function shareOrDownload(name: string, type: string, content: string): Promise<boolean> {
  const file = new File([content], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function exportBackup(): Promise<void> {
  if (await shareOrDownload(`hsabati-${todayISO()}.json`, 'application/json', JSON.stringify(backupData()))) {
    await saveSettings({ lastBackupAt: now(), backupCount: liveExpenses.value.length });
  }
}

import { useEffect } from 'preact/hooks';
import { settings } from './lib/store';
import { applyTheme } from './lib/theme';
import { closeSheet, hash, hideToast, sheetContent, sheetOpen, toastState, toastVisible } from './lib/ui';
import { Icon } from './components/common';
import { AddScreen } from './screens/AddScreen';
import { ProjectScreen, ProjectsScreen } from './screens/ProjectsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

function Screen({ path }: { path: string }) {
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^#\/modifier\/(.+)$/))) return <AddScreen key={m[1]} editId={m[1]} />;
  if (path === '#/projets') return <ProjectsScreen />;
  if ((m = path.match(/^#\/projet\/(.+)$/))) return <ProjectScreen id={m[1]} />;
  if (path === '#/reglages') return <SettingsScreen />;
  return <AddScreen />;
}

const TABS = [
  { href: '#/', tab: 'add', label: 'Ajouter', icon: Icon.plus },
  { href: '#/projets', tab: 'projects', label: 'Projets', icon: Icon.pie },
  { href: '#/reglages', tab: 'settings', label: 'Réglages', icon: Icon.heart },
];

export function App() {
  const path = hash.value;
  const tab = path.startsWith('#/projet') ? 'projects' : path.startsWith('#/reglages') ? 'settings' : 'add';

  useEffect(() => { document.documentElement.dataset.accent = settings.value.accent; }, [settings.value.accent]);
  useEffect(() => applyTheme(settings.value.theme ?? 'auto'), [settings.value.theme]);
  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  const t = toastState.value;
  return (
    <>
      <main id="view"><Screen path={path} /></main>

      <nav class="tabs" aria-label="Navigation">
        {TABS.map(x => (
          <a key={x.tab} href={x.href} class={x.tab === tab ? 'active' : ''}><x.icon /><span>{x.label}</span></a>
        ))}
      </nav>

      <div class={`sheet ${sheetOpen.value ? 'open' : ''}`} hidden={!sheetContent.value}>
        <div class="sheet-backdrop" onClick={() => closeSheet()} />
        <div class="sheet-panel" role="dialog" aria-modal="true">
          <div class="sheet-grip" />
          {sheetContent.value}
        </div>
      </div>

      <div class={`toast ${toastVisible.value ? 'show' : ''}`} role="status" hidden={!t}>
        {t && (
          <>
            <span>{t.msg}</span>
            {t.action && <button type="button" onClick={() => { hideToast(); t.action!.run(); }}>{t.action.label}</button>}
          </>
        )}
      </div>
    </>
  );
}

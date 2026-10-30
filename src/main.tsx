import { render } from 'preact';
import { persist } from './lib/db';
import { todayISO } from './lib/format';
import { addDraft, load } from './lib/store';
import { hash } from './lib/ui';
import { registerServiceWorker } from './lib/sw';
import { App } from './App';
import './style.css';

// A backdated entry date should not silently stick around: after 30 min
// away, new expenses default to today again.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000 && addDraft.value.date !== todayISO()) {
    addDraft.value = { ...addDraft.value, date: todayISO() };
  }
});

await load();
if (!/^#\/(caisses|(caisse|poste|modifier)\/.+|reglages)?$/.test(hash.value)) location.replace('#/');
render(<App />, document.getElementById('app')!);
persist();
registerServiceWorker();

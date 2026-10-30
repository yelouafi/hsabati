import { todayISO } from '../lib/format';
import {
  fundById, lastBackupText, liveExpenses, liveIncomes, mergeIn, projectById, saveSettings, settings,
} from '../lib/store';
import { exportBackup, openSheet, shareOrDownload, toast } from '../lib/ui';
import { plural } from '../components/common';
import { ImportNotes } from '../components/sheets';
import type { Backup, Theme } from '../lib/types';

const THEMES: { id: Theme; name: string }[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'light', name: 'Clair' },
  { id: 'dark', name: 'Sombre' },
];

export const ACCENTS = [
  { id: 'rose', name: 'Rose poudré' },
  { id: 'terracotta', name: 'Terracotta' },
  { id: 'lavande', name: 'Lavande' },
  { id: 'sauge', name: 'Sauge' },
  { id: 'prune', name: 'Prune' },
];

function exportCSV() {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const num = (n: number) => String(n).replace('.', ',');
  type Row = { date: string; cols: string[] };
  const rows: Row[] = [];
  for (const e of liveExpenses.value) {
    const p = projectById(e.projectId);
    if (p) rows.push({ date: e.date, cols: [esc(fundById(p.fundId)?.name ?? ''), esc(p.name), 'Dépense', esc(e.note), num(-e.amount)] });
  }
  for (const i of liveIncomes.value) {
    const f = fundById(i.fundId);
    if (f) rows.push({ date: i.date, cols: [esc(f.name), '', 'Recette', esc(i.note), num(i.amount)] });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const lines = [['Date', 'Caisse', 'Poste', 'Type', 'Note', 'Montant (MAD)'].join(';'), ...rows.map(r => [r.date, ...r.cols].join(';'))];
  shareOrDownload(`hsabati-${todayISO()}.csv`, 'text/csv', '\ufeff' + lines.join('\r\n'));
}

async function restore(e: Event) {
  const input = e.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()) as Backup;
    if (data.app !== 'hsabati') throw new Error('not a backup');
    const n = await mergeIn(data);
    toast(n ? `Sauvegarde restaurée (${n} éléments)` : 'Déjà à jour');
  } catch {
    toast("Ce fichier n'est pas une sauvegarde Hsabati");
  }
}

export function SettingsScreen() {
  const nExp = liveExpenses.value.length;
  const nInc = liveIncomes.value.length;
  return (
    <section class="page">
      <header class="page-head"><h1>Réglages</h1></header>

      <div class="card block">
        <h2>Couleur de l'app</h2>
        <div class="accent-picker">
          {ACCENTS.map(a => (
            <button key={a.id} type="button" data-accent={a.id} class={a.id === settings.value.accent ? 'on' : ''}
              aria-label={a.name} onClick={() => saveSettings({ accent: a.id })}>
              <i /><span>{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div class="card block">
        <h2>Thème</h2>
        <div class="segmented" role="radiogroup" aria-label="Thème">
          {THEMES.map(t => {
            const on = (settings.value.theme ?? 'auto') === t.id;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={on} class={on ? 'on' : ''}
                onClick={() => saveSettings({ theme: t.id })}>{t.name}</button>
            );
          })}
        </div>
        <p class="muted small">Auto suit le réglage du téléphone.</p>
      </div>

      <div class="card block">
        <h2>Importer mes notes</h2>
        <p class="muted">Collez un texte au format caisses / postes / montants. Notes en désordre ? Faites-les d’abord mettre au propre par une IA (instructions fournies).</p>
        <button class="btn-soft" onClick={() => openSheet(<ImportNotes />)}>Coller mes notes</button>
      </div>

      <div class="card block">
        <h2>Sauvegarde</h2>
        <p class="muted">
          {plural(nExp, 'dépense')} et {plural(nInc, 'recette')} sur ce téléphone.
          Envoyez une copie sur Google Drive (ou WhatsApp) de temps en temps.
        </p>
        <p class="muted small">{lastBackupText()}</p>
        <div class="btn-row">
          <button class="btn-soft" onClick={exportBackup}>Sauvegarder</button>
          <button class="btn-soft" onClick={exportCSV}>Exporter en tableau</button>
          <label class="btn-ghost">Restaurer<input type="file" accept="application/json,.json" hidden onChange={restore} /></label>
        </div>
      </div>

      <p class="muted center small">Hsabati · vos données restent sur ce téléphone</p>
    </section>
  );
}

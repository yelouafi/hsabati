import { todayISO } from '../lib/format';
import {
  lastBackupText, liveExpenses, mergeIn, projectById, saveSettings, settings,
} from '../lib/store';
import { exportBackup, openSheet, shareOrDownload, toast } from '../lib/ui';
import { plural } from '../components/common';
import { ImportNotes } from '../components/sheets';
import type { Backup } from '../lib/types';

export const ACCENTS = [
  { id: 'rose', name: 'Rose poudré' },
  { id: 'terracotta', name: 'Terracotta' },
  { id: 'lavande', name: 'Lavande' },
  { id: 'sauge', name: 'Sauge' },
  { id: 'prune', name: 'Prune' },
];

function exportCSV() {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [['Date', 'Projet', 'Note', 'Montant (MAD)'].join(';')];
  const list = liveExpenses.value.filter(e => projectById(e.projectId)).sort((a, b) => a.date.localeCompare(b.date));
  for (const e of list) {
    rows.push([e.date, esc(projectById(e.projectId)!.name), esc(e.note), String(e.amount).replace('.', ',')].join(';'));
  }
  shareOrDownload(`hsabati-${todayISO()}.csv`, 'text/csv', '﻿' + rows.join('\r\n'));
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
  const n = liveExpenses.value.length;
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
        <h2>Importer mes notes</h2>
        <p class="muted">Collez vos notes du téléphone : les projets et les montants sont reconnus automatiquement.</p>
        <button class="btn-soft" onClick={() => openSheet(<ImportNotes />)}>Coller mes notes</button>
      </div>

      <div class="card block">
        <h2>Sauvegarde</h2>
        <p class="muted">
          {plural(n, 'dépense')} enregistrée{n > 1 ? 's' : ''} sur ce téléphone.
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

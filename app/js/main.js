import * as db from './db.js';
import { parseAmount, parseExpenseLine, parseNotes, groupNotes } from './parse.js';
import { money, money0, sum, todayISO, dayLabel, escapeHTML as h } from './format.js';

// ---------------------------------------------------------------- state

const ACCENTS = [
  { id: 'rose', name: 'Rose poudré' },
  { id: 'terracotta', name: 'Terracotta' },
  { id: 'lavande', name: 'Lavande' },
  { id: 'sauge', name: 'Sauge' },
  { id: 'prune', name: 'Prune' },
];
const PROJECT_COLORS = ['#e6849b', '#9a7fd1', '#5fa883', '#e39a4f', '#5f9fd3', '#c9765c', '#c9a227', '#a35a7e'];

const state = {
  projects: [],
  expenses: [],
  settings: { id: 'settings', accent: 'rose', lastProjectId: null },
  // The add screen keeps its draft across navigation within a session.
  draft: { amount: '', note: '', date: todayISO(), projectId: null },
};

const now = () => Date.now();
const live = list => list.filter(x => !x.deleted);
const projectById = id => state.projects.find(p => p.id === id && !p.deleted);
const expensesOf = id => live(state.expenses).filter(e => e.projectId === id);
const spentOf = id => sum(expensesOf(id).map(e => e.amount));
const activeProjects = () => live(state.projects).filter(p => !p.archived).sort((a, b) => a.createdAt - b.createdAt);

async function load() {
  const [projects, expenses, meta] = await Promise.all([db.getAll('projects'), db.getAll('expenses'), db.getAll('meta')]);
  state.projects = projects;
  state.expenses = expenses;
  Object.assign(state.settings, meta.find(m => m.id === 'settings'));
  applyAccent();
}

async function saveProject(p) {
  p.updatedAt = now();
  const i = state.projects.findIndex(x => x.id === p.id);
  if (i === -1) state.projects.push(p); else state.projects[i] = p;
  await db.put('projects', p);
}

async function saveExpense(e) {
  e.updatedAt = now();
  const i = state.expenses.findIndex(x => x.id === e.id);
  if (i === -1) state.expenses.push(e); else state.expenses[i] = e;
  await db.put('expenses', e);
}

async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await db.put('meta', { ...state.settings });
}

function newProject(name, budget) {
  const used = live(state.projects).length;
  return {
    id: db.uid(), name: name.trim(), budget: budget || 0,
    color: PROJECT_COLORS[used % PROJECT_COLORS.length],
    archived: false, createdAt: now(),
  };
}

/** Merge records by id, keeping the most recently updated (backup restore, future sync). */
async function mergeIn(data) {
  let changed = 0;
  for (const store of ['projects', 'expenses']) {
    const mine = new Map(state[store].map(r => [r.id, r]));
    const updates = [];
    for (const r of data[store] || []) {
      const cur = mine.get(r.id);
      if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { mine.set(r.id, r); updates.push(r); }
    }
    if (updates.length) await db.putMany(store, updates);
    state[store] = [...mine.values()];
    changed += updates.length;
  }
  return changed;
}

// ---------------------------------------------------------------- ui helpers

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

function applyAccent() {
  document.documentElement.dataset.accent = state.settings.accent;
}

function ring(pct, color, size = 56, stroke = 7) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(pct, 0), 1);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" stroke-linecap="round"
      transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-fg"/>
  </svg>`;
}

function budgetLine(p) {
  const spent = spentOf(p.id);
  if (!p.budget) return { spent, pct: 0, text: `${money0(spent)} MAD dépensés`, over: false };
  const rest = p.budget - spent;
  return {
    spent, pct: spent / p.budget, over: rest < 0,
    text: rest >= 0 ? `Reste ${money0(rest)} MAD` : `Dépassé de ${money0(-rest)} MAD`,
  };
}

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${msg}</span>${action ? `<button type="button">${h(action.label)}</button>` : ''}`;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  if (action) el.querySelector('button').onclick = () => { hideToast(); action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2600);
}
function hideToast() {
  const el = $('#toast');
  el.classList.remove('show');
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 250);
}

// Bottom sheet. Opening pushes a history entry so Android's back button closes it.
const sheet = $('#sheet');
let sheetHistory = false;
let sheetClosed = null;

function openSheet(html, mount) {
  const panel = sheet.querySelector('.sheet-panel');
  panel.innerHTML = `<div class="sheet-grip"></div>${html}`;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
  if (!sheetHistory) { history.pushState({ sheet: true }, ''); sheetHistory = true; }
  mount?.(panel);
}

function hideSheet() {
  sheet.classList.remove('open');
  setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 220);
}

/** Close the sheet; resolves once the history entry is popped (safe to navigate after). */
function closeSheet() {
  hideSheet();
  if (!sheetHistory) return Promise.resolve();
  return new Promise(resolve => { sheetClosed = resolve; history.back(); });
}

window.addEventListener('popstate', () => {
  if (sheetHistory) {
    sheetHistory = false;
    hideSheet();
    const done = sheetClosed; sheetClosed = null;
    done?.();
  }
});
sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

function confetti(origin) {
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

// ---------------------------------------------------------------- router

const routes = [
  [/^#?\/?$/, renderAdd],
  [/^#\/modifier\/(.+)$/, id => renderAdd(id)],
  [/^#\/projets$/, renderProjects],
  [/^#\/projet\/(.+)$/, renderProject],
  [/^#\/reglages$/, renderSettings],
];

function route() {
  if (sheetHistory) return;
  const hash = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      if (addKeyHandler) { document.removeEventListener('keydown', addKeyHandler); addKeyHandler = null; }
      if (!hash.startsWith('#/modifier')) editDraft = null;
      const tab = hash.startsWith('#/projet') ? 'projects' : hash.startsWith('#/reglages') ? 'settings' : 'add';
      document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      view.scrollTop = 0;
      window.scrollTo(0, 0);
      fn(m[1]);
      return;
    }
  }
  location.replace('#/');
}

// ---------------------------------------------------------------- add / edit

function formatDraft(s) {
  if (!s) return '0';
  const [int, dec] = s.split(',');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec !== undefined ? `${grouped},${dec}` : grouped;
}

let editDraft = null;
let addKeyHandler = null;

function renderAdd(editId) {
  const editing = editId ? state.expenses.find(e => e.id === editId && !e.deleted) : null;
  if (editId && !editing) { location.replace('#/'); return; }

  // Edits use their own draft so the add draft is not lost.
  if (editing && editDraft?.id !== editId) {
    editDraft = { id: editId, amount: String(editing.amount).replace('.', ','), note: editing.note || '', date: editing.date, projectId: editing.projectId };
  }
  const d = editing ? editDraft : state.draft;
  const projects = activeProjects();
  if (editing && !projects.some(p => p.id === d.projectId)) {
    const p = projectById(d.projectId); if (p) projects.push(p);
  }
  if (!projects.some(p => p.id === d.projectId)) {
    d.projectId = projects.find(p => p.id === state.settings.lastProjectId)?.id ?? projects[0]?.id ?? null;
  }

  view.innerHTML = `
  <section class="add">
    <header class="add-head">
      ${editing
        ? `<button class="icon-btn" data-act="back" aria-label="Retour">${ICON.back}</button><h1 class="title-sm">Modifier</h1>`
        : `<h1 class="title-sm">Nouvelle dépense</h1>`}
      <label class="date-chip">
        ${ICON.calendar}<span data-date-label>${h(dayLabel(d.date))}</span>
        <input type="date" value="${d.date}" max="${todayISO()}" aria-label="Date">
      </label>
    </header>

    <div class="amount" aria-live="polite">
      <span class="amount-value ${d.amount ? '' : 'empty'}">${formatDraft(d.amount)}</span><span class="amount-cur">MAD</span>
    </div>
    <p class="amount-hint" data-hint></p>

    <div class="chips" role="radiogroup" aria-label="Projet">
      ${projects.map(p => `
        <button type="button" class="chip ${p.id === d.projectId ? 'on' : ''}" role="radio"
          aria-checked="${p.id === d.projectId}" data-project="${p.id}" style="--c:${p.color}">
          <i></i>${h(p.name)}
        </button>`).join('')}
      <button type="button" class="chip chip-add" data-act="new-project">${projects.length ? '+' : '+ Créer mon premier projet'}</button>
    </div>

    <input class="note" type="text" placeholder="Note (facultatif) — ex. menuisier" value="${h(d.note)}"
      enterkeyhint="done" autocomplete="off" list="note-suggestions" maxlength="80">
    <datalist id="note-suggestions"></datalist>

    <div class="keypad">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map(k =>
        `<button type="button" data-key="${k}" ${k === 'del' ? 'aria-label="Effacer"' : ''}>${k === 'del' ? ICON.del : k}</button>`).join('')}
    </div>

    <div class="add-actions">
      ${editing ? `<button type="button" class="btn-ghost danger" data-act="delete">Supprimer</button>` : ''}
      <button type="button" class="btn-primary" data-act="save">${editing ? 'Enregistrer' : 'Ajouter'}</button>
    </div>
  </section>`;

  const valueEl = $('.amount-value', view);
  const saveBtn = $('[data-act="save"]', view);
  const hint = $('[data-hint]', view);
  const noteInput = $('.note', view);

  const refresh = () => {
    valueEl.textContent = formatDraft(d.amount);
    valueEl.classList.toggle('empty', !d.amount);
    const amount = parseAmount(d.amount) || 0;
    saveBtn.disabled = !(amount > 0 && d.projectId);
    const p = projectById(d.projectId);
    if (!p) { hint.textContent = projects.length ? 'Choisissez un projet' : ''; return; }
    const already = editing && editing.projectId === p.id ? editing.amount : 0;
    if (p.budget) {
      const rest = p.budget - spentOf(p.id) + already - amount;
      hint.textContent = rest >= 0 ? `${p.name} · il restera ${money0(rest)} MAD` : `${p.name} · dépassement de ${money0(-rest)} MAD`;
      hint.classList.toggle('over', rest < 0);
    } else {
      hint.textContent = `${p.name} · ${money0(spentOf(p.id) - already + amount)} MAD au total`;
      hint.classList.remove('over');
    }
    // Suggest notes already used on this project.
    const notes = [...new Set(expensesOf(p.id).sort((a, b) => b.createdAt - a.createdAt).map(e => e.note).filter(Boolean))].slice(0, 12);
    $('#note-suggestions').innerHTML = notes.map(n => `<option value="${h(n)}">`).join('');
  };
  refresh();

  // Keypad: pointerdown for an instant response; long-press on ⌫ clears.
  let holdTimer;
  const press = key => {
    let a = d.amount;
    if (key === 'del') a = a.slice(0, -1);
    else if (key === ',') { if (!a.includes(',')) a = (a || '0') + ','; }
    else {
      const [int, dec] = a.split(',');
      if (dec !== undefined) { if (dec.length < 2) a += key; }
      else if (int.length < 9) a = int === '0' ? key : a + key;
    }
    d.amount = a;
    refresh();
  };
  $('.keypad', view).addEventListener('pointerdown', e => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 120);
    press(b.dataset.key);
    if (b.dataset.key === 'del') holdTimer = setTimeout(() => { d.amount = ''; refresh(); navigator.vibrate?.(10); }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => $('.keypad', view).addEventListener(t, () => clearTimeout(holdTimer)));

  // Physical keyboard (desktop testing, or a Bluetooth keyboard).
  const onKey = e => {
    if (document.activeElement === noteInput || !sheet.hidden) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === ',' || e.key === '.') press(',');
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter' && !saveBtn.disabled) saveBtn.click();
    else return;
    e.preventDefault();
  };
  if (addKeyHandler) document.removeEventListener('keydown', addKeyHandler);
  addKeyHandler = onKey;
  document.addEventListener('keydown', onKey);

  noteInput.addEventListener('input', () => { d.note = noteInput.value; });
  noteInput.addEventListener('keydown', e => { if (e.key === 'Enter') noteInput.blur(); });

  const dateInput = $('.date-chip input', view);
  dateInput.addEventListener('change', () => {
    d.date = dateInput.value || todayISO();
    $('[data-date-label]', view).textContent = dayLabel(d.date);
  });

  view.querySelector('.chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-project]');
    if (!chip) return;
    d.projectId = chip.dataset.project;
    view.querySelectorAll('.chip[data-project]').forEach(c => {
      const on = c === chip;
      c.classList.toggle('on', on);
      c.setAttribute('aria-checked', on);
    });
    refresh();
  });

  view.onclick = async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') history.back();
    if (act === 'new-project') projectSheet(null, p => { d.projectId = p.id; renderAdd(editId); });
    if (act === 'delete') {
      editing.deleted = true;
      await saveExpense(editing);
      history.back();
      toast('Dépense supprimée', { label: 'Annuler', run: async () => { editing.deleted = false; await saveExpense(editing); route(); } });
    }
    if (act === 'save') {
      const amount = parseAmount(d.amount);
      if (!(amount > 0) || !d.projectId) return;
      if (editing) {
        Object.assign(editing, { amount, note: d.note.trim(), date: d.date, projectId: d.projectId });
        await saveExpense(editing);
        history.back();
        toast('Dépense modifiée');
        return;
      }
      const exp = { id: db.uid(), projectId: d.projectId, amount, note: d.note.trim(), date: d.date, createdAt: now() };
      await saveExpense(exp);
      await saveSettings({ lastProjectId: d.projectId });
      navigator.vibrate?.(15);
      confetti(saveBtn);
      const p = projectById(d.projectId);
      const b = budgetLine(p);
      const pct = p.budget ? ` · ${Math.round(b.pct * 100)} % du budget` : '';
      toast(`<b>${money(amount)} MAD</b> · ${h(p.name)}${pct}`, {
        label: 'Annuler',
        run: async () => { exp.deleted = true; await saveExpense(exp); if (!location.hash || location.hash === '#/') renderAdd(); },
      });
      d.amount = '';
      d.note = '';
      noteInput.value = '';
      refresh();
    }
  };
}

// ---------------------------------------------------------------- projects

function renderProjects() {
  const all = live(state.projects).sort((a, b) => a.createdAt - b.createdAt);
  const active = all.filter(p => !p.archived);
  const done = all.filter(p => p.archived);
  const budgeted = active.filter(p => p.budget);
  const totalSpent = sum(active.map(p => spentOf(p.id)));
  const totalBudget = sum(budgeted.map(p => p.budget));

  const card = p => {
    const b = budgetLine(p);
    const n = expensesOf(p.id).length;
    return `
    <a class="card project-card ${b.over ? 'over' : ''}" href="#/projet/${p.id}" style="--c:${p.color}">
      <div class="ring-wrap">${ring(p.budget ? b.pct : 1, b.over ? 'var(--danger)' : p.budget ? p.color : `color-mix(in srgb, ${p.color} 35%, transparent)`)}
        <span>${p.budget ? `${Math.round(b.pct * 100)}%` : ''}</span></div>
      <div class="project-info">
        <strong>${h(p.name)}</strong>
        <span class="muted">${money0(b.spent)}${p.budget ? ` / ${money0(p.budget)}` : ''} MAD · ${n} dépense${n > 1 ? 's' : ''}</span>
        <span class="rest">${p.budget ? b.text : ''}</span>
      </div>
      ${ICON.chevron}
    </a>`;
  };

  view.innerHTML = `
  <section class="page">
    <header class="page-head">
      <h1>Mes projets</h1>
      <button class="btn-soft" data-act="new">+ Nouveau</button>
    </header>
    ${active.length ? `
      <div class="summary">
        <span class="muted">Total dépensé</span>
        <strong class="big-num">${money0(totalSpent)} <small>MAD</small></strong>
        ${totalBudget ? `<span class="muted">sur ${money0(totalBudget)} MAD de budget</span>` : ''}
      </div>
      <div class="list">${active.map(card).join('')}</div>`
    : `<div class="empty-state">
        <div class="empty-art">✿</div>
        <p>Aucun projet pour l'instant.</p>
        <p class="muted">Créez un projet avec son budget, puis ajoutez vos dépenses en deux secondes.</p>
        <button class="btn-primary" data-act="new">Créer un projet</button>
      </div>`}
    ${done.length ? `
      <details class="archived">
        <summary>Projets terminés (${done.length})</summary>
        <div class="list">${done.map(card).join('')}</div>
      </details>` : ''}
  </section>`;

  view.onclick = e => {
    if (e.target.closest('[data-act="new"]')) projectSheet(null, () => renderProjects());
  };
}

function renderProject(id) {
  const p = projectById(id);
  if (!p) { location.replace('#/projets'); return; }
  const b = budgetLine(p);
  const list = expensesOf(id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const byDay = [];
  for (const e of list) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === e.date) last.items.push(e); else byDay.push({ date: e.date, items: [e] });
  }

  view.innerHTML = `
  <section class="page">
    <header class="page-head">
      <button class="icon-btn" data-act="back" aria-label="Retour">${ICON.back}</button>
      <h1 class="title-sm ellipsis">${h(p.name)}</h1>
      <button class="icon-btn" data-act="edit" aria-label="Modifier le projet">${ICON.edit}</button>
    </header>

    <div class="card hero ${b.over ? 'over' : ''}" style="--c:${p.color}">
      <div class="ring-wrap lg">${ring(p.budget ? b.pct : 1, b.over ? 'var(--danger)' : p.budget ? p.color : `color-mix(in srgb, ${p.color} 35%, transparent)`, 112, 11)}
        <span>${p.budget ? `${Math.round(b.pct * 100)}%` : ''}</span></div>
      <div class="hero-nums">
        <span class="muted">Dépensé</span>
        <strong class="big-num">${money(b.spent)} <small>MAD</small></strong>
        ${p.budget ? `<span class="muted">Budget ${money0(p.budget)} MAD</span><span class="rest">${b.text}</span>` : `<button class="link" data-act="edit">Définir un budget</button>`}
      </div>
    </div>

    <button class="btn-primary wide" data-act="add">+ Ajouter une dépense</button>

    ${byDay.length ? byDay.map(g => `
      <h2 class="day">${h(dayLabel(g.date))}<span>${money(sum(g.items.map(e => e.amount)))} MAD</span></h2>
      <div class="card rows">
        ${g.items.map(e => `
          <a class="row" href="#/modifier/${e.id}">
            <span class="${e.note ? '' : 'muted'}">${e.note ? h(e.note) : 'Sans note'}</span>
            <strong>${money(e.amount)}</strong>
          </a>`).join('')}
      </div>`).join('')
    : `<p class="muted center pad">Pas encore de dépense sur ce projet.</p>`}
  </section>`;

  view.onclick = e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') location.hash = '#/projets';
    if (act === 'edit') projectSheet(p, () => renderProject(id));
    if (act === 'add') { state.draft.projectId = id; location.hash = '#/'; }
  };
}

function projectSheet(p, onSaved) {
  const editing = !!p;
  const color = p?.color ?? PROJECT_COLORS[live(state.projects).length % PROJECT_COLORS.length];
  openSheet(`
    <h2>${editing ? 'Modifier le projet' : 'Nouveau projet'}</h2>
    <form class="form" autocomplete="off">
      <label>Nom<input name="name" required maxlength="40" placeholder="ex. Salon, Cuisine…" value="${h(p?.name ?? '')}"></label>
      <label>Budget (MAD, facultatif)
        <input name="budget" inputmode="decimal" placeholder="ex. 20 000" value="${p?.budget ? money(p.budget) : ''}">
      </label>
      <fieldset class="swatches"><legend>Couleur</legend>
        ${PROJECT_COLORS.map(c => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><i></i></label>`).join('')}
      </fieldset>
      ${editing ? `<label class="switch"><input type="checkbox" name="archived" ${p.archived ? 'checked' : ''}><span>Projet terminé (masqué de la saisie)</span></label>` : ''}
      <div class="form-actions">
        ${editing ? `<button type="button" class="btn-ghost danger" data-act="delete">Supprimer</button>` : `<button type="button" class="btn-ghost" data-close>Annuler</button>`}
        <button class="btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`, panel => {
    const form = $('form', panel);
    if (!editing) setTimeout(() => form.name.focus(), 250);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) return;
      const budget = parseAmount(form.budget.value) || 0;
      const proj = editing ? p : newProject(name, budget);
      Object.assign(proj, { name, budget, color: form.color.value, archived: !!form.archived?.checked });
      await saveProject(proj);
      await closeSheet();
      onSaved(proj);
      if (!editing) toast(`Projet <b>${h(name)}</b> créé`);
    });
    $('[data-act="delete"]', panel)?.addEventListener('click', async () => {
      const n = expensesOf(p.id).length;
      if (!confirm(`Supprimer « ${p.name} »${n ? ` et ses ${n} dépense${n > 1 ? 's' : ''}` : ''} ?`)) return;
      p.deleted = true;
      // Its expenses stay in storage but are hidden along with the project.
      await saveProject(p);
      await closeSheet();
      location.hash = '#/projets';
    });
  });
}

// ---------------------------------------------------------------- settings

function renderSettings() {
  const nExp = live(state.expenses).length;
  view.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>Réglages</h1></header>

    <div class="card block">
      <h2>Couleur de l'app</h2>
      <div class="accent-picker">
        ${ACCENTS.map(a => `
          <button type="button" data-accent="${a.id}" class="${a.id === state.settings.accent ? 'on' : ''}" aria-label="${a.name}">
            <i></i><span>${a.name}</span>
          </button>`).join('')}
      </div>
    </div>

    <div class="card block">
      <h2>Importer mes notes</h2>
      <p class="muted">Collez vos notes du téléphone : les projets et les montants sont reconnus automatiquement.</p>
      <button class="btn-soft" data-act="import-notes">Coller mes notes</button>
    </div>

    <div class="card block">
      <h2>Sauvegarde</h2>
      <p class="muted">${nExp} dépense${nExp > 1 ? 's' : ''} enregistrée${nExp > 1 ? 's' : ''} sur ce téléphone. Envoyez une copie sur Google Drive (ou WhatsApp) de temps en temps.</p>
      <div class="btn-row">
        <button class="btn-soft" data-act="export">Sauvegarder</button>
        <button class="btn-soft" data-act="csv">Exporter en tableau</button>
        <label class="btn-ghost">Restaurer<input type="file" accept="application/json,.json" hidden data-restore></label>
      </div>
    </div>

    <p class="muted center small">Hsabati · vos données restent sur ce téléphone</p>
  </section>`;

  view.onclick = async e => {
    const accent = e.target.closest('button[data-accent]')?.dataset.accent;
    if (accent) {
      await saveSettings({ accent });
      applyAccent();
      view.querySelectorAll('button[data-accent]').forEach(b => b.classList.toggle('on', b.dataset.accent === accent));
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'import-notes') importNotesSheet();
    if (act === 'export') exportJSON();
    if (act === 'csv') exportCSV();
  };
  $('[data-restore]', view).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'hsabati') throw new Error();
      const n = await mergeIn(data);
      toast(n ? `Sauvegarde restaurée (${n} éléments)` : 'Déjà à jour');
      renderSettings();
    } catch {
      toast("Ce fichier n'est pas une sauvegarde Hsabati");
    }
  });
}

async function shareOrDownload(name, type, content) {
  const file = new File([content], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON() {
  const data = { app: 'hsabati', version: 1, exportedAt: new Date().toISOString(), projects: state.projects, expenses: state.expenses };
  shareOrDownload(`hsabati-${todayISO()}.json`, 'application/json', JSON.stringify(data));
}

function exportCSV() {
  const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Projet', 'Note', 'Montant (MAD)'].join(';')];
  const list = live(state.expenses).filter(e => projectById(e.projectId)).sort((a, b) => a.date.localeCompare(b.date));
  for (const e of list) {
    rows.push([e.date, esc(projectById(e.projectId).name), esc(e.note), String(e.amount).replace('.', ',')].join(';'));
  }
  shareOrDownload(`hsabati-${todayISO()}.csv`, 'text/csv', '﻿' + rows.join('\r\n'));
}

function importNotesSheet() {
  let lines = [];
  openSheet(`
    <h2>Importer mes notes</h2>
    <form class="form">
      <div class="paste-box">
        <textarea rows="6" placeholder="Collez vos notes ici…"></textarea>
        <button type="button" class="btn-soft paste-btn" data-paste hidden>Coller</button>
      </div>
      <p class="muted small example">Par exemple :<br><b>Salon</b><br>menuisier: 1500<br>peinture 300+150</p>
      <label>Date de ces dépenses<input type="date" name="date" value="${todayISO()}" max="${todayISO()}"></label>
      <div class="preview"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close>Annuler</button>
        <button class="btn-primary" disabled>Importer</button>
      </div>
    </form>`, panel => {
    const form = $('form', panel);
    const area = $('textarea', panel);
    const preview = $('.preview', panel);
    const btn = $('.btn-primary', panel);
    const pasteBtn = $('[data-paste]', panel);
    const example = $('.example', panel);

    const draw = () => {
      const groups = groupNotes(lines);
      const nExp = groups.reduce((t, g) => t + g.expenses.length, 0);
      btn.disabled = !nExp;
      btn.textContent = nExp ? `Importer ${nExp} dépense${nExp > 1 ? 's' : ''}` : 'Importer';
      pasteBtn.hidden = !navigator.clipboard?.readText || !!area.value;
      example.hidden = !!area.value;
      preview.innerHTML = lines.length ? `
        <p class="muted small">Touchez une ligne si elle est mal reconnue.</p>
        ${lines.map((l, i) => l.type === 'header'
          ? `<button type="button" class="pv pv-head" data-i="${i}">${h(l.name)}${projectExists(l.name) ? '' : ' <em>nouveau</em>'}</button>`
          : `<button type="button" class="pv" data-i="${i}"><span>${h(l.label) || '<i class="muted">sans note</i>'}</span><b>${money(l.amount)}</b></button>`).join('')}` : '';
    };
    area.addEventListener('input', () => { lines = parseNotes(area.value); draw(); });
    pasteBtn.addEventListener('click', async () => {
      try {
        area.value = await navigator.clipboard.readText();
        area.dispatchEvent(new Event('input'));
      } catch {
        area.focus();
        toast('Appuyez longuement dans la zone puis « Coller »');
      }
    });
    draw();
    preview.addEventListener('click', e => {
      const i = e.target.closest('[data-i]')?.dataset.i;
      if (i == null) return;
      const l = lines[i];
      if (l.type === 'expense') lines[i] = { type: 'header', raw: l.raw, name: l.raw.replace(/[:\s]+$/, '') };
      else {
        const exp = parseExpenseLine(l.raw);
        if (exp) lines[i] = { type: 'expense', raw: l.raw, ...exp };
      }
      draw();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const date = form.date.value || todayISO();
      let n = 0;
      for (const g of groupNotes(lines)) {
        let p = projectExists(g.name);
        if (!p) { p = newProject(g.name, 0); await saveProject(p); }
        for (const x of g.expenses) {
          await saveExpense({ id: db.uid(), projectId: p.id, amount: x.amount, note: x.label, date, createdAt: now() + n++ });
        }
      }
      await closeSheet();
      toast(`${n} dépense${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''} ✿`);
      location.hash = '#/projets';
    });
  });
}

function projectExists(name) {
  const k = name.trim().toLocaleLowerCase('fr');
  return live(state.projects).find(p => p.name.toLocaleLowerCase('fr') === k);
}

// ---------------------------------------------------------------- icons

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  calendar: svg('<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>'),
  del: svg('<path d="M9 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-6-6z"/><path d="M12 10l4 4M16 10l-4 4"/>'),
};

// ---------------------------------------------------------------- boot

window.addEventListener('hashchange', route);
await load();
route();
db.persist();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  const started = Date.now();
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Home-screen apps are resumed rather than relaunched: check on resume too.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  });
  // A new version took over: reload to show it, unless she is mid-entry.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const busy = state.draft.amount || !sheet.hidden;
    if (!busy || Date.now() - started < 3000) location.reload();
    else toast('Nouvelle version disponible', { label: 'Mettre à jour', run: () => location.reload() });
  });
}

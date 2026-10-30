import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal, useSignal, type Signal } from '@preact/signals';
import { parseAmount } from '../lib/parse';
import { dayLabel, money, money0, todayISO } from '../lib/format';
import {
  activeProjects, addDraft, budgetStatus, expenses, expensesOf, newExpense, projectById, saveExpense,
  saveSettings, settings, spentOf, type Draft,
} from '../lib/store';
import { confetti, openSheet, sheetOpen, toast } from '../lib/ui';
import { Icon } from '../components/common';
import { PickProject, ProjectForm } from '../components/sheets';
import type { Expense, Project } from '../lib/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const;

/** "1500,5" → "1 500,5" (narrow no-break spaces). */
function formatDraft(s: string): string {
  if (!s) return '0';
  const [int, dec] = s.split(',');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec !== undefined ? `${grouped},${dec}` : grouped;
}

function typeKey(a: string, key: string): string {
  if (key === 'del') return a.slice(0, -1);
  if (key === ',') return a.includes(',') ? a : (a || '0') + ',';
  const [int, dec] = a.split(',');
  if (dec !== undefined) return dec.length < 2 ? a + key : a;
  if (int.length >= 9) return a;
  return int === '0' ? key : a + key;
}

export function AddScreen({ editId }: { editId?: string }) {
  const editing = editId ? expenses.value.find(e => e.id === editId && !e.deleted) : undefined;
  // Edits get their own draft so the add draft is not lost.
  const draft = useMemo<Signal<Draft>>(() => (editing
    ? signal({ amount: String(editing.amount).replace('.', ','), note: editing.note, date: editing.date, projectId: editing.projectId })
    : addDraft), [editId]);

  if (editId && !editing) {
    location.replace('#/');
    return null;
  }
  return <AddForm draft={draft} editing={editing} />;
}

function AddForm({ draft, editing }: { draft: Signal<Draft>; editing?: Expense }) {
  const d = draft.value;
  const set = (patch: Partial<Draft>) => { draft.value = { ...draft.value, ...patch }; };

  const projects = activeProjects.value.slice();
  if (editing && !projects.some(p => p.id === d.projectId)) {
    const p = projectById(d.projectId);
    if (p) projects.push(p);
  }
  // Default to the last used project.
  if (!projects.some(p => p.id === d.projectId)) {
    const fallback = projects.find(p => p.id === settings.value.lastProjectId)?.id ?? projects[0]?.id ?? null;
    if (fallback !== d.projectId) queueMicrotask(() => set({ projectId: fallback }));
  }

  const project = projectById(d.projectId);
  const amount = parseAmount(d.amount) || 0;
  const canSave = amount > 0 && !!project;
  const saveRef = useRef<HTMLButtonElement>(null);

  const press = (key: string) => set({ amount: typeKey(draft.value.amount, key) });

  // Physical keyboard (desktop testing, or a Bluetooth keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea') || sheetOpen.value) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') saveRef.current?.click();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [draft]);

  const save = async () => {
    if (!canSave || !project) return;
    const fields = { amount, note: d.note.trim(), date: d.date, projectId: project.id };
    if (editing) {
      await saveExpense({ ...editing, ...fields });
      history.back();
      toast('Dépense modifiée');
      return;
    }
    const exp = await saveExpense(newExpense(fields));
    await saveSettings({ lastProjectId: project.id });
    navigator.vibrate?.(15);
    if (saveRef.current) confetti(saveRef.current);
    const b = budgetStatus(project);
    toast(
      <><b>{money(amount)} MAD</b> · {project.name}{project.budget ? ` · ${Math.round(b.pct * 100)} % du budget` : ''}</>,
      { label: 'Annuler', run: () => saveExpense({ ...exp, deleted: true }) },
    );
    set({ amount: '', note: '' });
  };

  const remove = async () => {
    if (!editing) return;
    await saveExpense({ ...editing, deleted: true });
    history.back();
    toast('Dépense supprimée', { label: 'Annuler', run: () => saveExpense({ ...editing, deleted: false }) });
  };

  return (
    <section class="add">
      <header class="add-head">
        {editing && <button class="icon-btn" aria-label="Retour" onClick={() => history.back()}><Icon.back /></button>}
        <h1 class="title-sm">{editing ? 'Modifier' : 'Nouvelle dépense'}</h1>
        <label class={`date-chip ${d.date === todayISO() ? '' : 'past'}`}>
          <Icon.calendar /><span>{dayLabel(d.date)}</span>
          <input type="date" value={d.date} max={todayISO()} aria-label="Date"
            onChange={e => set({ date: e.currentTarget.value || todayISO() })} />
        </label>
      </header>

      <AmountZone value={d.amount} amount={amount} project={project} editing={editing} hasProjects={projects.length > 0} />

      <ProjectChips projects={projects} selected={d.projectId} onSelect={id => set({ projectId: id })} />

      <NoteInput value={d.note} projectId={d.projectId} onChange={note => set({ note })} />

      <Keypad onKey={press} onClear={() => set({ amount: '' })} />

      <div class="add-actions">
        {editing && <button type="button" class="btn-ghost danger" onClick={remove}>Supprimer</button>}
        <button ref={saveRef} type="button" class="btn-primary" disabled={!canSave} onClick={save}>
          {editing ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </section>
  );
}

function AmountZone({ value, amount, project, editing, hasProjects }: {
  value: string; amount: number; project?: Project; editing?: Expense; hasProjects: boolean;
}) {
  const shown = formatDraft(value);
  let hint = project ? '' : hasProjects ? 'Choisissez un projet' : '';
  let over = false;
  let meter: { spent: string; added: string } | null = null;
  if (project) {
    const before = spentOf(project.id) - (editing?.projectId === project.id ? editing.amount : 0);
    if (project.budget) {
      const rest = project.budget - before - amount;
      over = rest < 0;
      hint = over ? `${project.name} · dépassement de ${money0(-rest)} MAD` : `${project.name} · il restera ${money0(rest)} MAD`;
      // Bar: already spent, then the amount being typed in a lighter shade.
      const pct = (n: number) => `${Math.min(Math.max(n / Math.max(project.budget, before + amount), 0), 1) * 100}%`;
      meter = { spent: pct(before), added: pct(amount) };
    } else {
      hint = `${project.name} · ${money0(before + amount)} MAD au total`;
    }
  }
  const size = shown.length > 8 ? 'xlong' : shown.length > 5 ? 'long' : '';
  return (
    <div class="amount-zone">
      <div class="amount" aria-live="polite">
        <span class={`amount-value ${value ? '' : 'empty'} ${size}`}>{shown}</span><span class="amount-cur">MAD</span>
      </div>
      <p class={`amount-hint ${over ? 'over' : ''}`}>{hint}</p>
      {meter && project && (
        <div class={`meter ${over ? 'over' : ''}`} style={{ '--c': project.color }}>
          <i class="meter-spent" style={{ width: meter.spent }} /><i class="meter-new" style={{ width: meter.added }} />
        </div>
      )}
    </div>
  );
}

/**
 * Project chips stay on at most two rows: with many projects, the least
 * recently used ones hide behind an "Autres" chip (the selected one always
 * stays visible).
 */
function ProjectChips({ projects, selected, onSelect }: { projects: Project[]; selected: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const width = useSignal(innerWidth);
  useEffect(() => {
    const onResize = () => { width.value = innerWidth; };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const ids = projects.map(p => p.id).join();
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const chips = [...box.querySelectorAll<HTMLElement>('[data-project]')];
    const more = box.querySelector<HTMLElement>('.chip-more')!;
    chips.forEach(c => { c.hidden = false; });
    more.hidden = true;
    const rows = () => new Set([...box.children].filter(c => !(c as HTMLElement).hidden).map(c => (c as HTMLElement).offsetTop)).size;
    const next: string[] = [];
    if (rows() > 2) {
      more.hidden = false;
      const lastUse = (id: string) => Math.max(0, ...expensesOf(id).map(e => e.createdAt), projectById(id)?.createdAt ?? 0);
      const leastUsed = chips.filter(c => c.dataset.project !== selected)
        .sort((a, b) => lastUse(a.dataset.project!) - lastUse(b.dataset.project!));
      for (const c of leastUsed) {
        c.hidden = true;
        next.push(c.dataset.project!);
        if (rows() <= 2) break;
      }
    }
    if (next.join() !== hidden.join()) setHidden(next);
  }, [ids, selected, width.value]);

  const newProject = () => openSheet(<ProjectForm onSaved={p => onSelect(p.id)} />);
  return (
    <div class="chips" role="radiogroup" aria-label="Projet" ref={ref}>
      {projects.map(p => (
        <button key={p.id} type="button" class={`chip ${p.id === selected ? 'on' : ''}`} role="radio" aria-checked={p.id === selected}
          data-project={p.id} style={{ '--c': p.color }} hidden={hidden.includes(p.id)} onClick={() => onSelect(p.id)}>
          <i />{p.name}
        </button>
      ))}
      <button type="button" class="chip chip-more" hidden={!hidden.length}
        onClick={() => openSheet(<PickProject projects={projects} current={selected} onPick={onSelect} />)}>
        Autres · {hidden.length}
      </button>
      <button type="button" class="chip chip-add" onClick={newProject}>{projects.length ? '+' : '+ Créer mon premier projet'}</button>
    </div>
  );
}

/** Note field with suggestion chips of past notes on the project, shown while typing. */
function NoteInput({ value, projectId, onChange }: { value: string; projectId: string | null; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const past = useMemo(() => {
    if (!projectId) return [];
    const list = expensesOf(projectId).slice().sort((a, b) => b.createdAt - a.createdAt);
    return [...new Set(list.map(e => e.note).filter(Boolean))];
  }, [projectId, expenses.value]);
  const q = value.trim().toLocaleLowerCase('fr');
  const suggestions = focused
    ? past.filter(n => { const k = n.toLocaleLowerCase('fr'); return k.includes(q) && k !== q; }).slice(0, 4)
    : [];

  return (
    <>
      <input ref={inputRef} class="note" type="text" placeholder="Note (facultatif) — ex. menuisier" value={value}
        enterKeyHint="done" autocomplete="off" maxLength={80}
        onInput={e => onChange(e.currentTarget.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      {suggestions.length > 0 && (
        <div class="suggest" onPointerDown={e => e.preventDefault()}>
          {suggestions.map(n => (
            <button key={n} type="button" onClick={() => { onChange(n); inputRef.current?.blur(); }}>{n}</button>
          ))}
        </div>
      )}
    </>
  );
}

/** Keypad: pointerdown for an instant response; long-press on ⌫ clears. */
function Keypad({ onKey, onClear }: { onKey: (k: string) => void; onClear: () => void }) {
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const release = () => clearTimeout(hold.current);

  const down = (e: PointerEvent, key: string) => {
    e.preventDefault();
    // Restart a short CSS animation: a visual flash that can't get stuck.
    const el = e.currentTarget as HTMLElement;
    el.classList.remove('pressed');
    void el.offsetWidth;
    el.classList.add('pressed');
    onKey(key);
    if (key === 'del') hold.current = setTimeout(() => { onClear(); navigator.vibrate?.(10); }, 450);
  };

  return (
    <div class="keypad" onPointerUp={release} onPointerLeave={release} onPointerCancel={release}>
      {KEYS.map(k => (
        <button key={k} type="button" data-key={k}
          aria-label={k === 'del' ? 'Effacer' : undefined} onPointerDown={e => down(e, k)}>
          {k === 'del' ? <Icon.del /> : k}
        </button>
      ))}
    </div>
  );
}

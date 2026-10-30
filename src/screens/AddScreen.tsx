import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal, useSignal, type Signal } from '@preact/signals';
import { parseAmount } from '../lib/parse';
import { dayLabel, money, money0, todayISO } from '../lib/format';
import {
  activeFunds, activeProjects, addDraft, budgetStatus, expenses, expensesOf, fundById, fundStatus, incomes,
  incomesOf, newExpense, newIncome, projectById, saveExpense, saveIncome, saveSettings, settings, spentOf,
  type Draft, type EntryKind,
} from '../lib/store';
import { confetti, openSheet, sheetOpen, toast } from '../lib/ui';
import { Icon } from '../components/common';
import { FundForm, PickItem, ProjectForm } from '../components/sheets';
import type { Expense, Fund, Income, Project } from '../lib/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const;

/** "1500,5" → "1 500,5" (narrow no-break spaces). */
function formatDraft(s: string): string {
  if (!s) return '0';
  const [int, dec] = s.split(',');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
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

type Editing = { kind: 'expense'; entry: Expense } | { kind: 'income'; entry: Income };

/** Entry screen: a dépense (on a poste) or a recette (into a caisse). */
export function AddScreen({ editId }: { editId?: string }) {
  const editing: Editing | undefined = useMemo(() => {
    if (!editId) return undefined;
    const e = expenses.value.find(x => x.id === editId && !x.deleted);
    if (e) return { kind: 'expense', entry: e };
    const i = incomes.value.find(x => x.id === editId && !x.deleted);
    return i ? { kind: 'income', entry: i } : undefined;
  }, [editId]);
  // Edits get their own draft so the add draft is not lost.
  const draft = useMemo<Signal<Draft>>(() => {
    if (!editing) return addDraft;
    const { entry } = editing;
    return signal({
      kind: editing.kind, amount: String(entry.amount).replace('.', ','), note: entry.note, date: entry.date,
      projectId: editing.kind === 'expense' ? editing.entry.projectId : null,
      fundId: editing.kind === 'income' ? editing.entry.fundId : null,
    });
  }, [editing]);

  if (editId && !editing) {
    location.replace('#/');
    return null;
  }
  return <AddForm draft={draft} editing={editing} />;
}

function AddForm({ draft, editing }: { draft: Signal<Draft>; editing?: Editing }) {
  const d = draft.value;
  const set = (patch: Partial<Draft>) => { draft.value = { ...draft.value, ...patch }; };
  const isIncome = d.kind === 'income';

  const projects = activeProjects.value.slice();
  const funds = activeFunds.value.slice();
  // An archived poste/caisse being edited stays selectable.
  if (editing?.kind === 'expense' && !projects.some(p => p.id === d.projectId)) {
    const p = projectById(d.projectId);
    if (p) projects.push(p);
  }
  if (editing?.kind === 'income' && !funds.some(f => f.id === d.fundId)) {
    const f = fundById(d.fundId);
    if (f) funds.push(f);
  }
  // Default to the last used poste / caisse.
  if (!projects.some(p => p.id === d.projectId)) {
    const fallback = projects.find(p => p.id === settings.value.lastProjectId)?.id ?? projects[0]?.id ?? null;
    if (fallback !== d.projectId) queueMicrotask(() => set({ projectId: fallback }));
  }
  if (!funds.some(f => f.id === d.fundId)) {
    const fallback = funds.find(f => f.id === settings.value.lastFundId)?.id ?? funds[0]?.id ?? null;
    if (fallback !== d.fundId) queueMicrotask(() => set({ fundId: fallback }));
  }

  const project = projectById(d.projectId);
  const fund = fundById(d.fundId);
  const amount = parseAmount(d.amount) || 0;
  const canSave = amount > 0 && (isIncome ? !!fund : !!project);
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
    if (!canSave) return;
    const common = { amount, note: d.note.trim(), date: d.date };
    if (editing) {
      if (editing.kind === 'expense') await saveExpense({ ...editing.entry, ...common, projectId: project!.id });
      else await saveIncome({ ...editing.entry, ...common, fundId: fund!.id });
      history.back();
      toast(editing.kind === 'expense' ? 'Dépense modifiée' : 'Recette modifiée');
      return;
    }
    navigator.vibrate?.(15);
    if (saveRef.current) confetti(saveRef.current);
    if (isIncome && fund) {
      const inc = await saveIncome(newIncome({ ...common, fundId: fund.id }));
      await saveSettings({ lastFundId: fund.id });
      toast(
        <><b>+{money(amount)} MAD</b> · {fund.name} · solde {money0(fundStatus(fund).solde)}</>,
        { label: 'Annuler', run: () => saveIncome({ ...inc, deleted: true }) },
      );
      // Recettes are occasional: go back to the everyday dépense mode.
      set({ amount: '', note: '', kind: 'expense' });
    } else if (project) {
      const exp = await saveExpense(newExpense({ ...common, projectId: project.id }));
      await saveSettings({ lastProjectId: project.id });
      const b = budgetStatus(project);
      toast(
        <><b>{money(amount)} MAD</b> · {project.name}{project.budget ? ` · ${Math.round(b.pct * 100)} % du budget` : ''}</>,
        { label: 'Annuler', run: () => saveExpense({ ...exp, deleted: true }) },
      );
      set({ amount: '', note: '' });
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (editing.kind === 'expense') {
      const e = editing.entry;
      await saveExpense({ ...e, deleted: true });
      toast('Dépense supprimée', { label: 'Annuler', run: () => saveExpense({ ...e, deleted: false }) });
    } else {
      const i = editing.entry;
      await saveIncome({ ...i, deleted: true });
      toast('Recette supprimée', { label: 'Annuler', run: () => saveIncome({ ...i, deleted: false }) });
    }
    history.back();
  };

  const setKind = (kind: EntryKind) => set({ kind, note: '' });

  return (
    <section class={`add ${isIncome ? 'income' : ''}`}>
      <header class="add-head">
        {editing ? (
          <>
            <button class="icon-btn" aria-label="Retour" onClick={() => history.back()}><Icon.back /></button>
            <h1 class="title-sm">{isIncome ? 'Modifier la recette' : 'Modifier'}</h1>
          </>
        ) : (
          <div class="segmented kind" role="radiogroup" aria-label="Type">
            <button type="button" role="radio" aria-checked={!isIncome} class={!isIncome ? 'on' : ''} onClick={() => setKind('expense')}>Dépense</button>
            <button type="button" role="radio" aria-checked={isIncome} class={isIncome ? 'on' : ''} onClick={() => setKind('income')}>Recette</button>
          </div>
        )}
        <label class={`date-chip ${d.date === todayISO() ? '' : 'past'}`}>
          <Icon.calendar /><span>{dayLabel(d.date)}</span>
          <input type="date" value={d.date} max={todayISO()} aria-label="Date"
            onChange={e => set({ date: e.currentTarget.value || todayISO() })} />
        </label>
      </header>

      {isIncome
        ? <IncomeZone value={d.amount} amount={amount} fund={fund} editing={editing?.kind === 'income' ? editing.entry : undefined} />
        : <ExpenseZone value={d.amount} amount={amount} project={project} hasProjects={projects.length > 0}
            editing={editing?.kind === 'expense' ? editing.entry : undefined} />}

      {isIncome ? (
        <Chips items={funds} selected={d.fundId} onSelect={id => set({ fundId: id })} label="Caisse"
          lastUse={id => Math.max(0, ...incomesOf(id).map(i => i.createdAt), fundById(id)?.createdAt ?? 0)}
          firstLabel="+ Créer ma première caisse" pickTitle="Choisir une caisse"
          onNew={() => openSheet(<FundForm onSaved={f => set({ fundId: f.id })} />)} />
      ) : (
        <Chips items={projects} selected={d.projectId} onSelect={id => set({ projectId: id })} label="Poste"
          lastUse={id => Math.max(0, ...expensesOf(id).map(e => e.createdAt), projectById(id)?.createdAt ?? 0)}
          firstLabel="+ Créer mon premier poste" pickTitle="Choisir un poste"
          onNew={() => openSheet(<ProjectForm onSaved={p => set({ projectId: p.id })} />)} />
      )}

      <NoteInput value={d.note} onChange={note => set({ note })}
        placeholder={isIncome ? 'Note (facultatif) — ex. virement' : 'Note (facultatif) — ex. menuisier'}
        past={isIncome ? (d.fundId ? incomesOf(d.fundId) : []) : (d.projectId ? expensesOf(d.projectId) : [])} />

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

function AmountDisplay({ value, sign }: { value: string; sign?: string }) {
  // Size steps on the whole-number digits only, so typing decimals never
  // resizes. Each step fits its widest value (…,99) on a 360px-wide phone.
  const digits = value.split(',')[0].length;
  const size = digits > 7 ? 'xlong' : digits > 5 ? 'long' : '';
  return (
    <div class="amount" aria-live="polite">
      <span class={`amount-value ${value ? '' : 'empty'} ${size}`}>{value && sign}{formatDraft(value)}</span>
      <span class="amount-cur">MAD</span>
    </div>
  );
}

/** "Maison · solde 3 650 MAD", red when the caisse goes negative. */
function SoldeLine({ fund, delta }: { fund?: Fund; delta: number }) {
  if (!fund) return null;
  const solde = fundStatus(fund).solde + delta;
  return <p class={`amount-solde ${solde < 0 ? 'over' : ''}`}>{fund.name} · solde {money0(solde)} MAD</p>;
}

function ExpenseZone({ value, amount, project, editing, hasProjects }: {
  value: string; amount: number; project?: Project; editing?: Expense; hasProjects: boolean;
}) {
  let hint = project ? '' : hasProjects ? 'Choisissez un poste' : '';
  let over = false;
  let meter: { spent: string; added: string } | null = null;
  const already = editing && editing.projectId === project?.id ? editing.amount : 0;
  if (project) {
    const before = spentOf(project.id) - already;
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
  return (
    <div class="amount-zone">
      <AmountDisplay value={value} />
      <p class={`amount-hint ${over ? 'over' : ''}`}>{hint}</p>
      {meter && project && (
        <div class={`meter ${over ? 'over' : ''}`} style={{ '--c': project.color }}>
          <i class="meter-spent" style={{ width: meter.spent }} /><i class="meter-new" style={{ width: meter.added }} />
        </div>
      )}
      <SoldeLine fund={fundById(project?.fundId)} delta={already - amount} />
    </div>
  );
}

function IncomeZone({ value, amount, fund, editing }: { value: string; amount: number; fund?: Fund; editing?: Income }) {
  const already = editing && editing.fundId === fund?.id ? editing.amount : 0;
  return (
    <div class="amount-zone">
      <AmountDisplay value={value} sign="+" />
      {fund
        ? <p class="amount-hint">{fund.name} · solde {money0(fundStatus(fund).solde + amount - already)} MAD</p>
        : <p class="amount-hint">Choisissez une caisse</p>}
    </div>
  );
}

type ChipItem = { id: string; name: string; color: string };

/**
 * Chips stay on at most two rows: with many items, the least recently used
 * ones hide behind an "Autres" chip (the selected one always stays visible).
 */
function Chips({ items, selected, onSelect, onNew, lastUse, label, firstLabel, pickTitle }: {
  items: ChipItem[]; selected: string | null; onSelect: (id: string) => void; onNew: () => void;
  lastUse: (id: string) => number; label: string; firstLabel: string; pickTitle: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const width = useSignal(innerWidth);
  useEffect(() => {
    const onResize = () => { width.value = innerWidth; };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const ids = items.map(p => p.id).join();
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const chips = [...box.querySelectorAll<HTMLElement>('[data-item]')];
    const more = box.querySelector<HTMLElement>('.chip-more')!;
    chips.forEach(c => { c.hidden = false; });
    more.hidden = true;
    const rows = () => new Set([...box.children].filter(c => !(c as HTMLElement).hidden).map(c => (c as HTMLElement).offsetTop)).size;
    const next: string[] = [];
    if (rows() > 2) {
      more.hidden = false;
      const leastUsed = chips.filter(c => c.dataset.item !== selected)
        .sort((a, b) => lastUse(a.dataset.item!) - lastUse(b.dataset.item!));
      for (const c of leastUsed) {
        c.hidden = true;
        next.push(c.dataset.item!);
        if (rows() <= 2) break;
      }
    }
    if (next.join() !== hidden.join()) setHidden(next);
  }, [ids, selected, width.value]);

  return (
    <div class="chips" role="radiogroup" aria-label={label} ref={ref}>
      {items.map(p => (
        <button key={p.id} type="button" class={`chip ${p.id === selected ? 'on' : ''}`} role="radio" aria-checked={p.id === selected}
          data-item={p.id} style={{ '--c': p.color }} hidden={hidden.includes(p.id)} onClick={() => onSelect(p.id)}>
          <i />{p.name}
        </button>
      ))}
      <button type="button" class="chip chip-more" hidden={!hidden.length}
        onClick={() => openSheet(<PickItem title={pickTitle} items={items} current={selected} onPick={onSelect} />)}>
        Autres · {hidden.length}
      </button>
      <button type="button" class="chip chip-add" onClick={onNew}>{items.length ? '+' : firstLabel}</button>
    </div>
  );
}

/** Note field with suggestion chips of past notes (same poste / caisse), shown while typing. */
function NoteInput({ value, onChange, placeholder, past: entries }: {
  value: string; onChange: (v: string) => void; placeholder: string; past: { note: string; createdAt: number }[];
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const past = useMemo(() => {
    const list = entries.slice().sort((a, b) => b.createdAt - a.createdAt);
    return [...new Set(list.map(e => e.note).filter(Boolean))];
  }, [entries]);
  const q = value.trim().toLocaleLowerCase('fr');
  const suggestions = focused
    ? past.filter(n => { const k = n.toLocaleLowerCase('fr'); return k.includes(q) && k !== q; }).slice(0, 4)
    : [];

  return (
    <>
      <input ref={inputRef} class="note" type="text" placeholder={placeholder} value={value}
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
    // Typing an amount while the note keyboard is open: close it, so the
    // page scrolls back and the amount is visible again.
    const focused = document.activeElement as HTMLElement | null;
    if (focused?.matches('input, textarea')) {
      focused.blur();
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
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

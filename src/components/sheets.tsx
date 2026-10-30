import { useEffect, useRef, useState } from 'preact/hooks';
import { parseAmount, parseExpenseLine, parseNotes, planNotes, headerName, type NoteGroup, type NoteLine } from '../lib/parse';
import { money, money0, todayISO } from '../lib/format';
import {
  PROJECT_COLORS, activeFunds, budgetStatus, expensesOf, findFundByName, findProjectByName, fundById, fundIsEmpty,
  fundStatus, liveFunds, liveProjects, newExpense, newFund, newIncome, newProject, now, projectsOf,
  saveExpense, saveFund, saveIncome, saveProject, settings,
} from '../lib/store';
import { closeSheet, go, toast } from '../lib/ui';
import type { Fund, Project } from '../lib/types';
import { plural } from './common';

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <fieldset class="swatches">
      <legend>Couleur</legend>
      {PROJECT_COLORS.map(c => (
        <label key={c} style={{ '--c': c }}>
          <input type="radio" name="color" checked={c === value} onChange={() => onChange(c)} /><i />
        </label>
      ))}
    </fieldset>
  );
}

const defaultFundId = () => {
  const open = activeFunds.value;
  return (open.find(f => f.id === settings.value.lastFundId) ?? open[0])?.id ?? null;
};

/**
 * Caisse of a poste: an existing caisse, or a new one typed by name
 * (`reuse`: a new caisse already typed for another poste in the import).
 */
type FundChoice = { fundId: string | null; newName: string; reuse?: boolean };

async function resolveFund(choice: FundChoice): Promise<string | null> {
  if (choice.fundId) return choice.fundId;
  const name = choice.newName.trim();
  if (!name) return null;
  return (findFundByName(name) ?? await saveFund(newFund(name))).id;
}

const choiceReady = (c: FundChoice) => !!c.fundId || !!c.newName.trim();

function FundField({ value, onChange }: { value: FundChoice; onChange: (c: FundChoice) => void }) {
  const funds = activeFunds.value;
  return (
    <fieldset class="fund-field">
      <legend>Caisse</legend>
      <div class="chips">
        {funds.map(f => (
          <button key={f.id} type="button" class={`chip ${value.fundId === f.id ? 'on' : ''}`} style={{ '--c': f.color }}
            onClick={() => onChange({ fundId: f.id, newName: '' })}>
            <i />{f.name}
          </button>
        ))}
        <button type="button" class={`chip chip-add ${value.fundId ? '' : 'on'}`} onClick={() => onChange({ fundId: null, newName: value.newName })}>
          + Nouvelle
        </button>
      </div>
      {!value.fundId && (
        <input placeholder="Nom de la nouvelle caisse, ex. Maison" maxLength={40} value={value.newName}
          onInput={e => onChange({ fundId: null, newName: e.currentTarget.value })} />
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------- poste form

export function ProjectForm({ project, fundId, onSaved }: { project?: Project; fundId?: string; onSaved?: (p: Project) => void }) {
  const editing = !!project;
  const [name, setName] = useState(project?.name ?? '');
  const [fund, setFund] = useState<FundChoice>({ fundId: project?.fundId ?? fundId ?? defaultFundId(), newName: '' });
  const [budget, setBudget] = useState(project?.budget ? money(project.budget) : '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[liveProjects.value.length % PROJECT_COLORS.length]);
  const [archived, setArchived] = useState(project?.archived ?? false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setTimeout(() => nameRef.current?.focus(), 250);
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim() || !choiceReady(fund)) return;
    const fundId = (await resolveFund(fund))!;
    const fields = { name: name.trim(), fundId, budget: parseAmount(budget) || 0, color, archived };
    const saved = await saveProject(project ? { ...project, ...fields } : { ...newProject(fields.name, fields.budget, fundId), ...fields });
    await closeSheet();
    onSaved?.(saved);
    if (!editing) toast(<>Poste <b>{saved.name}</b> créé</>);
  };

  const remove = async () => {
    if (!project) return;
    const n = expensesOf(project.id).length;
    if (!confirm(`Supprimer « ${project.name} »${n ? ` et ses ${plural(n, 'dépense')}` : ''} ?`)) return;
    // Its expenses stay in storage but are hidden along with the poste.
    await saveProject({ ...project, deleted: true });
    await closeSheet();
    go(`#/caisse/${project.fundId}`);
  };

  return (
    <>
      <h2>{editing ? 'Modifier le poste' : 'Nouveau poste'}</h2>
      <form class="form" autocomplete="off" onSubmit={submit}>
        <label>Nom
          <input ref={nameRef} required maxLength={40} placeholder="ex. Alimentation, Maison Tulip…" value={name}
            onInput={e => setName(e.currentTarget.value)} />
        </label>
        <FundField value={fund} onChange={setFund} />
        <label>Budget (MAD, facultatif)
          <input inputMode="decimal" placeholder="ex. 20 000" value={budget} onInput={e => setBudget(e.currentTarget.value)} />
        </label>
        <Swatches value={color} onChange={setColor} />
        {editing && (
          <label class="switch">
            <input type="checkbox" checked={archived} onChange={e => setArchived(e.currentTarget.checked)} />
            <span>Poste terminé (masqué de la saisie)</span>
          </label>
        )}
        <div class="form-actions">
          {editing
            ? <button type="button" class="btn-ghost danger" onClick={remove}>Supprimer</button>
            : <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>}
          <button class="btn-primary" disabled={!name.trim() || !choiceReady(fund)}>{editing ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- caisse form

export function FundForm({ fund, onSaved }: { fund?: Fund; onSaved?: (f: Fund) => void }) {
  const editing = !!fund;
  const [name, setName] = useState(fund?.name ?? '');
  const [color, setColor] = useState(fund?.color ?? PROJECT_COLORS[(liveFunds.value.length + 3) % PROJECT_COLORS.length]);
  const [archived, setArchived] = useState(fund?.archived ?? false);
  const nameRef = useRef<HTMLInputElement>(null);
  const canDelete = !!fund && fundIsEmpty(fund);

  useEffect(() => {
    if (!editing) setTimeout(() => nameRef.current?.focus(), 250);
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fields = { name: name.trim(), color, archived };
    const saved = await saveFund(fund ? { ...fund, ...fields } : { ...newFund(fields.name), ...fields });
    await closeSheet();
    onSaved?.(saved);
    if (!editing) toast(<>Caisse <b>{saved.name}</b> créée</>);
  };

  const remove = async () => {
    if (!fund || !confirm(`Supprimer la caisse « ${fund.name} » ?`)) return;
    await saveFund({ ...fund, deleted: true });
    await closeSheet();
    go('#/caisses');
  };

  return (
    <>
      <h2>{editing ? 'Modifier la caisse' : 'Nouvelle caisse'}</h2>
      <form class="form" autocomplete="off" onSubmit={submit}>
        <label>Nom
          <input ref={nameRef} required maxLength={40} placeholder="ex. Maison, Investissement…" value={name}
            onInput={e => setName(e.currentTarget.value)} />
        </label>
        <Swatches value={color} onChange={setColor} />
        {editing && (
          <label class="switch">
            <input type="checkbox" checked={archived} onChange={e => setArchived(e.currentTarget.checked)} />
            <span>Caisse fermée (masquée de la saisie, avec ses postes)</span>
          </label>
        )}
        {editing && !canDelete && <p class="muted small">Une caisse qui a des postes ou des recettes ne peut pas être supprimée : fermez-la.</p>}
        <div class="form-actions">
          {canDelete
            ? <button type="button" class="btn-ghost danger" onClick={remove}>Supprimer</button>
            : <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>}
          <button class="btn-primary" disabled={!name.trim()}>{editing ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- picker

type PickableItem = { id: string; name: string; color: string };

const itemDetail = (id: string): string => {
  const p = liveProjects.value.find(x => x.id === id);
  if (p) {
    const b = budgetStatus(p);
    return `${money0(b.spent)}${p.budget ? ` / ${money0(p.budget)}` : ''} MAD`;
  }
  const f = fundById(id);
  return f ? `solde ${money0(fundStatus(f).solde)} MAD` : '';
};

export function PickItem({ title, items, current, onPick }: {
  title: string; items: PickableItem[]; current: string | null; onPick: (id: string) => void;
}) {
  const pick = async (id: string) => {
    await closeSheet();
    onPick(id);
  };
  return (
    <>
      <h2>{title}</h2>
      <div class="card rows pick-list">
        {items.map(p => (
          <button key={p.id} type="button" class={`row ${p.id === current ? 'on' : ''}`} style={{ '--c': p.color }} onClick={() => pick(p.id)}>
            <span><i />{p.name}</span>
            <small class="muted">{itemDetail(p.id)}</small>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- notes import

const groupKey = (g: NoteGroup) => g.name.toLocaleLowerCase('fr');
const hasEntries = (g: NoteGroup) => g.expenses.length + g.incomes.length > 0;
const DIVERS = 'Divers';

/** Caisse used by a group: the caisse it names, its poste's caisse, or the one chosen. */
function groupFund(g: NoteGroup, choice: FundChoice | undefined): FundChoice | 'known' {
  if (g.kind === 'fund') return 'known';
  const p = findProjectByName(g.name);
  if (p) return 'known';
  return choice ?? { fundId: defaultFundId(), newName: '' };
}

function ImportFundSelect({ value, pending, onChange }: {
  value: FundChoice; pending: string[]; onChange: (c: FundChoice) => void;
}) {
  const funds = activeFunds.value;
  const selected = value.fundId ?? (value.reuse ? `new:${value.newName}` : '__new');
  return (
    <div class="pv-fund">
      <select value={selected} aria-label="Caisse"
        onChange={e => {
          const v = e.currentTarget.value;
          if (v === '__new') onChange({ fundId: null, newName: '' });
          else if (v.startsWith('new:')) onChange({ fundId: null, newName: v.slice(4), reuse: true });
          else onChange({ fundId: v, newName: '' });
        }}>
        {funds.map(f => <option key={f.id} value={f.id}>Caisse : {f.name}</option>)}
        {pending.map(n => <option key={n} value={`new:${n}`}>Caisse : {n} (nouvelle)</option>)}
        <option value="__new">＋ Nouvelle caisse…</option>
      </select>
      {!value.fundId && !value.reuse && (
        <input placeholder="Nom de la caisse" value={value.newName} maxLength={40}
          onInput={e => onChange({ fundId: null, newName: e.currentTarget.value })} />
      )}
    </div>
  );
}

export function ImportNotes() {
  const [text, setText] = useState('');
  const [lines, setLines] = useState<NoteLine[]>([]);
  const [date, setDate] = useState(todayISO());
  const [choices, setChoices] = useState<Record<string, FundChoice>>({});
  const canPaste = !!navigator.clipboard?.readText;

  const { groups, roles } = planNotes(lines, name => !!findFundByName(name));
  const used = groups.filter(hasEntries);
  const nExp = used.reduce((t, g) => t + g.expenses.length, 0);
  const nInc = used.reduce((t, g) => t + g.incomes.length, 0);
  // New caisses typed for one poste are offered to the others.
  const pending = [...new Set(Object.values(choices).filter(c => !c.fundId && !c.reuse && c.newName.trim()).map(c => c.newName.trim()))];
  const ready = used.every(g => { const c = groupFund(g, choices[groupKey(g)]); return c === 'known' || choiceReady(c); });

  const update = (value: string) => {
    setText(value);
    setLines(parseNotes(value));
  };

  const paste = async () => {
    try {
      update(await navigator.clipboard.readText());
    } catch {
      toast('Appuyez longuement dans la zone puis « Coller »');
    }
  };

  // Tapping a line flips it between title (caisse / poste) and amount.
  const flip = (i: number) => {
    const l = lines[i];
    let next: NoteLine | null = null;
    if (l.type === 'amount') next = { type: 'header', raw: l.raw, name: headerName(l.raw) };
    else {
      const exp = parseExpenseLine(l.raw);
      if (exp) next = { type: 'amount', raw: l.raw, ...exp };
    }
    if (next) setLines(lines.map((x, j) => (j === i ? next : x)));
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!ready) return;
    let n = 0;
    const day = date || todayISO();
    for (const g of used) {
      let fundId: string;
      let projectId: string | null = null;
      if (g.kind === 'fund') {
        fundId = findFundByName(g.name)!.id;
        if (g.expenses.length) {
          // Amounts directly under a caisse go to its « Divers » poste.
          const divers = projectsOf(fundId).find(p => p.name === DIVERS) ?? await saveProject(newProject(DIVERS, 0, fundId));
          projectId = divers.id;
        }
      } else {
        const existing = findProjectByName(g.name);
        fundId = existing?.fundId ?? (await resolveFund(choices[groupKey(g)] ?? { fundId: defaultFundId(), newName: '' }))!;
        if (g.expenses.length) projectId = (existing ?? await saveProject(newProject(g.name, 0, fundId))).id;
      }
      for (const x of g.incomes) {
        await saveIncome(newIncome({ fundId, amount: x.amount, note: x.label, date: day }, now() + n++));
      }
      for (const x of g.expenses) {
        await saveExpense(newExpense({ projectId: projectId!, amount: x.amount, note: x.label, date: day }, now() + n++));
      }
    }
    await closeSheet();
    const parts = [nExp && `${plural(nExp, 'dépense')}`, nInc && `${plural(nInc, 'recette')}`].filter(Boolean).join(' et ');
    toast(`${parts} importée${n > 1 ? 's' : ''} ✿`);
    go('#/caisses');
  };

  const headerBadge = (g: NoteGroup) => {
    if (g.kind === 'fund') return <em>caisse</em>;
    if (findProjectByName(g.name)) return null;
    return <em>{g.expenses.length ? 'nouveau poste' : 'recettes'}</em>;
  };

  const label = [nExp && plural(nExp, 'dépense'), nInc && plural(nInc, 'recette')].filter(Boolean).join(' + ');

  return (
    <>
      <h2>Importer mes notes</h2>
      <form class="form" onSubmit={submit}>
        <div class="paste-box">
          <textarea rows={6} placeholder="Collez vos notes ici…" value={text} onInput={e => update(e.currentTarget.value)} />
          {canPaste && !text && <button type="button" class="btn-soft paste-btn" onClick={paste}>Coller</button>}
        </div>
        {!text && (
          <p class="muted small example">
            Par exemple :<br /><b>Alimentation</b><br />courses: 450<br />boucher 300 dh<br /><br />
            <b>Maison</b><br />Recettes<br />3000
          </p>
        )}
        <label>Date de ces opérations
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.currentTarget.value)} />
        </label>
        {lines.length > 0 && (
          <div class="preview">
            <p class="muted small">Touchez une ligne si elle est mal reconnue.</p>
            {lines.map((l, i) => {
              const { role, group } = roles[i];
              const g = groups[group];
              if (role === 'header' && g) {
                const c = groupFund(g, choices[groupKey(g)]);
                return (
                  <div key={i}>
                    <button type="button" class="pv pv-head" onClick={() => flip(i)}>{g.name}{headerBadge(g)}</button>
                    {c !== 'known' && hasEntries(g) && (
                      <ImportFundSelect value={c} pending={pending.filter(n => n !== c.newName.trim() || c.reuse)} onChange={v => setChoices({ ...choices, [groupKey(g)]: v })} />
                    )}
                  </div>
                );
              }
              if (role === 'section') return <p key={i} class="pv-section">{l.raw.replace(/[:\s]+$/, '')}</p>;
              if (l.type !== 'amount') return null;
              return (
                <button key={i} type="button" class={`pv ${role === 'income' ? 'pv-income' : ''}`} onClick={() => flip(i)}>
                  <span>{l.label || <i class="muted">sans note</i>}</span>
                  <b>{role === 'income' ? '+' : ''}{money(l.amount)}</b>
                </button>
              );
            })}
          </div>
        )}
        <div class="form-actions">
          <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>
          <button class="btn-primary" disabled={!(nExp + nInc) || !ready}>{nExp + nInc ? `Importer ${label}` : 'Importer'}</button>
        </div>
      </form>
    </>
  );
}


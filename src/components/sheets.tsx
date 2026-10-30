import { useEffect, useRef, useState } from 'preact/hooks';
import { parseAmount } from '../lib/parse';
import { aiPrompt, parseImport, type ImportEntry, type ImportError, type ImportPoste } from '../lib/importFormat';
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

/** Caisse of a poste: an existing caisse, or a new one typed by name. */
type FundChoice = { fundId: string | null; newName: string };

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
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setTimeout(() => nameRef.current?.focus(), 250);
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim() || !choiceReady(fund)) return;
    const fundId = (await resolveFund(fund))!;
    const fields = { name: name.trim(), fundId, budget: parseAmount(budget) || 0, color };
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

  const setArchived = async (archived: boolean) => {
    if (!project) return;
    if (archived && !confirm(`Archiver le poste « ${project.name} » ?\nIl n’apparaîtra plus dans la saisie ; ses dépenses sont conservées.`)) return;
    await saveProject({ ...project, archived });
    await closeSheet();
    toast(<>Poste <b>{project.name}</b> {archived ? 'archivé' : 'désarchivé'}</>,
      { label: 'Annuler', run: () => saveProject({ ...project, archived: !archived }) });
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
        <div class="form-actions">
          {project ? (
            <span class="side-actions">
              <button type="button" class="btn-text" onClick={() => setArchived(!project.archived)}>
                {project.archived ? 'Désarchiver' : 'Archiver'}
              </button>
              <button type="button" class="btn-text danger" onClick={remove}>Supprimer</button>
            </span>
          ) : <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>}
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
  const nameRef = useRef<HTMLInputElement>(null);
  const canDelete = !!fund && fundIsEmpty(fund);

  useEffect(() => {
    if (!editing) setTimeout(() => nameRef.current?.focus(), 250);
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fields = { name: name.trim(), color };
    const saved = await saveFund(fund ? { ...fund, ...fields } : { ...newFund(fields.name), ...fields });
    await closeSheet();
    onSaved?.(saved);
    if (!editing) toast(<>Caisse <b>{saved.name}</b> créée</>);
  };

  const remove = async () => {
    if (!fund) return;
    if (!canDelete) {
      toast('Une caisse avec des postes ou des recettes ne peut pas être supprimée : archivez-la.');
      return;
    }
    if (!confirm(`Supprimer la caisse « ${fund.name} » ?`)) return;
    await saveFund({ ...fund, deleted: true });
    await closeSheet();
    go('#/caisses');
  };

  const setArchived = async (archived: boolean) => {
    if (!fund) return;
    if (archived && !confirm(`Archiver la caisse « ${fund.name} » ?\nElle et ses postes n’apparaîtront plus dans la saisie ; tout est conservé.`)) return;
    await saveFund({ ...fund, archived });
    await closeSheet();
    toast(<>Caisse <b>{fund.name}</b> {archived ? 'archivée' : 'désarchivée'}</>,
      { label: 'Annuler', run: () => saveFund({ ...fund, archived: !archived }) });
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
        <div class="form-actions">
          {fund ? (
            <span class="side-actions">
              <button type="button" class="btn-text" onClick={() => setArchived(!fund.archived)}>
                {fund.archived ? 'Désarchiver' : 'Archiver'}
              </button>
              <button type="button" class="btn-text danger" onClick={remove}>Supprimer</button>
            </span>
          ) : <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>}
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

const EXAMPLE = `+ 3000 salaire
# Alimentation
- 450 courses
2026-10-12 - 300 boucher`;

const findIn = (fundId: string | null, name: string) =>
  fundId ? projectsOf(fundId).find(q => q.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr')) : undefined;

/** Postes of the text that already exist in another caisse. */
function conflicts(postes: ImportPoste[], fundId: string | null): ImportError[] {
  return postes.flatMap(p => {
    const other = findProjectByName(p.name);
    return other && other.fundId !== fundId
      ? [{ line: p.line, text: `# ${p.name}`, message: `Le poste « ${other.name} » existe déjà dans la caisse « ${fundById(other.fundId)?.name ?? '?'} »` }]
      : [];
  });
}

/** Import into one caisse: recettes (+) and postes (#) with their dépenses (-). */
export function ImportNotes() {
  const [fund, setFund] = useState<FundChoice>({ fundId: defaultFundId(), newName: '' });
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayISO());
  const canPaste = !!navigator.clipboard?.readText;

  const { incomes, postes, errors: lineErrors } = parseImport(text);
  const errors = [...lineErrors, ...conflicts(postes, fund.fundId)].sort((a, b) => a.line - b.line);
  const nInc = incomes.length;
  const nExp = postes.reduce((t, p) => t + p.expenses.length, 0);
  const label = [nExp && plural(nExp, 'dépense'), nInc && plural(nInc, 'recette')].filter(Boolean).join(' + ');
  const canImport = !errors.length && nExp + nInc > 0 && choiceReady(fund);

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast('Appuyez longuement dans la zone puis « Coller »');
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt(fund.fundId ? projectsOf(fund.fundId).map(p => p.name) : []));
      toast('Instructions copiées : collez-les dans ChatGPT avec vos notes');
    } catch {
      toast('Copie impossible sur ce téléphone');
    }
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!canImport) return;
    const fundId = (await resolveFund(fund))!;
    let n = 0;
    const day = (x: ImportEntry) => x.date ?? (date || todayISO());
    for (const x of incomes) {
      await saveIncome(newIncome({ fundId, amount: x.amount, note: x.note, date: day(x) }, now() + n++));
    }
    for (const p of postes) {
      const poste = findIn(fundId, p.name) ?? await saveProject(newProject(p.name, 0, fundId));
      for (const x of p.expenses) {
        await saveExpense(newExpense({ projectId: poste.id, amount: x.amount, note: x.note, date: day(x) }, now() + n++));
      }
    }
    await closeSheet();
    toast(`${label.replace(' + ', ' et ')} importée${n > 1 ? 's' : ''} ✿`);
    go(`#/caisse/${fundId}`);
  };

  const entry = (x: ImportEntry, sign: string) => (
    <div key={x.line} class={`pv ${sign === '+' ? 'pv-income' : ''}`}>
      <span>{x.note || <i class="muted">sans note</i>}{x.date && <small class="muted"> · {x.date}</small>}</span>
      <b>{sign}{money(x.amount)}</b>
    </div>
  );

  return (
    <>
      <h2>Importer mes notes</h2>
      <form class="form" onSubmit={submit}>
        <FundField value={fund} onChange={setFund} />

        <details class="format-help">
          <summary>Format à respecter</summary>
          <pre>{EXAMPLE}</pre>
          <p class="muted small">
            <b>+</b> recette dans la caisse · <b>#</b> poste · <b>−</b> dépense sur le poste au-dessus.
            Montants en chiffres (1500 ou 1500,50), date facultative au début.
          </p>
          <p class="muted small">Notes en désordre ? Copiez les instructions, collez-les dans ChatGPT avec vos notes, puis collez sa réponse ici.</p>
          <button type="button" class="btn-soft" onClick={copyPrompt}>Copier les instructions pour l’IA</button>
        </details>

        <div class="paste-box">
          <textarea rows={7} placeholder="Collez le texte ici…" value={text} spellcheck={false}
            onInput={e => setText(e.currentTarget.value)} />
          {canPaste && !text && <button type="button" class="btn-soft paste-btn" onClick={paste}>Coller</button>}
        </div>
        <label>Date des lignes sans date
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.currentTarget.value)} />
        </label>

        {errors.length > 0 && (
          <div class="import-errors" role="alert">
            <b>{plural(errors.length, 'ligne')} à corriger</b>
            {errors.map(x => (
              <p key={`${x.line}-${x.message}`}><span>Ligne {x.line}</span> {x.message}{x.text && <code>{x.text}</code>}</p>
            ))}
          </div>
        )}

        {nExp + nInc > 0 && (
          <div class="preview">
            {nInc > 0 && <p class="pv-section">Recettes</p>}
            {incomes.map(x => entry(x, '+'))}
            {postes.map(p => (
              <div key={p.line} class="pv-poste">
                <p class="pv-head">{p.name}{!findIn(fund.fundId, p.name) && <em>nouveau poste</em>}</p>
                {p.expenses.map(x => entry(x, '−'))}
              </div>
            ))}
          </div>
        )}

        <div class="form-actions">
          <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>
          <button class="btn-primary" disabled={!canImport}>{nExp + nInc ? `Importer ${label}` : 'Importer'}</button>
        </div>
      </form>
    </>
  );
}

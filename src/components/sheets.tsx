import { useEffect, useRef, useState } from 'preact/hooks';
import { parseAmount, parseExpenseLine, parseNotes, groupNotes, type NoteLine } from '../lib/parse';
import { money, money0, todayISO } from '../lib/format';
import {
  PROJECT_COLORS, budgetStatus, expensesOf, findProjectByName, liveProjects, newExpense, newProject,
  now, saveExpense, saveProject,
} from '../lib/store';
import { closeSheet, go, toast } from '../lib/ui';
import type { Project } from '../lib/types';
import { plural } from './common';

// ---------------------------------------------------------------- project form

export function ProjectForm({ project, onSaved }: { project?: Project; onSaved?: (p: Project) => void }) {
  const editing = !!project;
  const [name, setName] = useState(project?.name ?? '');
  const [budget, setBudget] = useState(project?.budget ? money(project.budget) : '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[liveProjects.value.length % PROJECT_COLORS.length]);
  const [archived, setArchived] = useState(project?.archived ?? false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setTimeout(() => nameRef.current?.focus(), 250);
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fields = { name: name.trim(), budget: parseAmount(budget) || 0, color, archived };
    const saved = await saveProject(project ? { ...project, ...fields } : { ...newProject(fields.name, fields.budget), ...fields });
    await closeSheet();
    onSaved?.(saved);
    if (!editing) toast(<>Projet <b>{saved.name}</b> créé</>);
  };

  const remove = async () => {
    if (!project) return;
    const n = expensesOf(project.id).length;
    if (!confirm(`Supprimer « ${project.name} »${n ? ` et ses ${plural(n, 'dépense')}` : ''} ?`)) return;
    // Its expenses stay in storage but are hidden along with the project.
    await saveProject({ ...project, deleted: true });
    await closeSheet();
    go('#/projets');
  };

  return (
    <>
      <h2>{editing ? 'Modifier le projet' : 'Nouveau projet'}</h2>
      <form class="form" autocomplete="off" onSubmit={submit}>
        <label>Nom
          <input ref={nameRef} required maxLength={40} placeholder="ex. Salon, Cuisine…" value={name}
            onInput={e => setName(e.currentTarget.value)} />
        </label>
        <label>Budget (MAD, facultatif)
          <input inputMode="decimal" placeholder="ex. 20 000" value={budget} onInput={e => setBudget(e.currentTarget.value)} />
        </label>
        <fieldset class="swatches">
          <legend>Couleur</legend>
          {PROJECT_COLORS.map(c => (
            <label key={c} style={{ '--c': c }}>
              <input type="radio" name="color" checked={c === color} onChange={() => setColor(c)} /><i />
            </label>
          ))}
        </fieldset>
        {editing && (
          <label class="switch">
            <input type="checkbox" checked={archived} onChange={e => setArchived(e.currentTarget.checked)} />
            <span>Projet terminé (masqué de la saisie)</span>
          </label>
        )}
        <div class="form-actions">
          {editing
            ? <button type="button" class="btn-ghost danger" onClick={remove}>Supprimer</button>
            : <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>}
          <button class="btn-primary">{editing ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- project picker

export function PickProject({ projects, current, onPick }: { projects: Project[]; current: string | null; onPick: (id: string) => void }) {
  const pick = async (id: string) => {
    await closeSheet();
    onPick(id);
  };
  return (
    <>
      <h2>Choisir un projet</h2>
      <div class="card rows pick-list">
        {projects.map(p => {
          const b = budgetStatus(p);
          return (
            <button key={p.id} type="button" class={`row ${p.id === current ? 'on' : ''}`} style={{ '--c': p.color }} onClick={() => pick(p.id)}>
              <span><i />{p.name}</span>
              <small class="muted">{money0(b.spent)}{p.budget ? ` / ${money0(p.budget)}` : ''} MAD</small>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- notes import

export function ImportNotes() {
  const [text, setText] = useState('');
  const [lines, setLines] = useState<NoteLine[]>([]);
  const [date, setDate] = useState(todayISO());
  const groups = groupNotes(lines);
  const count = groups.reduce((t, g) => t + g.expenses.length, 0);
  const canPaste = !!navigator.clipboard?.readText;

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

  // Tapping a line flips it between project name and expense.
  const flip = (i: number) => {
    const l = lines[i];
    let next: NoteLine | null = null;
    if (l.type === 'expense') next = { type: 'header', raw: l.raw, name: l.raw.replace(/[:\s]+$/, '') };
    else {
      const exp = parseExpenseLine(l.raw);
      if (exp) next = { type: 'expense', raw: l.raw, ...exp };
    }
    if (next) setLines(lines.map((x, j) => (j === i ? next : x)));
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    let n = 0;
    for (const g of groups) {
      let p = findProjectByName(g.name);
      if (!p) p = await saveProject(newProject(g.name, 0));
      for (const x of g.expenses) {
        await saveExpense(newExpense({ projectId: p.id, amount: x.amount, note: x.label, date: date || todayISO() }, now() + n++));
      }
    }
    await closeSheet();
    toast(`${plural(n, 'dépense')} importée${n > 1 ? 's' : ''} ✿`);
    go('#/projets');
  };

  return (
    <>
      <h2>Importer mes notes</h2>
      <form class="form" onSubmit={submit}>
        <div class="paste-box">
          <textarea rows={6} placeholder="Collez vos notes ici…" value={text} onInput={e => update(e.currentTarget.value)} />
          {canPaste && !text && <button type="button" class="btn-soft paste-btn" onClick={paste}>Coller</button>}
        </div>
        {!text && (
          <p class="muted small example">Par exemple :<br /><b>Salon</b><br />menuisier: 1500<br />peinture 300+150</p>
        )}
        <label>Date de ces dépenses
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.currentTarget.value)} />
        </label>
        {lines.length > 0 && (
          <div class="preview">
            <p class="muted small">Touchez une ligne si elle est mal reconnue.</p>
            {lines.map((l, i) => l.type === 'header'
              ? (
                <button key={i} type="button" class="pv pv-head" onClick={() => flip(i)}>
                  {l.name}{!findProjectByName(l.name) && <em>nouveau</em>}
                </button>
              ) : (
                <button key={i} type="button" class="pv" onClick={() => flip(i)}>
                  <span>{l.label || <i class="muted">sans note</i>}</span><b>{money(l.amount)}</b>
                </button>
              ))}
          </div>
        )}
        <div class="form-actions">
          <button type="button" class="btn-ghost" onClick={() => closeSheet()}>Annuler</button>
          <button class="btn-primary" disabled={!count}>{count ? `Importer ${plural(count, 'dépense')}` : 'Importer'}</button>
        </div>
      </form>
    </>
  );
}

import { money, money0, sum, dayLabel } from '../lib/format';
import {
  addDraft, backupDue, budgetStatus, expensesOf, lastBackupText, liveProjects, projectById,
} from '../lib/store';
import { exportBackup, go, openSheet } from '../lib/ui';
import { Icon, ProjectRing, plural } from '../components/common';
import { ProjectForm } from '../components/sheets';
import type { Expense, Project } from '../lib/types';

function restText(p: Project): string {
  const b = budgetStatus(p);
  return b.rest >= 0 ? `Reste ${money0(b.rest)} MAD` : `Dépassé de ${money0(-b.rest)} MAD`;
}

function ProjectCard({ project: p }: { project: Project }) {
  const b = budgetStatus(p);
  return (
    <a class={`card project-card ${b.over ? 'over' : ''}`} href={`#/projet/${p.id}`} style={{ '--c': p.color }}>
      <ProjectRing project={p} />
      <div class="project-info">
        <strong>{p.name}</strong>
        <span class="muted">{money0(b.spent)}{p.budget ? ` / ${money0(p.budget)}` : ''} MAD · {plural(expensesOf(p.id).length, 'dépense')}</span>
        {p.budget > 0 && <span class="rest">{restText(p)}</span>}
      </div>
      <Icon.chevron />
    </a>
  );
}

export function ProjectsScreen() {
  const all = liveProjects.value.slice().sort((a, b) => a.createdAt - b.createdAt);
  const active = all.filter(p => !p.archived);
  const done = all.filter(p => p.archived);
  const totalSpent = sum(active.map(p => budgetStatus(p).spent));
  const totalBudget = sum(active.map(p => p.budget));
  const allBudgeted = active.every(p => p.budget);
  const newProject = () => openSheet(<ProjectForm />);

  return (
    <section class="page">
      <header class="page-head">
        <h1>Mes projets</h1>
        <button class="btn-soft" onClick={newProject}>+ Nouveau</button>
      </header>

      {active.length ? (
        <>
          <div class="summary">
            <span class="muted">Total dépensé</span>
            <strong class="big-num">{money0(totalSpent)} <small>MAD</small></strong>
            {totalBudget > 0 && allBudgeted && <span class="muted">sur {money0(totalBudget)} MAD de budget</span>}
          </div>
          <div class="list">{active.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        </>
      ) : (
        <div class="empty-state">
          <div class="empty-art">✿</div>
          <p>Aucun projet pour l'instant.</p>
          <p class="muted">Créez un projet avec son budget, puis ajoutez vos dépenses en deux secondes.</p>
          <button class="btn-primary" onClick={newProject}>Créer un projet</button>
        </div>
      )}

      {done.length > 0 && (
        <details class="archived">
          <summary>Projets terminés ({done.length})</summary>
          <div class="list">{done.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        </details>
      )}

      {backupDue() && (
        <p class="backup-nudge">{lastBackupText()} · <button class="link" onClick={exportBackup}>Sauvegarder</button></p>
      )}
    </section>
  );
}

export function ProjectScreen({ id }: { id: string }) {
  const p = projectById(id);
  if (!p) {
    location.replace('#/projets');
    return null;
  }
  const b = budgetStatus(p);
  const list = expensesOf(id).slice().sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt);
  const days: { date: string; items: Expense[] }[] = [];
  for (const e of list) {
    const last = days[days.length - 1];
    if (last?.date === e.date) last.items.push(e); else days.push({ date: e.date, items: [e] });
  }
  const edit = () => openSheet(<ProjectForm project={p} />);
  const add = () => {
    addDraft.value = { ...addDraft.value, projectId: id };
    go('#/');
  };

  return (
    <section class="page">
      <header class="page-head">
        <button class="icon-btn" aria-label="Retour" onClick={() => go('#/projets')}><Icon.back /></button>
        <h1 class="title-sm ellipsis">{p.name}</h1>
        <button class="icon-btn" aria-label="Modifier le projet" onClick={edit}><Icon.edit /></button>
      </header>

      <div class={`card hero ${b.over ? 'over' : ''}`} style={{ '--c': p.color }}>
        <ProjectRing project={p} large />
        <div class="hero-nums">
          <span class="muted">Dépensé</span>
          <strong class="big-num">{money(b.spent)} <small>MAD</small></strong>
          {p.budget ? (
            <>
              <span class="muted">Budget {money0(p.budget)} MAD</span>
              <span class="rest">{restText(p)}</span>
            </>
          ) : <button class="link" onClick={edit}>Définir un budget</button>}
        </div>
      </div>

      <button class="btn-primary wide" onClick={add}>+ Ajouter une dépense</button>

      {days.length ? days.map(g => (
        <div key={g.date}>
          <h2 class="day">{dayLabel(g.date)}<span>{money(sum(g.items.map(e => e.amount)))} MAD</span></h2>
          <div class="card rows">
            {g.items.map(e => (
              <a key={e.id} class="row" href={`#/modifier/${e.id}`}>
                <span class={e.note ? '' : 'muted'}>{e.note || 'Sans note'}</span>
                <strong>{money(e.amount)}</strong>
              </a>
            ))}
          </div>
        </div>
      )) : <p class="muted center pad">Pas encore de dépense sur ce projet.</p>}
    </section>
  );
}

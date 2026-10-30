import type { ComponentChildren } from 'preact';
import { money, money0, sum, dayLabel } from '../lib/format';
import {
  addDraft, backupDue, budgetStatus, expensesOf, fundById, fundStatus, incomesOf, lastBackupText, liveFunds,
  projectById, projectsOf,
} from '../lib/store';
import { exportBackup, go, openSheet } from '../lib/ui';
import { Icon, ProjectRing, plural } from '../components/common';
import { FundForm, ProjectForm } from '../components/sheets';
import type { Fund, Project } from '../lib/types';

function restText(p: Project): string {
  const b = budgetStatus(p);
  return b.rest >= 0 ? `Reste ${money0(b.rest)} MAD` : `Dépassé de ${money0(-b.rest)} MAD`;
}

const signed = (n: number) => `${n < 0 ? '−' : ''}${money0(Math.abs(n))}`;

function ProjectCard({ project: p }: { project: Project }) {
  const b = budgetStatus(p);
  return (
    <a class={`card project-card ${b.over ? 'over' : ''}`} href={`#/poste/${p.id}`} style={{ '--c': p.color }}>
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

/** Reçu · Dépensé · Solde of a caisse. */
function FundNumbers({ fund, large }: { fund: Fund; large?: boolean }) {
  const s = fundStatus(fund);
  return (
    <div class={`fund-numbers ${large ? 'lg' : ''}`}>
      <div><span class="muted">Reçu</span><b>{money0(s.received)}</b></div>
      <div><span class="muted">Dépensé</span><b>{money0(s.spent)}</b></div>
      <div class={`solde ${s.solde < 0 ? 'neg' : ''}`}><span class="muted">Solde</span><b>{signed(s.solde)} <small>MAD</small></b></div>
    </div>
  );
}

function FundCard({ fund: f }: { fund: Fund }) {
  const postes = projectsOf(f.id).filter(p => !p.archived);
  return (
    <div class="card fund-card" style={{ '--c': f.color }}>
      <a class="fund-head" href={`#/caisse/${f.id}`}>
        <strong><i />{f.name}</strong>
        <Icon.chevron />
      </a>
      <FundNumbers fund={f} />
      {postes.length > 0 && (
        <div class="fund-postes">
          {postes.map(p => {
            const b = budgetStatus(p);
            return (
              <a key={p.id} class={`row ${b.over ? 'over' : ''}`} href={`#/poste/${p.id}`} style={{ '--c': p.color }}>
                <span><i />{p.name}</span>
                <small>{money0(b.spent)}{p.budget ? ` / ${money0(p.budget)}` : ''}</small>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FundsScreen() {
  const all = liveFunds.value;
  const open = all.filter(f => !f.archived);
  const closed = all.filter(f => f.archived);
  const newFund = () => openSheet(<FundForm />);

  return (
    <section class="page">
      <header class="page-head">
        <h1>Mes caisses</h1>
        <button class="btn-soft" onClick={newFund}>+ Caisse</button>
      </header>

      {open.length ? (
        <div class="list">{open.map(f => <FundCard key={f.id} fund={f} />)}</div>
      ) : (
        <div class="empty-state">
          <div class="empty-art">✿</div>
          <p>Aucune caisse pour l'instant.</p>
          <p class="muted">Une caisse reçoit l'argent (ex. Maison, Investissement). Ses postes sont ce que vous dépensez (Alimentation, Maison Tulip…).</p>
          <button class="btn-primary" onClick={newFund}>Créer une caisse</button>
        </div>
      )}

      {closed.length > 0 && (
        <details class="archived">
          <summary>Caisses fermées ({closed.length})</summary>
          <div class="list">{closed.map(f => <FundCard key={f.id} fund={f} />)}</div>
        </details>
      )}

      {backupDue() && (
        <p class="backup-nudge">{lastBackupText()} · <button class="link" onClick={exportBackup}>Sauvegarder</button></p>
      )}
    </section>
  );
}

type DayGroup<T> = { date: string; items: T[] };

function byDay<T extends { date: string; createdAt: number }>(list: T[]): DayGroup<T>[] {
  const sorted = list.slice().sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt);
  const days: DayGroup<T>[] = [];
  for (const e of sorted) {
    const last = days[days.length - 1];
    if (last?.date === e.date) last.items.push(e); else days.push({ date: e.date, items: [e] });
  }
  return days;
}

/** Entries grouped by day; tapping one opens it for editing. */
function History<T extends { id: string; date: string; createdAt: number; amount: number; note: string }>({ list, sign = '', empty }: {
  list: T[]; sign?: string; empty: ComponentChildren;
}) {
  const days = byDay(list);
  if (!days.length) return <p class="muted center pad">{empty}</p>;
  return (
    <>
      {days.map(g => (
        <div key={g.date}>
          <h2 class="day">{dayLabel(g.date)}<span>{sign}{money(sum(g.items.map(e => e.amount)))} MAD</span></h2>
          <div class={`card rows ${sign ? 'income-rows' : ''}`}>
            {g.items.map(e => (
              <a key={e.id} class="row" href={`#/modifier/${e.id}`}>
                <span class={e.note ? '' : 'muted'}>{e.note || 'Sans note'}</span>
                <strong>{sign}{money(e.amount)}</strong>
              </a>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function FundScreen({ id }: { id: string }) {
  const f = fundById(id);
  if (!f) {
    location.replace('#/caisses');
    return null;
  }
  const postes = projectsOf(id);
  const open = postes.filter(p => !p.archived);
  const done = postes.filter(p => p.archived);
  const addIncome = () => {
    addDraft.value = { ...addDraft.value, kind: 'income', fundId: id };
    go('#/');
  };

  return (
    <section class="page">
      <header class="page-head">
        <button class="icon-btn" aria-label="Retour" onClick={() => go('#/caisses')}><Icon.back /></button>
        <h1 class="title-sm ellipsis">{f.name}</h1>
        <button class="icon-btn" aria-label="Modifier la caisse" onClick={() => openSheet(<FundForm fund={f} />)}><Icon.edit /></button>
      </header>

      <div class="card hero fund-hero" style={{ '--c': f.color }}>
        <FundNumbers fund={f} large />
      </div>

      <button class="btn-primary wide" onClick={addIncome}>+ Ajouter une recette</button>

      <div class="section-head">
        <h2>Postes</h2>
        <button class="link" onClick={() => openSheet(<ProjectForm fundId={id} />)}>+ Nouveau poste</button>
      </div>
      {open.length
        ? <div class="list">{open.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        : <p class="muted center pad">Pas encore de poste dans cette caisse.</p>}
      {done.length > 0 && (
        <details class="archived">
          <summary>Postes terminés ({done.length})</summary>
          <div class="list">{done.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        </details>
      )}

      <div class="section-head"><h2>Recettes</h2></div>
      <History list={incomesOf(id)} sign="+" empty="Pas encore de recette dans cette caisse." />
    </section>
  );
}

export function ProjectScreen({ id }: { id: string }) {
  const p = projectById(id);
  if (!p) {
    location.replace('#/caisses');
    return null;
  }
  const b = budgetStatus(p);
  const fund = fundById(p.fundId);
  const edit = () => openSheet(<ProjectForm project={p} />);
  const add = () => {
    addDraft.value = { ...addDraft.value, kind: 'expense', projectId: id };
    go('#/');
  };

  return (
    <section class="page">
      <header class="page-head">
        <button class="icon-btn" aria-label="Retour" onClick={() => go(fund ? `#/caisse/${fund.id}` : '#/caisses')}><Icon.back /></button>
        <div class="title-stack ellipsis">
          <h1 class="title-sm">{p.name}</h1>
          {fund && <a class="muted small" href={`#/caisse/${fund.id}`}>Caisse {fund.name}</a>}
        </div>
        <button class="icon-btn" aria-label="Modifier le poste" onClick={edit}><Icon.edit /></button>
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

      <History list={expensesOf(id)} empty="Pas encore de dépense sur ce poste." />
    </section>
  );
}

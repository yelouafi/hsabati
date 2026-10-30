import { signal, computed } from '@preact/signals';
import * as db from './db';
import { sum, todayISO } from './format';
import type { Backup, Expense, Fund, Income, Project, Settings } from './types';

export const PROJECT_COLORS = ['#e6849b', '#9a7fd1', '#5fa883', '#e39a4f', '#5f9fd3', '#c9765c', '#c9a227', '#a35a7e'];

export const funds = signal<Fund[]>([]);
export const projects = signal<Project[]>([]);
export const expenses = signal<Expense[]>([]);
export const incomes = signal<Income[]>([]);
export const settings = signal<Settings>({ id: 'settings', accent: 'rose', lastProjectId: null });

export type EntryKind = 'expense' | 'income';
export type Draft = {
  kind: EntryKind;
  amount: string;
  note: string;
  date: string;
  projectId: string | null;
  fundId: string | null;
};

/** The add screen keeps its draft across navigation within a session. */
export const addDraft = signal<Draft>({ kind: 'expense', amount: '', note: '', date: todayISO(), projectId: null, fundId: null });

export const now = () => Date.now();

// ---------------------------------------------------------------- derived

const byCreation = <T extends { createdAt: number }>(a: T, b: T) => a.createdAt - b.createdAt;

export const liveFunds = computed(() => funds.value.filter(f => !f.deleted).sort(byCreation));
export const activeFunds = computed(() => liveFunds.value.filter(f => !f.archived));
export const liveProjects = computed(() => projects.value.filter(p => !p.deleted));
export const liveExpenses = computed(() => expenses.value.filter(e => !e.deleted));
export const liveIncomes = computed(() => incomes.value.filter(i => !i.deleted));

/** Postes you can spend on: not archived, in a caisse that is not archived. */
export const activeProjects = computed(() => {
  const open = new Set(activeFunds.value.map(f => f.id));
  return liveProjects.value.filter(p => !p.archived && open.has(p.fundId)).sort(byCreation);
});

function groupBy<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const l = map.get(k);
    if (l) l.push(x); else map.set(k, [x]);
  }
  return map;
}

const expensesByProject = computed(() => groupBy(liveExpenses.value, e => e.projectId));
const incomesByFund = computed(() => groupBy(liveIncomes.value, i => i.fundId));
const projectsByFund = computed(() => groupBy(liveProjects.value, p => p.fundId));

export const fundById = (id: string | null | undefined) => liveFunds.value.find(f => f.id === id);
export const projectById = (id: string | null | undefined) => liveProjects.value.find(p => p.id === id);
export const expensesOf = (projectId: string) => expensesByProject.value.get(projectId) ?? [];
export const incomesOf = (fundId: string) => incomesByFund.value.get(fundId) ?? [];
export const projectsOf = (fundId: string) => (projectsByFund.value.get(fundId) ?? []).slice().sort(byCreation);
export const spentOf = (projectId: string) => sum(expensesOf(projectId).map(e => e.amount));

export type BudgetStatus = { spent: number; pct: number; over: boolean; rest: number };

export function budgetStatus(p: Project): BudgetStatus {
  const spent = spentOf(p.id);
  const rest = p.budget - spent;
  return { spent, rest, pct: p.budget ? spent / p.budget : 0, over: !!p.budget && rest < 0 };
}

export type FundStatus = { received: number; spent: number; solde: number };

export function fundStatus(f: Fund): FundStatus {
  const received = sum(incomesOf(f.id).map(i => i.amount));
  const spent = sum(projectsOf(f.id).map(p => spentOf(p.id)));
  return { received, spent, solde: Math.round((received - spent) * 100) / 100 };
}

/** A caisse can be deleted only when nothing depends on it. */
export const fundIsEmpty = (f: Fund) => !projectsOf(f.id).length && !incomesOf(f.id).length;

// ---------------------------------------------------------------- actions

const DEFAULT_FUND_NAME = 'Général';

export async function load(): Promise<void> {
  const [fs, ps, es, is, meta] = await Promise.all([
    db.getAll<Fund>('funds'), db.getAll<Project>('projects'), db.getAll<Expense>('expenses'),
    db.getAll<Income>('incomes'), db.getAll<Settings>('meta'),
  ]);
  funds.value = fs;
  projects.value = ps;
  expenses.value = es;
  incomes.value = is;
  const saved = meta.find(m => m.id === 'settings');
  if (saved) settings.value = { ...settings.value, ...saved };
  await adoptOrphanProjects();
}

/**
 * Postes from before caisses existed (or from a v1 backup) have no caisse:
 * put them in a « Général » caisse, which she can then reorganise.
 */
async function adoptOrphanProjects(): Promise<void> {
  const known = new Set(funds.value.map(f => f.id));
  const orphans = projects.value.filter(p => !p.fundId || !known.has(p.fundId));
  if (!orphans.length) return;
  const fund = liveFunds.value.find(f => f.name === DEFAULT_FUND_NAME) ?? await saveFund(newFund(DEFAULT_FUND_NAME));
  for (const p of orphans) await saveProject({ ...p, fundId: fund.id });
}

function upsert<T extends { id: string }>(list: T[], rec: T): T[] {
  const i = list.findIndex(x => x.id === rec.id);
  return i === -1 ? [...list, rec] : list.map((x, j) => (j === i ? rec : x));
}

export async function saveFund(f: Fund): Promise<Fund> {
  const rec = { ...f, updatedAt: now() };
  funds.value = upsert(funds.value, rec);
  await db.put('funds', rec);
  return rec;
}

export async function saveProject(p: Project): Promise<Project> {
  const rec = { ...p, updatedAt: now() };
  projects.value = upsert(projects.value, rec);
  await db.put('projects', rec);
  return rec;
}

export async function saveExpense(e: Expense): Promise<Expense> {
  const rec = { ...e, updatedAt: now() };
  expenses.value = upsert(expenses.value, rec);
  await db.put('expenses', rec);
  return rec;
}

export async function saveIncome(i: Income): Promise<Income> {
  const rec = { ...i, updatedAt: now() };
  incomes.value = upsert(incomes.value, rec);
  await db.put('incomes', rec);
  return rec;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  settings.value = { ...settings.value, ...patch };
  await db.put('meta', settings.value);
}

const nextColor = (count: number) => PROJECT_COLORS[count % PROJECT_COLORS.length];

export function newFund(name: string): Fund {
  return { id: db.uid(), name: name.trim(), color: nextColor(liveFunds.value.length + 3), archived: false, createdAt: now() };
}

export function newProject(name: string, budget: number, fundId: string): Project {
  return {
    id: db.uid(), fundId, name: name.trim(), budget,
    color: nextColor(liveProjects.value.length), archived: false, createdAt: now(),
  };
}

type EntryFields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>;

export function newExpense(fields: EntryFields<Expense>, createdAt = now()): Expense {
  return { id: db.uid(), createdAt, ...fields };
}

export function newIncome(fields: EntryFields<Income>, createdAt = now()): Income {
  return { id: db.uid(), createdAt, ...fields };
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr');
export const findProjectByName = (name: string) => liveProjects.value.find(p => sameName(p.name, name));
export const findFundByName = (name: string) => liveFunds.value.find(f => sameName(f.name, name));

/** Merge records by id, keeping the most recently updated (backup restore, future sync). */
export async function mergeIn(data: Backup): Promise<number> {
  let changed = 0;
  async function merge<T extends { id: string; updatedAt?: number }>(store: db.StoreName, mine: T[], theirs: T[] = []) {
    const map = new Map(mine.map(r => [r.id, r]));
    const updates = theirs.filter(r => {
      const cur = map.get(r.id);
      return !cur || (r.updatedAt || 0) > (cur.updatedAt || 0);
    });
    updates.forEach(r => map.set(r.id, r));
    if (updates.length) await db.putMany(store, updates);
    changed += updates.length;
    return [...map.values()];
  }
  funds.value = await merge('funds', funds.value, data.funds);
  projects.value = await merge('projects', projects.value, data.projects);
  expenses.value = await merge('expenses', expenses.value, data.expenses);
  incomes.value = await merge('incomes', incomes.value, data.incomes);
  await adoptOrphanProjects();
  return changed;
}

export function backupData(): Backup {
  return {
    app: 'hsabati', version: 2, exportedAt: new Date().toISOString(),
    funds: funds.value, projects: projects.value, expenses: expenses.value, incomes: incomes.value,
  };
}

// ---------------------------------------------------------------- backups

const BACKUP_EVERY = 14 * 24 * 3600 * 1000;
const entryCount = () => liveExpenses.value.length + liveIncomes.value.length;

/** Nudge when there are entries not in a backup and the last one is old. */
export function backupDue(): boolean {
  const n = entryCount();
  if (n < 5 || n === settings.value.backupCount) return false;
  const since = settings.value.lastBackupAt
    || Math.min(...[...liveExpenses.value, ...liveIncomes.value].map(e => e.createdAt));
  return now() - since > BACKUP_EVERY;
}

export const backupCountNow = entryCount;

export function lastBackupText(): string {
  const last = settings.value.lastBackupAt;
  if (!last) return 'Aucune sauvegarde pour l’instant';
  const days = Math.floor((now() - last) / 86400000);
  return `Dernière sauvegarde ${days === 0 ? "aujourd'hui" : days === 1 ? 'hier' : `il y a ${days} jours`}`;
}

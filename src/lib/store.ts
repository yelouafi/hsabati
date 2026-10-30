import { signal, computed } from '@preact/signals';
import * as db from './db';
import { sum, todayISO } from './format';
import type { Backup, Expense, Project, Settings } from './types';

export const PROJECT_COLORS = ['#e6849b', '#9a7fd1', '#5fa883', '#e39a4f', '#5f9fd3', '#c9765c', '#c9a227', '#a35a7e'];

export const projects = signal<Project[]>([]);
export const expenses = signal<Expense[]>([]);
export const settings = signal<Settings>({ id: 'settings', accent: 'rose', lastProjectId: null });

export type Draft = { amount: string; note: string; date: string; projectId: string | null };

/** The add screen keeps its draft across navigation within a session. */
export const addDraft = signal<Draft>({ amount: '', note: '', date: todayISO(), projectId: null });

export const now = () => Date.now();

// ---------------------------------------------------------------- derived

export const liveProjects = computed(() => projects.value.filter(p => !p.deleted));
export const liveExpenses = computed(() => expenses.value.filter(e => !e.deleted));
export const activeProjects = computed(() =>
  liveProjects.value.filter(p => !p.archived).sort((a, b) => a.createdAt - b.createdAt));

const byProject = computed(() => {
  const map = new Map<string, Expense[]>();
  for (const e of liveExpenses.value) {
    const list = map.get(e.projectId);
    if (list) list.push(e); else map.set(e.projectId, [e]);
  }
  return map;
});

export const projectById = (id: string | null | undefined) => liveProjects.value.find(p => p.id === id);
export const expensesOf = (id: string) => byProject.value.get(id) ?? [];
export const spentOf = (id: string) => sum(expensesOf(id).map(e => e.amount));

export type BudgetStatus = { spent: number; pct: number; over: boolean; rest: number };

export function budgetStatus(p: Project): BudgetStatus {
  const spent = spentOf(p.id);
  const rest = p.budget - spent;
  return { spent, rest, pct: p.budget ? spent / p.budget : 0, over: !!p.budget && rest < 0 };
}

// ---------------------------------------------------------------- actions

export async function load(): Promise<void> {
  const [ps, es, meta] = await Promise.all([
    db.getAll<Project>('projects'), db.getAll<Expense>('expenses'), db.getAll<Settings>('meta'),
  ]);
  projects.value = ps;
  expenses.value = es;
  const saved = meta.find(m => m.id === 'settings');
  if (saved) settings.value = { ...settings.value, ...saved };
}

function upsert<T extends { id: string }>(list: T[], rec: T): T[] {
  const i = list.findIndex(x => x.id === rec.id);
  return i === -1 ? [...list, rec] : list.map((x, j) => (j === i ? rec : x));
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

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  settings.value = { ...settings.value, ...patch };
  await db.put('meta', settings.value);
}

export function newProject(name: string, budget: number): Project {
  return {
    id: db.uid(), name: name.trim(), budget,
    color: PROJECT_COLORS[liveProjects.value.length % PROJECT_COLORS.length],
    archived: false, createdAt: now(),
  };
}

export function newExpense(fields: Omit<Expense, 'id' | 'createdAt'>, createdAt = now()): Expense {
  return { id: db.uid(), createdAt, ...fields };
}

export function findProjectByName(name: string): Project | undefined {
  const k = name.trim().toLocaleLowerCase('fr');
  return liveProjects.value.find(p => p.name.toLocaleLowerCase('fr') === k);
}

/** Merge records by id, keeping the most recently updated (backup restore, future sync). */
export async function mergeIn(data: Pick<Backup, 'projects' | 'expenses'>): Promise<number> {
  let changed = 0;
  const merge = async <T extends { id: string; updatedAt?: number }>(store: 'projects' | 'expenses', mine: T[], theirs: T[] = []) => {
    const map = new Map(mine.map(r => [r.id, r]));
    const updates = theirs.filter(r => {
      const cur = map.get(r.id);
      return !cur || (r.updatedAt || 0) > (cur.updatedAt || 0);
    });
    updates.forEach(r => map.set(r.id, r));
    if (updates.length) await db.putMany(store, updates);
    changed += updates.length;
    return [...map.values()];
  };
  projects.value = await merge('projects', projects.value, data.projects);
  expenses.value = await merge('expenses', expenses.value, data.expenses);
  return changed;
}

export function backupData(): Backup {
  return { app: 'hsabati', version: 1, exportedAt: new Date().toISOString(), projects: projects.value, expenses: expenses.value };
}

// ---------------------------------------------------------------- backups

const BACKUP_EVERY = 14 * 24 * 3600 * 1000;

/** Nudge when there are expenses not in a backup and the last one is old. */
export function backupDue(): boolean {
  const list = liveExpenses.value;
  if (list.length < 5 || list.length === settings.value.backupCount) return false;
  const since = settings.value.lastBackupAt || Math.min(...list.map(e => e.createdAt));
  return now() - since > BACKUP_EVERY;
}

export function lastBackupText(): string {
  const last = settings.value.lastBackupAt;
  if (!last) return 'Aucune sauvegarde pour l’instant';
  const days = Math.floor((now() - last) / 86400000);
  return `Dernière sauvegarde ${days === 0 ? "aujourd'hui" : days === 1 ? 'hier' : `il y a ${days} jours`}`;
}

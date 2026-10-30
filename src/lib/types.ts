// Records are never hard-deleted (deleted: true) so backups and a future sync
// can merge by id + updatedAt.

export type Project = {
  id: string;
  name: string;
  budget: number;
  color: string;
  archived: boolean;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
};

export type Expense = {
  id: string;
  projectId: string;
  amount: number;
  note: string;
  /** ISO day, "2026-10-30" */
  date: string;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
};

export type Settings = {
  id: 'settings';
  accent: string;
  lastProjectId: string | null;
  lastBackupAt?: number;
  backupCount?: number;
};

export type Backup = {
  app: 'hsabati';
  version: 1;
  exportedAt: string;
  projects: Project[];
  expenses: Expense[];
};

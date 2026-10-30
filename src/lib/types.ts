// Records are never hard-deleted (deleted: true) so backups and a future sync
// can merge by id + updatedAt.
//
// Names on screen:  Fund = « caisse » (money comes in),
//                   Project = « poste » (money goes out, belongs to a caisse),
//                   Income = « recette », Expense = « dépense ».
// Solde of a caisse = its recettes − the dépenses of all its postes.

export type Fund = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
};

export type Project = {
  id: string;
  fundId: string;
  name: string;
  /** Optional spending limit (0 = none). */
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

export type Income = {
  id: string;
  fundId: string;
  amount: number;
  note: string;
  /** ISO day, "2026-10-30" */
  date: string;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
};

export type Theme = 'auto' | 'light' | 'dark';

export type Settings = {
  id: 'settings';
  accent: string;
  theme?: Theme;
  lastProjectId: string | null;
  lastFundId?: string | null;
  lastBackupAt?: number;
  backupCount?: number;
};

/** Version 1 had no funds/incomes and projects without fundId. */
export type Backup = {
  app: 'hsabati';
  version: 1 | 2;
  exportedAt: string;
  funds?: Fund[];
  projects: Project[];
  expenses: Expense[];
  incomes?: Income[];
};

import { test, expect } from 'vitest';
import { aiPrompt, parseImport } from './importFormat';

const e = (amount: number, note: string, line: number, date: string | null = null) => ({ amount, note, date, line });

test('recettes, postes and dépenses', () => {
  const { incomes, postes, errors } = parseImport(`+ 3000 salaire
+2500
# Alimentation
- 450 courses
2026-10-12 - 300,50 boucher
// à vérifier : 120 ?

# Tulip
- 1000 lit enfant
+ 100 remboursement`);
  expect(errors).toEqual([]);
  expect(incomes).toEqual([e(3000, 'salaire', 1), e(2500, '', 2), e(100, 'remboursement', 10)]);
  expect(postes).toEqual([
    { name: 'Alimentation', line: 3, expenses: [e(450, 'courses', 4), e(300.5, 'boucher', 5, '2026-10-12')] },
    { name: 'Tulip', line: 8, expenses: [e(1000, 'lit enfant', 9)] },
  ]);
});

test('a poste repeated later continues the first one', () => {
  const { postes } = parseImport('# Salon\n- 10\n# Cuisine\n- 5\n# salon\n- 20');
  expect(postes.map(p => [p.name, p.expenses.map(x => x.amount)])).toEqual([['Salon', [10, 20]], ['Cuisine', [5]]]);
});

test('anything ambiguous is an error with its line number', () => {
  const { errors } = parseImport(`- 50
menuisier: 1500
# Salon
- 1 500
- 1500 dh
- 0
2026-02-30 - 10
## Lit
#`);
  expect(errors.map(x => [x.line, x.message.split(' :')[0]])).toEqual([
    [1, 'Dépense sans poste'],
    [2, 'Ligne non reconnue'],
    [4, 'Montant invalide'],
    [5, 'Montant invalide'],
    [6, 'Le montant doit être supérieur à 0'],
    [7, 'Date invalide'],
    [8, 'Un seul niveau'],
    [9, 'Nom du poste manquant après #'],
  ]);
});

test('the AI prompt lists the existing postes', () => {
  expect(aiPrompt(['Tulip', 'Azure'])).toContain('postes qui existent déjà : Tulip, Azure');
  expect(aiPrompt([])).not.toContain('existent déjà');
});

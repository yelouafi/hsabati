import { test, expect } from 'vitest';
import { aiPrompt, parseImport } from './importFormat';

const e = (amount: number, note: string, line: number, date: string | null = null) => ({ amount, note, date, line });

test('caisses, recettes, postes and dépenses', () => {
  const { caisses, errors } = parseImport(`# Maison
+ 3000 salaire
+2500
## Alimentation
- 450 courses
2026-10-12 - 300,50 boucher
// à vérifier : 120 ?

# Investissement
## Tulip
- 1000 lit enfant`);
  expect(errors).toEqual([]);
  expect(caisses).toEqual([
    { name: 'Maison', line: 1, incomes: [e(3000, 'salaire', 2), e(2500, '', 3)], postes: [
      { name: 'Alimentation', line: 4, expenses: [e(450, 'courses', 5), e(300.5, 'boucher', 6, '2026-10-12')] },
    ] },
    { name: 'Investissement', line: 9, incomes: [], postes: [
      { name: 'Tulip', line: 10, expenses: [e(1000, 'lit enfant', 11)] },
    ] },
  ]);
});

test('a caisse or poste repeated later continues the first one', () => {
  const { caisses } = parseImport('# Maison\n## Alimentation\n- 10\n# Maison\n## alimentation\n- 20\n+ 5');
  expect(caisses).toHaveLength(1);
  expect(caisses[0].postes[0].expenses.map(x => x.amount)).toEqual([10, 20]);
  expect(caisses[0].incomes.map(x => x.amount)).toEqual([5]);
});

test('anything ambiguous is an error with its line number', () => {
  const { errors } = parseImport(`## Tulip
+ 100
# Maison
- 50
menuisier: 1500
## Salon
- 1 500
- 1500 dh
- 0
2026-02-30 - 10
#`);
  expect(errors.map(x => [x.line, x.message.split(' :')[0]])).toEqual([
    [1, 'Poste sans caisse'],
    [2, 'Recette sans caisse'],
    [4, 'Dépense sans poste'],
    [5, 'Ligne non reconnue'],
    [7, 'Montant invalide'],
    [8, 'Montant invalide'],
    [9, 'Le montant doit être supérieur à 0'],
    [10, 'Date invalide'],
    [11, 'Nom manquant après #'],
  ]);
});

test('the AI prompt lists the existing caisses', () => {
  expect(aiPrompt(['Maison', 'Investissement'])).toContain('mes caisses actuelles : Maison, Investissement');
  expect(aiPrompt([])).not.toContain('caisses actuelles');
});

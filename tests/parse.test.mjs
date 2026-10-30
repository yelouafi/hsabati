import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseExpenseLine, parseNotes, groupNotes } from '../app/js/parse.js';

test('parseAmount handles common notations', () => {
  const cases = {
    '1500': 1500, '1 500': 1500, '1 500': 1500, '1.500': 1500, '1,500': 1500,
    '455,5': 455.5, '455.50': 455.5, '12,75': 12.75, '0,500': 0.5,
    '1.500,50': 1500.5, '1,500.50': 1500.5, '1 500,50 dh': 1500.5,
    '1500dh': 1500, '1500 DH': 1500, '1500 MAD': 1500, '1500dhs': 1500, '200 dirhams': 200,
    '1,5k': 1500, '2k': 2000, '300+150': 450, '300 + 150 + 50,5': 500.5,
    '1.000.000': 1000000,
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(parseAmount(input), expected, input);
  }
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
});

test('parseExpenseLine finds label and amount', () => {
  assert.deepEqual(parseExpenseLine('menuisier: 1500'), { label: 'menuisier', amount: 1500 });
  assert.deepEqual(parseExpenseLine('menuisier 1500'), { label: 'menuisier', amount: 1500 });
  assert.deepEqual(parseExpenseLine('menuisier - 1 500 dh'), { label: 'menuisier', amount: 1500 });
  assert.deepEqual(parseExpenseLine('1500 menuisier'), { label: 'menuisier', amount: 1500 });
  assert.deepEqual(parseExpenseLine('- peinture 2 pots: 300+150'), { label: 'peinture 2 pots', amount: 450 });
  assert.deepEqual(parseExpenseLine('tissu = 455,50'), { label: 'tissu', amount: 455.5 });
});

test('parseNotes groups projects and expenses', () => {
  const text = `project 1

menuisier: 1500
plombier 800 dh

project 2

tapisserie: 455
Salon :
rideaux: 1.200`;
  const groups = groupNotes(parseNotes(text));
  assert.deepEqual(groups, [
    { name: 'project 1', expenses: [{ label: 'menuisier', amount: 1500 }, { label: 'plombier', amount: 800 }] },
    { name: 'project 2', expenses: [{ label: 'tapisserie', amount: 455 }] },
    { name: 'Salon', expenses: [{ label: 'rideaux', amount: 1200 }] },
  ]);
});

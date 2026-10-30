import { test, expect } from 'vitest';
import { parseAmount, parseExpenseLine, parseNotes, groupNotes } from './parse';

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
    expect(parseAmount(input), input).toBe(expected);
  }
  expect(parseAmount('')).toBeNull();
  expect(parseAmount('abc')).toBeNull();
});

test('parseExpenseLine finds label and amount', () => {
  expect(parseExpenseLine('menuisier: 1500')).toEqual({ label: 'menuisier', amount: 1500 });
  expect(parseExpenseLine('menuisier 1500')).toEqual({ label: 'menuisier', amount: 1500 });
  expect(parseExpenseLine('menuisier - 1 500 dh')).toEqual({ label: 'menuisier', amount: 1500 });
  expect(parseExpenseLine('1500 menuisier')).toEqual({ label: 'menuisier', amount: 1500 });
  expect(parseExpenseLine('- peinture 2 pots: 300+150')).toEqual({ label: 'peinture 2 pots', amount: 450 });
  expect(parseExpenseLine('tissu = 455,50')).toEqual({ label: 'tissu', amount: 455.5 });
});

test('a line with only an amount (and currency) has no label', () => {
  expect(parseExpenseLine('3000 dh')).toEqual({ label: '', amount: 3000 });
  expect(parseExpenseLine('400  dh')).toEqual({ label: '', amount: 400 });
  expect(parseExpenseLine('1500 MAD')).toEqual({ label: '', amount: 1500 });
  expect(parseExpenseLine('3000')).toEqual({ label: '', amount: 3000 });
  expect(parseExpenseLine('12 500')).toEqual({ label: '', amount: 12500 });
  expect(parseExpenseLine('1000 dh lit enfant')).toEqual({ label: 'lit enfant', amount: 1000 });
});

test('bare amounts under a project keep their full value', () => {
  const groups = groupNotes(parseNotes('Housees\n3000\n2500 dh\n400  dh'));
  expect(groups).toEqual([{ name: 'Housees', expenses: [
    { label: '', amount: 3000 }, { label: '', amount: 2500 }, { label: '', amount: 400 },
  ] }]);
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
  expect(groups).toEqual([
    { name: 'project 1', expenses: [{ label: 'menuisier', amount: 1500 }, { label: 'plombier', amount: 800 }] },
    { name: 'project 2', expenses: [{ label: 'tapisserie', amount: 455 }] },
    { name: 'Salon', expenses: [{ label: 'rideaux', amount: 1200 }] },
  ]);
});

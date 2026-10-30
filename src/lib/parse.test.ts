import { test, expect } from 'vitest';
import { parseAmount } from './parse';

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

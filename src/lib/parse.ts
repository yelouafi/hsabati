// Lenient parsing of typed amounts ("1 500", "1.500,50 dh", "1,5k", "300+150"),
// for the keypad and the budget field. Imported notes use the strict format
// in importFormat.ts instead.

const CURRENCY = /\b(dhs?|mad|dirhams?)\b|dh/gi;

// One number token: digits with optional space/./, separators, optional k suffix.
const NUMBER = /\d[\d\s.,  ]*\d|\d/;

/** Parse a single number token into a float, or null. */
function parseNumber(raw: string): number | null {
  let s = raw.replace(/[\s  ]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (dots && commas) {
    // Whichever comes last is the decimal separator.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (dots + commas > 1) {
    // "1.500.000" or "1,500,000": thousands separators.
    s = s.replace(/[.,]/g, '');
  } else if (dots + commas === 1) {
    const [int, frac] = s.split(/[.,]/);
    // "1.500" / "1,500" → thousands; "455,5" / "12.50" → decimals.
    s = frac.length === 3 && int !== '0' ? int + frac : `${int}.${frac}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a flexible amount string. Supports spaces, both decimal separators,
 * currency words, a "k" suffix and simple sums ("300 + 150").
 * Returns a number rounded to 2 decimals, or null when nothing parses.
 */
export function parseAmount(input: string | null | undefined): number | null {
  if (input == null) return null;
  const text = String(input).replace(CURRENCY, ' ').trim();
  if (!text) return null;
  let total = 0;
  let found = false;
  for (const part of text.split('+')) {
    const m = part.match(new RegExp('(?:' + NUMBER.source + ')\\s*(k)?', 'i'));
    if (!m) continue;
    let n = parseNumber(m[0].replace(/k$/i, ''));
    if (n == null) continue;
    if (m[1]) n *= 1000;
    total += n;
    found = true;
  }
  return found ? Math.round(total * 100) / 100 : null;
}

// Parsing of free-form amounts ("1 500", "1.500,50 dh", "1,5k", "300+150")
// and of notes pasted from the phone ("Projet\nmenuisier: 1500\n...").

export type ParsedExpense = { label: string; amount: number };
export type NoteLine =
  | { type: 'expense'; raw: string; label: string; amount: number }
  | { type: 'header'; raw: string; name: string };
export type NoteGroup = { name: string; expenses: ParsedExpense[] };

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

/**
 * Split an expense line into { label, amount }.
 * "menuisier: 1500" | "menuisier 1500" | "1500 menuisier" | "menuisier - 1 500 dh"
 */
export function parseExpenseLine(line: string): ParsedExpense | null {
  const clean = line.replace(/^[\s\-–•*·]+/, '').trim();
  if (!clean) return null;
  const colon = clean.lastIndexOf(':');
  if (colon !== -1) {
    const amount = parseAmount(clean.slice(colon + 1));
    if (amount != null) {
      return { label: tidyLabel(clean.slice(0, colon)), amount };
    }
  }
  // Amount at the end ("menuisier 1500 dh", "peinture 300+150").
  const tail = clean.match(/^(.*?)[\s=\-–]*((?:\d[\d\s.,  ]*k?\s*\+\s*)*\d[\d\s.,  ]*k?)\s*(dhs?|mad|dirhams?)?\s*$/i);
  if (tail && tail[1].trim()) {
    const amount = parseAmount(tail[2]);
    if (amount != null) return { label: tidyLabel(tail[1]), amount };
  }
  // Amount at the start ("1500 menuisier").
  const head = clean.match(/^(\d[\d\s.,  ]*k?)\s*(?:dhs?|mad|dirhams?)?\s*[:\-–]?\s*(.+)$/i);
  // A label needs a letter and is not just the currency ("3000", "3000 dh").
  if (head && /\p{L}/u.test(head[2]) && !/^(dhs?|mad|dirhams?)$/i.test(head[2].trim())) {
    const amount = parseAmount(head[1]);
    if (amount != null) return { label: tidyLabel(head[2]), amount };
  }
  // Just a number.
  const amount = parseAmount(clean);
  if (amount != null && /^[\d\s.,+k  ]*(dhs?|mad|dirhams?)?$/i.test(clean)) {
    return { label: '', amount };
  }
  return null;
}

function tidyLabel(s: string): string {
  return s.replace(/[\s:=\-–]+$/, '').replace(/^[\s:=\-–]+/, '').trim();
}

/**
 * Parse a pasted note into a list of lines classified as project headers or
 * expenses. A line is an expense when it has "label: amount", or a label with
 * an amount ≥ 10 at the end/start. Anything else that is not blank is a header
 * ("project 1", "Cuisine", "Salon :"). The UI lets the user flip any line.
 */
export function parseNotes(text: string): NoteLine[] {
  const out: NoteLine[] = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const exp = parseExpenseLine(line);
    const hasColonAmount = /:\s*\S/.test(line) && exp != null;
    if (exp && (hasColonAmount || exp.amount >= 10)) {
      out.push({ type: 'expense', raw: line, label: exp.label, amount: exp.amount });
    } else {
      out.push({ type: 'header', raw: line, name: line.replace(/[:\s]+$/, '') });
    }
  }
  return out;
}

/** Group parsed lines into [{ name, expenses: [{label, amount}] }]. */
export function groupNotes(lines: NoteLine[]): NoteGroup[] {
  const groups: NoteGroup[] = [];
  let current: NoteGroup | null = null;
  for (const l of lines) {
    if (l.type === 'header') {
      current = { name: l.name, expenses: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { name: 'Sans projet', expenses: [] };
        groups.push(current);
      }
      current.expenses.push({ label: l.label, amount: l.amount });
    }
  }
  return groups.filter(g => g.expenses.length);
}

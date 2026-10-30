// Parsing of free-form amounts ("1 500", "1.500,50 dh", "1,5k", "300+150")
// and of notes pasted from the phone ("Projet\nmenuisier: 1500\n...").

export type ParsedExpense = { label: string; amount: number };

/** One non-blank line of pasted notes. */
export type NoteLine =
  | { type: 'amount'; raw: string; label: string; amount: number }
  | { type: 'header'; raw: string; name: string }
  | { type: 'section'; raw: string; kind: 'income' | 'expense' };

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

// "Recettes", "Entrées :" switch the following amounts to income; "Dépenses"
// alone switches back. "Dépenses Tulip" is a header for « Tulip ».
const INCOME_SECTION = /^(recettes?|entr[ée]es?|rentr[ée]es?)\s*:?$/i;
const EXPENSE_SECTION = /^(d[ée]penses?|sorties?)\s*:?$/i;
const EXPENSE_PREFIX = /^d[ée]penses?\s+/i;

/**
 * Parse a pasted note into lines. A line is an amount when it has
 * "label: amount", or a label with an amount ≥ 10 at the end/start.
 * Anything else that is not blank is a section or a header ("Salon",
 * "project 1", "Dépenses Tulip"). The UI lets the user flip any line.
 */
export function parseNotes(text: string): NoteLine[] {
  const out: NoteLine[] = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const exp = parseExpenseLine(line);
    const hasColonAmount = /:\s*\S/.test(line) && exp != null;
    if (exp && (hasColonAmount || exp.amount >= 10)) {
      out.push({ type: 'amount', raw: line, label: exp.label, amount: exp.amount });
    } else if (INCOME_SECTION.test(line)) {
      out.push({ type: 'section', raw: line, kind: 'income' });
    } else if (EXPENSE_SECTION.test(line)) {
      out.push({ type: 'section', raw: line, kind: 'expense' });
    } else {
      out.push({ type: 'header', raw: line, name: headerName(line) });
    }
  }
  return out;
}

export const headerName = (line: string) => line.replace(/[:\s]+$/, '').replace(EXPENSE_PREFIX, '').trim() || line.trim();

/** A header becomes a caisse (if one has that name) or a poste. */
export type NoteGroup = {
  name: string;
  kind: 'fund' | 'project';
  expenses: ParsedExpense[];
  incomes: ParsedExpense[];
};

export type LineRole = 'header' | 'section' | 'expense' | 'income';

/**
 * Walk the lines with the current header and section as context:
 * amounts are expenses of the current poste, or incomes in a Recettes
 * section (for a poste, they go to its caisse). Returns the groups and, for
 * each line, its role and group index (for the preview).
 */
export function planNotes(lines: NoteLine[], isFund: (name: string) => boolean = () => false) {
  const groups: NoteGroup[] = [];
  const roles: { role: LineRole; group: number }[] = [];
  let current = -1;
  let mode: 'income' | 'expense' = 'expense';
  for (const l of lines) {
    if (l.type === 'header') {
      groups.push({ name: l.name, kind: isFund(l.name) ? 'fund' : 'project', expenses: [], incomes: [] });
      current = groups.length - 1;
      mode = 'expense';
      roles.push({ role: 'header', group: current });
    } else if (l.type === 'section') {
      mode = l.kind;
      roles.push({ role: 'section', group: current });
    } else {
      if (current === -1) {
        groups.push({ name: 'Sans poste', kind: 'project', expenses: [], incomes: [] });
        current = 0;
      }
      const entry = { label: l.label, amount: l.amount };
      if (mode === 'income') groups[current].incomes.push(entry); else groups[current].expenses.push(entry);
      roles.push({ role: mode, group: current });
    }
  }
  return { groups, roles };
}

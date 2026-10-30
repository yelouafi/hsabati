// Strict import format, for one caisse at a time (chosen in the import
// sheet). Messy notes are cleaned up beforehand (by hand or by an AI chat,
// see aiPrompt), so nothing here is guessed:
//
//   + 3000 salaire              recette into the caisse
//   # Alimentation              poste (created if new)
//   - 450 courses               dépense on the poste above
//   2026-10-12 - 300 boucher    optional date first (otherwise the sheet's date)
//   // anything                 comment, ignored
//
// Amounts are digits with optional decimals: 1500, 1500,50 or 1500.50.

export type ImportEntry = { amount: number; note: string; date: string | null; line: number };
export type ImportPoste = { name: string; line: number; expenses: ImportEntry[] };
export type ImportError = { line: number; text: string; message: string };
export type ImportResult = { incomes: ImportEntry[]; postes: ImportPoste[]; errors: ImportError[] };

const ENTRY = /^(?:(\d{4}-\d{2}-\d{2})\s+)?([+-])\s*(\d+(?:[.,]\d{1,2})?)(?:\s+(.*))?$/;

function validDate(iso: string): boolean {
  const d = new Date(iso + 'T12:00');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');

/** Parse the import text into recettes, postes with their dépenses, and line errors. */
export function parseImport(text: string): ImportResult {
  const incomes: ImportEntry[] = [];
  const postes: ImportPoste[] = [];
  const errors: ImportError[] = [];
  let poste: ImportPoste | null = null;

  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const t = raw.trim();
    const fail = (message: string) => errors.push({ line, text: t, message });
    if (!t || t.startsWith('//')) return;

    if (t.startsWith('#')) {
      if (t.startsWith('##')) return fail('Un seul niveau : « # Poste »');
      const name = t.slice(1).trim();
      if (!name) return fail('Nom du poste manquant après #');
      // The same poste twice in a text: continue the first one.
      poste = postes.find(p => sameName(p.name, name)) ?? null;
      if (!poste) postes.push(poste = { name, line, expenses: [] });
      return;
    }

    const m = t.match(ENTRY);
    if (!m) {
      if (/^[+-]/.test(t) || /^\d{4}-\d{2}-\d{2}\s/.test(t)) return fail('Montant invalide : chiffres seulement, ex. 1500 ou 1500,50');
      return fail('Ligne non reconnue : commencez par #, + ou -');
    }
    const [, date, sign, num, note = ''] = m;
    // "- 1 500" or "- 1500 dh" would silently become 1 / "500" or a note "dh".
    if (/^\d/.test(note) || /^(dhs?|mad|dirhams?)\b/i.test(note)) {
      return fail('Montant invalide : chiffres seulement, ex. 1500 ou 1500,50');
    }
    if (date && !validDate(date)) return fail(`Date invalide : ${date}`);
    const amount = Number(num.replace(',', '.'));
    if (!(amount > 0)) return fail('Le montant doit être supérieur à 0');
    const entry: ImportEntry = { amount, note: note.trim(), date: date ?? null, line };
    if (sign === '+') incomes.push(entry);
    else if (!poste) fail('Dépense sans poste : ajoutez une ligne « # Poste » avant');
    else poste.expenses.push(entry);
  });

  return { incomes, postes, errors };
}

/** Instructions to paste into an AI chat together with messy notes for one caisse. */
export function aiPrompt(existingPostes: string[]): string {
  const known = existingPostes.length
    ? `- postes qui existent déjà : ${existingPostes.join(', ')} (réutilise ces noms quand ça correspond).\n`
    : '';
  return `Transforme mes notes de dépenses ci-dessous dans ce format exact :

+ 3000 note                ← une recette (argent reçu)
# Nom du poste             ← un poste : ce sur quoi on dépense (ex. Alimentation, Maison Tulip)
- 450 note                 ← une dépense sur le poste au-dessus
2026-10-12 - 300 note      ← date facultative en début de ligne

Règles :
- un seul niveau de titres (#) : les postes. Le détail d’une dépense (lit enfant, transport…) va dans la note, pas dans un poste.
- « Recettes », « Dépenses », « Entrées » ne sont pas des postes : des montants sous « Recettes » deviennent des lignes « + ».
${known}- une opération par ligne ; montant en chiffres seulement, sans espace ni devise (1500 ou 1500,50) ; ne change jamais les montants.
- corrige l’orthographe des notes.
- si une ligne est ambiguë, recopie-la en commentaire : // …

Réponds uniquement avec le texte formaté.

Mes notes :
`;
}

// Strict import format. Messy notes are cleaned up beforehand (by hand or by
// an AI chat, see aiPrompt), so nothing here is guessed:
//
//   # Maison                    caisse (created if new)
//   + 3000 salaire              recette into the caisse above
//   ## Alimentation             poste of the caisse above (created if new)
//   - 450 courses               dépense on the poste above
//   2026-10-12 - 300 boucher    optional date first (otherwise the sheet's date)
//   // anything                 comment, ignored
//
// Amounts are digits with optional decimals: 1500, 1500,50 or 1500.50.

export type ImportEntry = { amount: number; note: string; date: string | null; line: number };
export type ImportPoste = { name: string; line: number; expenses: ImportEntry[] };
export type ImportCaisse = { name: string; line: number; incomes: ImportEntry[]; postes: ImportPoste[] };
export type ImportError = { line: number; text: string; message: string };

const ENTRY = /^(?:(\d{4}-\d{2}-\d{2})\s+)?([+-])\s*(\d+(?:[.,]\d{1,2})?)(?:\s+(.*))?$/;

function validDate(iso: string): boolean {
  const d = new Date(iso + 'T12:00');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');

/** Parse the import text into caisses (with recettes and postes) and line errors. */
export function parseImport(text: string): { caisses: ImportCaisse[]; errors: ImportError[] } {
  const caisses: ImportCaisse[] = [];
  const errors: ImportError[] = [];
  let caisse: ImportCaisse | null = null;
  let poste: ImportPoste | null = null;

  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const t = raw.trim();
    const fail = (message: string) => errors.push({ line, text: t, message });
    if (!t || t.startsWith('//')) return;

    if (t.startsWith('#')) {
      const m = t.match(/^(#{1,2})\s*(.*)$/)!;
      const name = m[2].trim();
      if (!name) return fail('Nom manquant après #');
      if (m[1] === '#') {
        // The same caisse twice in a text: continue the first one.
        caisse = caisses.find(c => sameName(c.name, name)) ?? null;
        if (!caisse) caisses.push(caisse = { name, line, incomes: [], postes: [] });
        poste = null;
      } else {
        if (!caisse) return fail('Poste sans caisse : ajoutez une ligne « # Caisse » avant');
        poste = caisse.postes.find(p => sameName(p.name, name)) ?? null;
        if (!poste) caisse.postes.push(poste = { name, line, expenses: [] });
      }
      return;
    }

    const m = t.match(ENTRY);
    if (!m) {
      if (/^[+-]/.test(t) || /^\d{4}-\d{2}-\d{2}\s/.test(t)) return fail('Montant invalide : chiffres seulement, ex. 1500 ou 1500,50');
      return fail('Ligne non reconnue : commencez par #, ##, + ou -');
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
    if (sign === '+') {
      if (!caisse) return fail('Recette sans caisse : ajoutez une ligne « # Caisse » avant');
      caisse.incomes.push(entry);
    } else {
      if (!poste) return fail('Dépense sans poste : ajoutez une ligne « ## Poste » avant');
      poste.expenses.push(entry);
    }
  });

  return { caisses, errors };
}

/** Instructions to paste into an AI chat together with messy notes. */
export function aiPrompt(existingCaisses: string[]): string {
  return [
    'Transforme mes notes de dépenses ci-dessous dans ce format exact, sans rien inventer :',
    '',
    '# Nom de la caisse        (là où l’argent arrive, ex. Maison, Investissement)',
    '+ 3000 note               (une recette : argent reçu dans cette caisse)',
    '## Nom du poste           (ce sur quoi on dépense, dans la caisse au-dessus)',
    '- 450 note                (une dépense sur ce poste)',
    '',
    'Règles :',
    '- une opération par ligne ; montant en chiffres seulement, sans espace ni devise (1500 ou 1500,50) ;',
    '- si la date est connue, mets-la au début de la ligne : 2026-10-12 - 450 courses ;',
    '- corrige l’orthographe des notes, mais ne change pas les montants ;',
    '- si une ligne est ambiguë (caisse ou poste inconnus, montant douteux), recopie-la en commentaire : // …',
    existingCaisses.length ? `- mes caisses actuelles : ${existingCaisses.join(', ')} (réutilise ces noms).` : '',
    '',
    'Réponds uniquement avec le texte formaté.',
    '',
    'Mes notes :',
    '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 1500 → "1 500", 455.5 → "455,5" */
export const money = (n: number) => nf.format(n || 0);
export const money0 = (n: number) => nf0.format(Math.round(n || 0));

/** Sum without float drift. */
export const sum = (list: number[]) => Math.round(list.reduce((t, n) => t + n * 100, 0)) / 100;

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dayFmtYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** "Aujourd'hui", "Hier", "mardi 3 mars", "3 mars 2025" */
export function dayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Aujourd'hui";
  const y = new Date(today + 'T12:00'); y.setDate(y.getDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return 'Hier';
  const d = new Date(iso + 'T12:00');
  const s = d.getFullYear() === new Date().getFullYear() ? dayFmt.format(d) : dayFmtYear.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Calendar days are local 'YYYY-MM-DD' strings, which sort in date order.
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(day: string, n: number) {
  const d = parseDay(day);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
// Whole days from `from` to `to`, negative when `to` is earlier.
export const daysBetween = (from: string, to: string) =>
  Math.round((+parseDay(to) - +parseDay(from)) / 86400000);

// A to-do's repeat rule, stored as JSON. Weekly rules repeat on `weekdays`
// (0 is Sunday) and monthly ones on `monthDay`; both default to the day of
// the to-do's date.
export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type Repeat = {
  freq: Freq;
  interval: number;
  weekdays?: number[];
  monthDay?: number;
};
const freqs = ['daily', 'weekly', 'monthly', 'yearly'];
const whole = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
export function parseRepeat(text: string): Repeat | null {
  if (!text) return null;
  try {
    const r = JSON.parse(text) as Repeat;
    if (!r || !freqs.includes(r.freq)) return null;
    const rule: Repeat = {
      freq: r.freq,
      interval: whole(r.interval, 1, 99) ? r.interval : 1,
    };
    if (
      r.freq === 'weekly' &&
      Array.isArray(r.weekdays) &&
      r.weekdays.length &&
      r.weekdays.every((w) => whole(w, 0, 6))
    )
      rule.weekdays = [...new Set(r.weekdays)];
    if (r.freq === 'monthly' && whole(r.monthDay, 1, 31))
      rule.monthDay = r.monthDay;
    return rule;
  } catch {
    return null;
  }
}
export const formatRepeat = (rule: Repeat | null) =>
  rule ? JSON.stringify(rule) : '';
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

// The day after `day` that `rule` repeats on.
export function nextDate(day: string, rule: Repeat) {
  const d = parseDay(day);
  const n = rule.interval;
  if (rule.freq === 'daily') return addDays(day, n);
  if (rule.freq === 'weekly') {
    // Every nth week counted from the week of `day`, starting on Monday.
    const days = rule.weekdays ?? [d.getDay()];
    const monday = addDays(day, -((d.getDay() + 6) % 7));
    for (let k = 1; k <= 7 * n + 7; k++) {
      const next = addDays(day, k);
      const week = Math.floor(daysBetween(monday, next) / 7);
      if (week % n === 0 && days.includes(parseDay(next).getDay())) return next;
    }
    return addDays(day, 7 * n);
  }
  if (rule.freq === 'monthly') {
    // Short months repeat on their last day.
    const want = rule.monthDay ?? d.getDate();
    const thisMonth = Math.min(want, lastDay(d.getFullYear(), d.getMonth()));
    if (thisMonth > d.getDate())
      return dayKey(new Date(d.getFullYear(), d.getMonth(), thisMonth));
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(want, lastDay(t.getFullYear(), t.getMonth())));
    return dayKey(t);
  }
  const t = new Date(d.getFullYear() + n, d.getMonth(), 1);
  t.setDate(Math.min(d.getDate(), lastDay(t.getFullYear(), t.getMonth())));
  return dayKey(t);
}

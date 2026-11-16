// Words in a new to-do's title that set its other fields as it is typed:
// a date such as "today", "Friday" or "Sunday, 9 May 2027", a repeat such as
// "every Monday", a project or area as "#" and its name, and a section of
// that project as "/" and its name. The editor marks them, and takes them
// out of the title when the to-do is saved.
import { addDays, dayKey, formatRepeat, parseDay, type Repeat } from './dates';

// `value` is the day a date token sets, the repeat rule a repeat token sets
// as JSON, or the id of the list ('' for the Inbox) or section a list or
// section token moves the to-do to. A repeat token's `day` is the day it
// starts on.
export type Token = {
  kind: 'date' | 'repeat' | 'list' | 'section';
  start: number;
  end: number;
  value: string;
  day?: string;
};
type Named = { id: string; title: string };

const weekdays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const weekday = `(${weekdays.join('|')})`;
const month =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ordinal = '(\\d{1,2})(?:st|nd|rd|th)?';
const year = '(?:,?\\s+(\\d{4}))?';
// "on" before a day goes with it, so "Call on Friday" leaves "Call".
const on = '(?:on\\s+)?';
const monthOf = (name: string) =>
  months.indexOf(name.slice(0, 3).toLowerCase());

// Day `d` of month `m` in `y`, or without a year, its next time from today.
function calendarDay(d: number, m: number, y: string, today: string) {
  const inYear = (year: number) => {
    const date = new Date(year, m, d);
    return date.getMonth() === m ? dayKey(date) : null;
  };
  if (y) return inYear(Number(y));
  // 29 February can be up to eight years away.
  const thisYear = parseDay(today).getFullYear();
  for (let year = thisYear; year <= thisYear + 8; year++) {
    const day = inYear(year);
    if (day && day >= today) return day;
  }
  return null;
}
// A weekday names its next day after today; "this" also allows today.
function nextWeekday(name: string, today: string, orToday: boolean) {
  const diff =
    (weekdays.indexOf(name.toLowerCase()) - parseDay(today).getDay() + 7) % 7;
  return addDays(today, diff === 0 && !orToday ? 7 : diff);
}
function addMonths(today: string, n: number) {
  const d = parseDay(today);
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), last));
  return dayKey(t);
}
const count = (n: string) => (/^\d+$/.test(n) ? Number(n) : 1);

// Each pattern's groups, and today, give its day, or null if there is none.
const dates: [string, (g: string[], today: string) => string | null][] = [
  ['today|tonight', (_, today) => today],
  ['tomorrow|tmrw', (_, today) => addDays(today, 1)],
  [
    `${on}(?:${weekday},?\\s+)?${ordinal}\\s+${month}${year}`,
    ([, d, m, y], today) => calendarDay(Number(d), monthOf(m), y, today),
  ],
  [
    `${on}(?:${weekday},?\\s+)?${month}\\s+${ordinal}${year}`,
    ([, m, d, y], today) => calendarDay(Number(d), monthOf(m), y, today),
  ],
  [
    `${on}(\\d{4})-(\\d{2})-(\\d{2})`,
    ([y, m, d], today) => calendarDay(Number(d), Number(m) - 1, y, today),
  ],
  [
    `${on}(?:(next|this)\\s+)?${weekday}`,
    ([which, day], today) =>
      nextWeekday(day, today, which?.toLowerCase() === 'this'),
  ],
  [
    'next\\s+week',
    (_, today) => addDays(today, 7 - ((parseDay(today).getDay() + 6) % 7)),
  ],
  [
    'in\\s+(\\d{1,3}|an?|one)\\s+(day|week|month)s?',
    ([n, unit], today) =>
      unit.toLowerCase() === 'month'
        ? addMonths(today, count(n))
        : addDays(today, count(n) * (unit.toLowerCase() === 'week' ? 7 : 1)),
  ],
];
const workdays = [1, 2, 3, 4, 5];
const anyWeekday = `(?:${weekdays.join('|')})`;
const every = (other: string | undefined) =>
  !other || other.toLowerCase() === 'other' ? (other ? 2 : 1) : Number(other);
// Each pattern's groups give its rule, or null if there is none.
const repeats: [string, (g: string[]) => Repeat | null][] = [
  [
    'every\\s+(?:weekday|workday|business\\s+day)',
    () => ({ freq: 'weekly', interval: 1, weekdays: workdays }),
  ],
  [
    `every\\s+(?:(other)\\s+)?(${anyWeekday}(?:(?:\\s*,\\s*|\\s*&\\s*|\\s+)(?:and\\s+)?${anyWeekday})*)`,
    ([other, days]) => ({
      freq: 'weekly',
      interval: every(other),
      weekdays: [
        ...new Set(
          days
            .toLowerCase()
            .match(new RegExp(anyWeekday, 'g'))!
            .map((d) => weekdays.indexOf(d)),
        ),
      ].sort((a, b) => a - b),
    }),
  ],
  [
    'every\\s+(?:(other|\\d{1,2})\\s+)?(day|week|month|year)s?',
    ([n, unit]) => {
      const interval = every(n);
      const freq = `${unit.toLowerCase() === 'day' ? 'dai' : unit.toLowerCase()}ly`;
      return interval >= 1 && interval <= 99
        ? { freq: freq as Repeat['freq'], interval }
        : null;
    },
  ],
  [
    'every\\s+(\\d{1,2})(?:st|nd|rd|th)(?:\\s+of\\s+the\\s+month)?',
    ([d]) =>
      Number(d) >= 1 && Number(d) <= 31
        ? { freq: 'monthly', interval: 1, monthDay: Number(d) }
        : null,
  ],
];
// The first day from today that `rule` falls on.
function firstDay(rule: Repeat, today: string) {
  if (rule.weekdays)
    for (let k = 0; k < 7; k++) {
      const day = addDays(today, k);
      if (rule.weekdays.includes(parseDay(day).getDay())) return day;
    }
  if (rule.monthDay) {
    const d = parseDay(today);
    for (let n = 0; ; n++) {
      const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
      const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
      t.setDate(Math.min(rule.monthDay, last));
      if (dayKey(t) >= today) return dayKey(t);
    }
  }
  return today;
}
// Each starts a word and ends one; the leading group is what comes before.
const pattern = (source: string) =>
  new RegExp(`(^|[^\\w#/])(?:${source})(?!\\w)`, 'gi');
const datePatterns = dates.map(([s, day]) => [pattern(s), day] as const);
const repeatPatterns = repeats.map(([s, rule]) => [pattern(s), rule] as const);
// Of overlapping tokens, the one starting first wins, then the longest, so
// "Sunday, 9 May" is one date; of the rest, the last. None may overlap
// `taken`.
function lastOf(found: Token[], taken: Token[]) {
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  let last: Token | undefined;
  for (const t of found)
    if (
      (!last || t.start >= last.end) &&
      !taken.some((o) => t.start < o.end && t.end > o.start)
    )
      last = t;
  return last;
}
// The last `mark` starting a word in `text` and followed by one of `names`,
// the longest that matches, so "#Home Office" beats "#Home".
function lastName(
  text: string,
  mark: string,
  kind: 'list' | 'section',
  names: Named[],
): Token | undefined {
  let found: Token | undefined;
  for (let i = text.indexOf(mark); i !== -1; i = text.indexOf(mark, i + 1)) {
    if (i > 0 && /\w/.test(text[i - 1])) continue;
    let best: Named | undefined;
    for (const l of names) {
      const end = i + 1 + l.title.length;
      if (
        l.title.trim() &&
        text.slice(i + 1, end).toLowerCase() === l.title.toLowerCase() &&
        !/\w/.test(text[end] ?? '') &&
        l.title.length > (best?.title.length ?? 0)
      )
        best = l;
    }
    if (best)
      found = {
        kind,
        start: i,
        end: i + 1 + best.title.length,
        value: best.id,
      };
  }
  return found;
}

// The tokens in `text`, at most one of each kind: the last one typed wins.
// `lists` are the projects, with their sections, and areas, in sidebar
// order; "#Inbox" moves a to-do to the Inbox. Sections are those of the
// list named, or else of `current`, the to-do's list. A repeat starts on
// the date typed, or else the first day it falls on.
export function parseTitle(
  text: string,
  today: string,
  lists: (Named & { sections?: Named[] })[],
  current: string,
): Token[] {
  const list = lastName(text, '#', 'list', [
    ...lists,
    { id: '', title: 'Inbox' },
  ]);
  const sections =
    lists.find((l) => l.id === (list ? list.value : current))?.sections ?? [];
  const section = lastName(text, '/', 'section', sections);
  const names = [list, section].filter((t): t is Token => !!t);
  const found = (
    patterns: readonly (readonly [
      RegExp,
      (g: string[], today: string) => unknown,
    ])[],
    kind: 'date' | 'repeat',
  ) =>
    patterns.flatMap(([re, read]) =>
      [...text.matchAll(re)].flatMap((m): Token[] => {
        const v = read(m.slice(2), today);
        if (!v) return [];
        const start = m.index + m[1].length;
        const end = m.index + m[0].length;
        return [
          kind === 'date'
            ? { kind, start, end, value: v as string }
            : { kind, start, end, value: formatRepeat(v as Repeat) },
        ];
      }),
    );
  // A repeat's weekday isn't also a date.
  const repeat = lastOf(found(repeatPatterns, 'repeat'), names);
  const date = lastOf(
    found(datePatterns, 'date'),
    repeat ? [...names, repeat] : names,
  );
  if (repeat) {
    // A weekly or monthly rule repeats on its first day unless it says.
    const rule = JSON.parse(repeat.value) as Repeat;
    const day = date?.value ?? firstDay(rule, today);
    const d = parseDay(day);
    if (rule.freq === 'weekly' && !rule.weekdays) rule.weekdays = [d.getDay()];
    if (rule.freq === 'monthly' && !rule.monthDay) rule.monthDay = d.getDate();
    repeat.value = formatRepeat(rule);
    repeat.day = day;
  }
  return [...names, repeat, date]
    .filter((t): t is Token => !!t)
    .sort((a, b) => a.start - b.start);
}

// `text` without `tokens`, and the spaces they leave behind.
export function stripTokens(text: string, tokens: Token[]) {
  let rest = text;
  for (const t of [...tokens].sort((a, b) => b.start - a.start))
    rest = rest.slice(0, t.start) + ' ' + rest.slice(t.end);
  return rest.replace(/\s+/g, ' ').trim();
}

// The "#" or "/" being typed nearest before the caret at `caret`, and the
// name after it.
export function nameQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  const start = Math.max(before.lastIndexOf('#'), before.lastIndexOf('/'));
  if (start === -1 || (start > 0 && /\w/.test(text[start - 1]))) return;
  return {
    mark: text[start] as '#' | '/',
    start,
    query: text.slice(start + 1, caret),
  };
}
// The lists or sections whose name `query` could be the start of: those starting with
// it, then those with a later word starting with it. None are left once
// `query` is a whole name that no other continues, or one and a space.
export function suggestNames<T extends { title: string }>(
  query: string,
  lists: T[],
) {
  const q = query.toLowerCase();
  const named = lists.filter((l) => l.title.trim());
  if (/\s$/.test(q) && named.some((l) => l.title.toLowerCase() === q.trimEnd()))
    return [];
  const starts = named.filter((l) => l.title.toLowerCase().startsWith(q));
  const words = named.filter(
    (l) =>
      !starts.includes(l) &&
      l.title
        .toLowerCase()
        .split(/\s+/)
        .slice(1)
        .some((w) => w.startsWith(q)),
  );
  const found = [...starts, ...words];
  return found.length === 1 && found[0].title.toLowerCase() === q ? [] : found;
}
// `text` with the "#" or "/" name typed at `start`, up to the end of the
// word at `caret`, completed to `title` and a space; and the caret after
// them.
export function completeName(
  text: string,
  start: number,
  caret: number,
  title: string,
) {
  const after = text.slice(caret).replace(/^\S+/, '');
  const name = `${text[start]}${title}${after.startsWith(' ') ? '' : ' '}`;
  return {
    text: text.slice(0, start) + name + after,
    caret: start + name.length + (after.startsWith(' ') ? 1 : 0),
  };
}

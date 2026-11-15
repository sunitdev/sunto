import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as store from '../storage/store';
import type { Fields, Task } from '../storage/model';
import {
  addDays,
  dayKey,
  daysBetween,
  formatRepeat,
  nextDate,
  parseDay,
  parseRepeat,
  type Freq,
  type Repeat,
} from '../storage/dates';
import { useDismiss } from '../hooks/useDismiss';
import { place } from '../hooks/usePhone';
import { RepeatIcon } from './icons';

type Preset = Freq | 'weekdays';
type Mode = Preset | 'never' | 'custom';
const workdays = [1, 2, 3, 4, 5];
// Weekdays in display order, Monday first; 0 is Sunday.
const week = [1, 2, 3, 4, 5, 6, 0];
const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const units: Record<Freq, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};
const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  parseDay(day).toLocaleDateString('en-GB', options);
const shortDate = (day: string) =>
  format(day, { weekday: 'short', day: 'numeric', month: 'short' });
function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}
const isWorkdays = (r: Repeat) =>
  r.freq === 'weekly' &&
  r.interval === 1 &&
  r.weekdays?.length === 5 &&
  workdays.every((w) => r.weekdays!.includes(w));
// The rule a preset makes for a to-do due on `day`.
function preset(kind: Preset, day: string): Repeat {
  const d = parseDay(day);
  if (kind === 'weekdays')
    return { freq: 'weekly', interval: 1, weekdays: workdays };
  if (kind === 'weekly')
    return { freq: 'weekly', interval: 1, weekdays: [d.getDay()] };
  if (kind === 'monthly')
    return { freq: 'monthly', interval: 1, monthDay: d.getDate() };
  return { freq: kind, interval: 1 };
}
// Whether no preset for `day` makes `rule`.
function isCustom(rule: Repeat, day: string) {
  const d = parseDay(day);
  const days = rule.weekdays ?? [d.getDay()];
  return (
    rule.interval !== 1 ||
    (rule.freq === 'weekly' &&
      !isWorkdays(rule) &&
      !(days.length === 1 && days[0] === d.getDay())) ||
    (rule.freq === 'monthly' && (rule.monthDay ?? d.getDate()) !== d.getDate())
  );
}
function describe(rule: Repeat, day: string, custom: boolean) {
  if (isWorkdays(rule) && !custom) return 'Every weekday';
  const n = rule.interval;
  let text = `Every ${n === 1 ? units[rule.freq][0] : `${n} ${units[rule.freq][1]}`}`;
  if (rule.freq === 'weekly' && rule.weekdays?.length)
    text += ` on ${week
      .filter((w) => rule.weekdays!.includes(w))
      .map((w) => dayNames[w].slice(0, 3))
      .join(', ')}`;
  if (rule.freq === 'monthly')
    text += ` on the ${ordinal(rule.monthDay ?? parseDay(day).getDate())}`;
  if (rule.freq === 'yearly')
    text += ` on ${format(day, { day: 'numeric', month: 'long' })}`;
  return text;
}
function Chevron({ d }: { d: string }) {
  return (
    <svg
      className="chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
function Stroke({ d, width = 2.6 }: { d: string; width?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
const quickIcons = {
  today: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2l2.7 5.4 6 .9-4.35 4.2 1.03 5.95L12 16.85l-5.38 2.8 1.03-5.95L3.3 9.5l6-.9z"
        fill="#f2c230"
      />
    </svg>
  ),
  tomorrow: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f0913a"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 17.5h16M7.5 17.5a4.5 4.5 0 0 1 9 0M12 6.5v3M5.8 10.3l1.6 1.6M18.2 10.3l-1.6 1.6" />
    </svg>
  ),
  weekend: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9b7fe6"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 11V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
      <path d="M3 12.5a1.5 1.5 0 0 1 3 0V14h12v-1.5a1.5 1.5 0 0 1 3 0V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M6 17v2M18 17v2" />
    </svg>
  ),
  nextWeek: (
    <svg
      className="next-week-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M9.5 15h5M12.5 12.8l2.2 2.2-2.2 2.2" />
    </svg>
  ),
};
// Sets `task`'s date and repeat rule: quick picks and a month calendar, then
// a page of repeat presets and one for a custom rule. It opens above the
// element that `anchor` measures, aligned to its right edge, or below it when
// there is no room. Escape steps back a page before closing.
export function DatePopover({
  task,
  today,
  anchor,
  close,
}: {
  task: Task;
  today: string;
  anchor: DOMRect;
  close: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const date = task.date;
  const rule = parseRepeat(task.repeat);
  // The day presets and the calendar start from.
  const base = date || today;
  const [page, setPage] = useState<'main' | 'repeat' | 'custom'>('main');
  const [custom, setCustom] = useState(() => !!rule && isCustom(rule, base));
  const monthOf = (day: string) => {
    const d = parseDay(day);
    return d.getFullYear() * 12 + d.getMonth();
  };
  const [month, setMonth] = useState(() => monthOf(base));
  useDismiss(root, true, close);
  useLayoutEffect(() => {
    const el = root.current!;
    const { width, height } = el.getBoundingClientRect();
    const above = anchor.top - height - 6;
    place(
      el,
      Math.max(8, Math.min(anchor.right - width, innerWidth - width - 8)),
      Math.max(
        8,
        above >= 8
          ? above
          : Math.min(anchor.bottom + 6, innerHeight - height - 8),
      ),
    );
  });
  useEffect(() => root.current?.focus(), []);
  const mode: Mode = !rule
    ? 'never'
    : custom
      ? 'custom'
      : isWorkdays(rule)
        ? 'weekdays'
        : rule.freq;
  const save = (patch: Partial<Fields>) => void store.update(task.id, patch);
  // A preset follows the date to its new day.
  function setDate(day: string) {
    save(
      rule && mode !== 'never' && mode !== 'custom'
        ? { date: day, repeat: formatRepeat(preset(mode, day)) }
        : { date: day },
    );
    setMonth(monthOf(day));
  }
  // Repeating needs a date, so it starts today.
  const setRule = (r: Repeat) =>
    save(
      date
        ? { repeat: formatRepeat(r) }
        : { repeat: formatRepeat(r), date: today },
    );
  const ruleText = rule ? describe(rule, base, custom) : 'Never';
  const summary =
    rule &&
    `${ruleText}.${date ? ` After you complete it, the next one is due ${shortDate(nextDate(date, rule))}.` : ''}`;

  const dow = parseDay(today).getDay();
  const quick = [
    {
      key: 'today',
      label: 'Today',
      day: today,
      hint: format(today, { weekday: 'short' }),
      icon: quickIcons.today,
    },
    {
      key: 'tomorrow',
      label: 'Tomorrow',
      day: addDays(today, 1),
      hint: format(addDays(today, 1), { weekday: 'short' }),
      icon: quickIcons.tomorrow,
    },
    {
      key: 'weekend',
      label: 'This Weekend',
      day: dow === 6 || dow === 0 ? today : addDays(today, 6 - dow),
      icon: quickIcons.weekend,
    },
    {
      key: 'next-week',
      label: 'Next Week',
      day: addDays(today, (8 - dow) % 7 || 7),
      icon: quickIcons.nextWeek,
    },
  ];
  const y = Math.floor(month / 12);
  const m = month - y * 12;
  const start = dayKey(
    new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7)),
  );
  const days = Array.from({ length: 42 }, (_, k) => addDays(start, k));

  let headline = 'No date';
  let subline = 'Pick a day below';
  if (date) {
    const diff = daysBetween(today, date);
    headline = format(date, { weekday: 'long', day: 'numeric', month: 'long' });
    subline =
      diff === 0
        ? 'Today'
        : diff === 1
          ? 'Tomorrow'
          : diff === -1
            ? 'Yesterday, overdue'
            : diff > 1
              ? `In ${diff} days`
              : `${-diff} days overdue`;
    if (rule) subline += ` · ${ruleText}`;
  }
  const options: [Mode, string][] = [
    ['never', 'Never'],
    ['daily', 'Every day'],
    ['weekdays', 'Every weekday (Mon–Fri)'],
    ['weekly', `Every week on ${format(base, { weekday: 'long' })}`],
    ['monthly', `Every month on the ${ordinal(parseDay(base).getDate())}`],
    [
      'yearly',
      `Every year on ${format(base, { day: 'numeric', month: 'long' })}`,
    ],
    ['custom', 'Custom…'],
  ];
  function pick(option: Mode) {
    if (option === 'custom') {
      if (!rule) setRule(preset('weekly', base));
      setCustom(true);
      setPage('custom');
      return;
    }
    if (option === 'never') save({ repeat: '' });
    else setRule(preset(option, base));
    setCustom(false);
  }
  const interval = rule?.interval ?? 1;
  const step = (delta: number) =>
    rule &&
    setRule({
      ...rule,
      interval: Math.max(1, Math.min(99, rule.interval + delta)),
    });
  const selectedDays = rule?.weekdays ?? [];
  const monthDay = rule?.monthDay ?? parseDay(base).getDate();
  return (
    <div
      ref={root}
      className="popover date-popover"
      role="dialog"
      aria-label="Date and repeat"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.nativeEvent.isComposing || page === 'main')
          return;
        e.preventDefault();
        e.stopPropagation();
        setPage(page === 'custom' ? 'repeat' : 'main');
      }}
    >
      {page === 'main' && (
        <>
          <div className="date-head">
            <div className="date-head-text">
              <strong
                className={
                  date && date < today ? 'is-overdue' : date ? '' : 'is-empty'
                }
              >
                {headline}
              </strong>
              <span>{subline}</span>
            </div>
            {date && (
              <button
                className="date-clear"
                aria-label="Remove date"
                title="Remove date"
                onClick={() => {
                  save({ date: '', repeat: '' });
                  setCustom(false);
                }}
              >
                <Stroke d="M6 6l12 12M18 6L6 18" />
              </button>
            )}
          </div>
          <div className="date-section">
            {quick.map((q) => (
              <button
                key={q.key}
                className="date-option"
                aria-pressed={date === q.day}
                onClick={() => setDate(q.day)}
              >
                <span className="date-option-icon">{q.icon}</span>
                <span className="date-option-label">{q.label}</span>
                <span className="date-hint">{q.hint ?? shortDate(q.day)}</span>
              </button>
            ))}
          </div>
          <div className="date-rule" />
          <div className="calendar">
            <div className="calendar-head">
              <strong>
                {new Date(y, m, 1).toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric',
                })}
              </strong>
              <button
                aria-label="Previous month"
                onClick={() => setMonth(month - 1)}
              >
                <Chevron d="M15 5l-7 7 7 7" />
              </button>
              <button
                aria-label="Next month"
                onClick={() => setMonth(month + 1)}
              >
                <Chevron d="M9 5l7 7-7 7" />
              </button>
            </div>
            <div className="calendar-grid">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
                <span key={i} className="calendar-weekday" aria-hidden="true">
                  {l}
                </span>
              ))}
              {days.map((day) => (
                <button
                  key={day}
                  className={`calendar-day${day === today ? ' is-today' : ''}${day < today ? ' is-past' : ''}${parseDay(day).getMonth() !== m ? ' is-outside' : ''}`}
                  aria-label={format(day, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  aria-pressed={day === date}
                  onClick={() => setDate(day)}
                >
                  {parseDay(day).getDate()}
                </button>
              ))}
            </div>
          </div>
          <div className="date-rule" />
          <div className="date-section">
            <button className="repeat-row" onClick={() => setPage('repeat')}>
              <RepeatIcon />
              <span className="repeat-row-label">Repeat</span>
              <span className={`repeat-row-value${rule ? ' is-set' : ''}`}>
                {ruleText}
              </span>
              <Chevron d="M9 5l7 7-7 7" />
            </button>
          </div>
        </>
      )}
      {page === 'repeat' && (
        <>
          <div className="date-page-head">
            <button aria-label="Back to date" onClick={() => setPage('main')}>
              <Chevron d="M15 5l-7 7 7 7" />
            </button>
            <strong>Repeat</strong>
          </div>
          <div className="date-section" role="radiogroup" aria-label="Repeat">
            {options.map(([option, label]) => (
              <button
                key={option}
                className="date-option repeat-option"
                role="radio"
                aria-checked={mode === option}
                onClick={() => pick(option)}
              >
                <span className="repeat-option-label">
                  <span>{label}</span>
                  {option === 'custom' && mode === 'custom' && (
                    <span className="repeat-option-sub">{ruleText}</span>
                  )}
                </span>
                {mode === option && option !== 'custom' && (
                  <span className="repeat-check">
                    <Stroke d="M5 12.5l4.2 4.2L19 7" width={2.8} />
                  </span>
                )}
                {option === 'custom' && <Chevron d="M9 5l7 7-7 7" />}
              </button>
            ))}
          </div>
          {summary && (
            <p className="repeat-summary">
              <RepeatIcon />
              <span>{summary}</span>
            </p>
          )}
        </>
      )}
      {page === 'custom' && rule && (
        <>
          <div className="date-page-head">
            <button
              aria-label="Back to repeat options"
              onClick={() => setPage('repeat')}
            >
              <Chevron d="M15 5l-7 7 7 7" />
            </button>
            <strong>Custom repeat</strong>
          </div>
          <div className="custom-repeat">
            <div className="custom-field">
              <span className="custom-label">Repeats</span>
              <div className="segmented" role="group" aria-label="Frequency">
                {(Object.keys(units) as Freq[]).map((freq) => (
                  <button
                    key={freq}
                    aria-pressed={rule.freq === freq}
                    onClick={() =>
                      setRule({
                        ...preset(freq, base),
                        interval: rule.interval,
                      })
                    }
                  >
                    {freq[0].toUpperCase() + freq.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="custom-every">
              <span>Every</span>
              <div className="stepper">
                <button
                  aria-label="Less often"
                  disabled={interval <= 1}
                  onClick={() => step(-1)}
                >
                  <Stroke d="M5 12h14" />
                </button>
                <span aria-live="polite">
                  {interval} {units[rule.freq][interval === 1 ? 0 : 1]}
                </span>
                <button aria-label="More often" onClick={() => step(1)}>
                  <Stroke d="M12 5v14M5 12h14" />
                </button>
              </div>
            </div>
            {rule.freq === 'weekly' && (
              <div className="custom-field">
                <span className="custom-label">On these days</span>
                <div
                  className="weekday-chips"
                  role="group"
                  aria-label="Days of the week"
                >
                  {week.map((w) => {
                    const on = selectedDays.includes(w);
                    return (
                      <button
                        key={w}
                        aria-label={dayNames[w]}
                        aria-pressed={on}
                        onClick={() => {
                          const next = on
                            ? selectedDays.filter((x) => x !== w)
                            : [...selectedDays, w];
                          if (next.length) setRule({ ...rule, weekdays: next });
                        }}
                      >
                        {dayNames[w].slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {rule.freq === 'monthly' && (
              <div className="custom-field">
                <span className="custom-label">On this day of the month</span>
                <div
                  className="month-days"
                  role="group"
                  aria-label="Day of the month"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      aria-pressed={n === monthDay}
                      onClick={() => setRule({ ...rule, monthDay: n })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {rule.freq === 'yearly' && (
              <span className="custom-note">
                Repeats on {format(base, { day: 'numeric', month: 'long' })}.
                Change the date on the first page to pick a different day.
              </span>
            )}
            <p className="custom-summary">
              <RepeatIcon />
              <span>{summary}</span>
            </p>
          </div>
        </>
      )}
      <div className="date-footer">
        <button onClick={close}>Done</button>
      </div>
    </div>
  );
}

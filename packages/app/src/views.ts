import type { Task } from './storage/model';
import { daysBetween, parseDay } from './storage/dates';

export type StaticView = 'inbox' | 'today' | 'goal' | 'logbook' | 'trash';
// Any other view is the id of a project or area.
export type View = StaticView | (string & {});
export const titles: Record<StaticView, string> = {
  inbox: 'Inbox',
  today: 'Today',
  goal: 'Today’s Goal',
  logbook: 'Logbook',
  trash: 'Trash',
};
export const isStatic = (view: View): view is StaticView =>
  Object.hasOwn(titles, view);
export const untitled = (list: Task) =>
  list.kind === 'area' ? 'New Area' : 'New Project';
export const empties: Record<StaticView, string> = {
  inbox: 'Inbox is empty',
  today: 'Nothing due today',
  goal: '',
  logbook: 'Completed to-dos will appear here',
  trash: 'Trash is empty',
};
const DAY = 86400000;
export function dayName(time: number, short: boolean) {
  const day = new Date(time).toDateString();
  const now = Date.now();
  if (day === new Date(now).toDateString()) return short ? 'today' : 'Today';
  if (day === new Date(now - DAY).toDateString())
    return short ? 'yesterday' : 'Yesterday';
  return new Date(time).toLocaleDateString(
    'en-GB',
    short
      ? { day: 'numeric', month: 'short' }
      : { weekday: 'long', day: 'numeric', month: 'long' },
  );
}
// How a to-do due on `date` reads on `today`: `label` names the day, `short`
// and `long` also count the days it is overdue.
export function dueLabel(date: string, today: string) {
  const diff = daysBetween(today, date);
  const d = parseDay(date);
  const label =
    diff === 0
      ? 'Today'
      : diff === 1
        ? 'Tomorrow'
        : diff === -1
          ? 'Yesterday'
          : diff > 1 && diff < 7
            ? d.toLocaleDateString('en-GB', { weekday: 'long' })
            : d.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year:
                  d.getFullYear() === parseDay(today).getFullYear()
                    ? undefined
                    : 'numeric',
              });
  const overdue = diff < 0;
  const dayMonth = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  return {
    label,
    short: overdue ? `${-diff}d overdue` : label,
    long: overdue ? `${dayMonth}, ${-diff}d overdue` : label,
    overdue,
  };
}

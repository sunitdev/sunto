import type { Task } from './storage/model';

export type StaticView = 'inbox' | 'logbook' | 'trash';
// Any other view is the id of a project or area.
export type View = StaticView | (string & {});
export const titles: Record<StaticView, string> = {
  inbox: 'Inbox',
  logbook: 'Logbook',
  trash: 'Trash',
};
export const isStatic = (view: View): view is StaticView =>
  Object.hasOwn(titles, view);
export const untitled = (list: Task) =>
  list.kind === 'area' ? 'New Area' : 'New Project';
export const empties: Record<StaticView, string> = {
  inbox: 'Inbox is empty',
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
export const completedTime = (t: Task) => t.completedAt || t.created;

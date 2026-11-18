// The iPhone's Home Screen widget shows Today's Goal from a copy the app
// keeps in the container they share. To-dos ticked off in the widget wait
// there until the app applies them.
import { Capacitor } from '@capacitor/core';
import type { State } from './model';
import { dayKey } from './dates';
import { request } from './driver';
import { groupGoal, organize } from './selectors';

const ios = Capacitor.getPlatform() === 'ios';
// A to-do completed or opened again in the widget, and when (ms).
export type Tick = { id: string; completed: boolean; at: number };
let published = '';
// Gives the widget the to-dos picked for today's goal, or a later day's, in
// the goal's order, and the days the open to-dos are due, so it can count
// those due on a day the app has not been opened. The widget is a
// convenience, so failing to update it never stops a save.
export async function publish(state: State) {
  if (!ios) return;
  const library = organize(state);
  const { todos, lists, listOf } = library;
  const today = dayKey();
  const picked = todos.filter((t) => !t.trashed && t.planned >= today);
  const data = JSON.stringify({
    goal: groupGoal(picked, library)
      .flatMap((g) => g.tasks)
      .map((t) => {
        const list = lists[listOf(t)];
        return {
          id: t.id,
          title: t.title,
          list: list
            ? list.title || (list.kind === 'area' ? 'New Area' : 'New Project')
            : 'Inbox',
          planned: t.planned,
          completed: t.completed,
          completedAt: t.completedAt,
        };
      }),
    due: todos
      .filter((t) => !t.trashed && !t.completed && t.date && t.title.trim())
      .map((t) => t.date),
  });
  if (data === published) return;
  try {
    await request('widget', data);
    published = data;
  } catch {
    // Tried again with the next save.
  }
}
// The to-dos ticked in the widget since the app last applied them, in the
// order they were ticked.
export async function ticks(): Promise<Tick[]> {
  if (!ios) return [];
  try {
    const { data } = await request('widget-ticks');
    return data ? (JSON.parse(data) as Tick[]) : [];
  } catch {
    return [];
  }
}
// Forgets the first `count` ticks, once the app has applied them.
export async function clearTicks(count: number) {
  await request('widget-clear', String(count));
}

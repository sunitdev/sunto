// The edits behind each action, as changes to apply to `state`. They are
// pure so the app and the MCP server share them.
import type { Fields, State } from './model';
import { nextDate, parseRepeat } from './dates';

export type Changes = [string, Partial<Fields>][];

export const newTask = (
  list: string,
  section: string,
  epic = '',
): Partial<Fields> => ({
  kind: 'task',
  list,
  section,
  epic,
  title: '',
  notes: '',
  completed: false,
  completedAt: 0,
  trashed: false,
  trashedAt: 0,
  deleted: false,
  created: Date.now(),
});
// A new project or area, or a section of the project `list`.
export const newList = (
  kind: 'project' | 'area' | 'section',
  list = '',
): Partial<Fields> => ({
  kind,
  list,
  icon: '',
  title: '',
  notes: '',
  deleted: false,
  created: Date.now(),
});
// The epic colours, in the order new epics take them.
export const epicColors = [
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#0EA5E9',
  '#8B5CF6',
  '#EC4899',
];
// A new, untitled epic of `project`, taking the next colour in turn.
export function newEpic(state: State, project: string): Partial<Fields> {
  const count = Object.values(state.tasks).filter(
    (t) => t.kind === 'epic' && t.list === project && !t.deleted,
  ).length;
  return {
    kind: 'epic',
    list: project,
    color: epicColors[count % epicColors.length],
    title: '',
    deleted: false,
    created: Date.now(),
  };
}
export const trashing = (trashed: boolean): Partial<Fields> =>
  trashed
    ? { trashed, trashedAt: Date.now() }
    : { trashed, trashedAt: 0, deletedFrom: '' };
// Moving a to-do's date past the day it was planned for, or removing it,
// takes it out of that day's goal, which holds only to-dos due by then.
export const rescheduling = (
  task: Fields,
  patch: Partial<Fields>,
): Partial<Fields> =>
  patch.date !== undefined &&
  task.planned &&
  !(patch.date && patch.date <= task.planned)
    ? { ...patch, planned: '' }
    : patch;
// Completing a repeating to-do adds its next occurrence in the same place,
// and the completed one stops repeating.
export function completion(
  state: State,
  id: string,
  completed: boolean,
): Changes {
  const task = state.tasks[id];
  const rule =
    completed && task && !task.trashed && task.date
      ? parseRepeat(task.repeat)
      : null;
  if (!rule)
    return [[id, { completed, completedAt: completed ? Date.now() : 0 }]];
  return [
    [id, { completed, completedAt: Date.now(), repeat: '' }],
    [
      crypto.randomUUID(),
      {
        ...newTask(task.list, task.section, task.epic),
        title: task.title,
        notes: task.notes,
        date: nextDate(task.date, rule),
        repeat: task.repeat,
        created: task.created,
      },
    ],
  ];
}
// The epic's to-dos stay in its project, outside any epic.
export function epicDeletion(state: State, id: string): Changes {
  const tasks = Object.values(state.tasks).filter(
    (t) => t.kind === 'task' && t.epic === id && !t.deleted,
  );
  return [
    ...tasks.map((t): [string, Partial<Fields>] => [t.id, { epic: '' }]),
    [id, { deleted: true }],
  ];
}
// The section's to-dos stay in its project, outside any section.
export function sectionDeletion(state: State, id: string): Changes {
  const tasks = Object.values(state.tasks).filter(
    (t) => t.kind === 'task' && t.section === id && !t.deleted,
  );
  return [
    ...tasks.map((t): [string, Partial<Fields>] => [t.id, { section: '' }]),
    [id, { deleted: true }],
  ];
}
// The project or area, and a project's sections and epics, can't be restored;
// its to-dos move to Trash and Put Back returns them to the Inbox, remembering
// the list's name meanwhile. An area's projects are kept, without an area.
export function listDeletion(state: State, id: string): Changes {
  const list = state.tasks[id];
  if (!list) return [];
  const now = Date.now();
  const children = Object.values(state.tasks).filter(
    (t) => t.list === id && !t.deleted,
  );
  return [
    ...children.map((t): [string, Partial<Fields>] => [
      t.id,
      t.kind === 'project'
        ? { list: '' }
        : t.kind === 'task' && t.title.trim()
          ? {
              list: '',
              section: '',
              epic: '',
              deletedFrom:
                list.title ||
                (list.kind === 'area' ? 'New Area' : 'New Project'),
              trashed: true,
              trashedAt: t.trashed ? t.trashedAt : now,
            }
          : { deleted: true },
    ]),
    [id, { deleted: true }],
  ];
}

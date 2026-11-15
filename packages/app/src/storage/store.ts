import {
  emptyState,
  merge,
  mutate,
  restore,
  type Fields,
  type State,
} from './model';
import { native, request } from './driver';
import { nextDate, parseRepeat } from './dates';
let state = emptyState();
let ready = false;
let error = '';
let syncStatus = native ? 'Choose a sync folder' : 'Stored in this browser';
let folder = '';
let queue = Promise.resolve();
const listeners = new Set<() => void>();
let snapshot = { state, ready, error, syncStatus, folder };
function emit() {
  snapshot = { state, ready, error, syncStatus, folder };
  listeners.forEach((f) => f());
}
function run(work: () => Promise<void>) {
  const next = queue.then(work).catch((e) => {
    error = String(e instanceof Error ? e.message : e);
    emit();
  });
  queue = next;
  return next;
}
async function persist(next: State) {
  state = next;
  emit();
  await request('save', JSON.stringify(next));
  error = '';
  emit();
}
let started: Promise<void> | undefined;
export function start() {
  return (started ??= run(async () => {
    const result = await request('load');
    state = result.data ? restore(result.data) : emptyState();
    await persist(state);
    folder = result.folder ?? '';
    ready = true;
    emit();
  }));
}
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getSnapshot = () => snapshot;
export function updateAll(changes: [string, Partial<Fields>][]) {
  return run(async () => {
    if (!ready) throw Error('Storage is not ready');
    await persist(
      changes.reduce((next, [id, patch]) => mutate(next, id, patch), state),
    );
    if (folder) {
      syncStatus = 'Changes pending';
      emit();
    }
  });
}
export const update = (id: string, patch: Partial<Fields>) =>
  updateAll([[id, patch]]);
export const setTrashed = (id: string, trashed: boolean) =>
  update(
    id,
    trashed
      ? { trashed, trashedAt: Date.now() }
      : { trashed, trashedAt: 0, deletedFrom: '' },
  );
const newTask = (list: string, section: string): Partial<Fields> => ({
  kind: 'task',
  list,
  section,
  title: '',
  notes: '',
  completed: false,
  completedAt: 0,
  trashed: false,
  trashedAt: 0,
  deleted: false,
  created: Date.now(),
});
// Completing a repeating to-do adds its next occurrence in the same place,
// and the completed one stops repeating.
export function setCompleted(id: string, completed: boolean) {
  const task = state.tasks[id];
  const rule =
    completed && task && !task.trashed && task.date
      ? parseRepeat(task.repeat)
      : null;
  if (!rule)
    return update(id, { completed, completedAt: completed ? Date.now() : 0 });
  return updateAll([
    [id, { completed, completedAt: Date.now(), repeat: '' }],
    [
      crypto.randomUUID(),
      {
        ...newTask(task.list, task.section),
        title: task.title,
        notes: task.notes,
        date: nextDate(task.date, rule),
        repeat: task.repeat,
        created: task.created,
      },
    ],
  ]);
}
// Picks the to-dos `ids` for the goal of `day`, dropping any others.
export function setPlan(day: string, ids: string[]) {
  const picked = new Set(ids);
  return updateAll(
    Object.values(state.tasks)
      .filter((t) => !t.deleted && (t.planned === day) !== picked.has(t.id))
      .map((t): [string, Partial<Fields>] => [
        t.id,
        { planned: picked.has(t.id) ? day : '' },
      ]),
  );
}
// Trashed to-dos are permanently deleted three months after being trashed.
export function purgeTrash() {
  return run(async () => {
    if (!ready) return;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const expired = Object.values(state.tasks).filter(
      (t) => t.trashed && !t.deleted && t.trashedAt && t.trashedAt < +cutoff,
    );
    if (!expired.length) return;
    await persist(
      expired.reduce((next, t) => mutate(next, t.id, { deleted: true }), state),
    );
    if (folder) {
      syncStatus = 'Changes pending';
      emit();
    }
  });
}
// `fields` can give the new to-do a date or plan it for a day.
export async function add(
  list = '',
  section = '',
  fields: Partial<Fields> = {},
) {
  const id = crypto.randomUUID();
  await update(id, { ...newTask(list, section), ...fields });
  return id;
}
// A new project or area, or a section of the project `list`.
export async function addList(kind: 'project' | 'area' | 'section', list = '') {
  const id = crypto.randomUUID();
  await update(id, {
    kind,
    list,
    icon: '',
    title: '',
    notes: '',
    deleted: false,
    created: Date.now(),
  });
  return id;
}
export const move = (id: string, list: string) =>
  update(id, { list, section: '' });
// The section's to-dos stay in its project, outside any section.
export function deleteSection(id: string) {
  const tasks = Object.values(state.tasks).filter(
    (t) => t.kind === 'task' && t.section === id && !t.deleted,
  );
  return updateAll([
    ...tasks.map((t): [string, Partial<Fields>] => [t.id, { section: '' }]),
    [id, { deleted: true }],
  ]);
}
// The project and its sections can't be restored; its to-dos move to Trash
// and Put Back returns them to the Inbox, remembering the project's name
// meanwhile.
export function deleteProject(id: string) {
  const project = state.tasks[id];
  if (!project) return Promise.resolve();
  const now = Date.now();
  const children = Object.values(state.tasks).filter(
    (t) => t.list === id && !t.deleted,
  );
  return updateAll([
    ...children.map((t): [string, Partial<Fields>] => [
      t.id,
      t.kind === 'task' && t.title.trim()
        ? {
            list: '',
            section: '',
            deletedFrom: project.title || 'New Project',
            trashed: true,
            trashedAt: t.trashed ? t.trashedAt : now,
          }
        : { deleted: true },
    ]),
    [id, { deleted: true }],
  ]);
}
export function sync() {
  return run(async () => {
    if (!ready || !native || !folder) return;
    syncStatus = 'Syncing…';
    emit();
    try {
      await request('save', JSON.stringify(state));
      const result = await request(
        'exchange',
        JSON.stringify(Object.values(state.changes)),
      );
      let next = state;
      const failures: string[] = [];
      for (const file of result.files ?? []) {
        try {
          next = merge(next, JSON.parse(file));
        } catch (e) {
          failures.push(String(e));
        }
      }
      await persist(next);
      if (failures.length)
        throw Error(
          `${failures.length} sync file(s) could not be imported. ${failures[0]}`,
        );
      syncStatus = `Folder checked ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      syncStatus = 'Sync pending — retry';
      throw e;
    } finally {
      emit();
    }
  });
}
export function chooseFolder() {
  return run(async () => {
    const r = await request('choose');
    if (r.folder) {
      folder = r.folder;
      error = '';
      syncStatus = 'Folder connected';
      emit();
    }
  }).then(sync);
}
export function disconnect() {
  return run(async () => {
    await request('disconnect');
    folder = '';
    syncStatus = 'Choose a sync folder';
    emit();
  });
}
export function retry() {
  if (!ready) {
    started = undefined;
    return start();
  }
  return run(async () => {
    await persist(state);
  }).then(sync);
}

import {
  emptyState,
  mutate,
  reconcile,
  restore,
  type Fields,
  type State,
} from './model';
import { native, request } from './driver';
import * as widget from './widget';
import {
  completion,
  epicDeletion,
  listDeletion,
  newEpic,
  newList,
  newTask,
  sectionDeletion,
  trashing,
} from './ops';
export { epicColors } from './ops';
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
  await widget.publish(next);
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
  setTrashedAll([id], trashed);
export const setTrashedAll = (ids: string[], trashed: boolean) =>
  updateAll(ids.map((id) => [id, trashing(trashed)]));
export const setCompleted = (id: string, completed: boolean, forever = false) =>
  updateAll(completion(state, id, completed, forever));
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
// Applies the to-dos completed or opened again in the iPhone's widget, each
// as of when it was ticked, then lets the widget forget them.
export function applyWidget() {
  return run(async () => {
    if (!ready) return;
    const ticked = await widget.ticks();
    if (!ticked.length) return;
    const last = new Map(ticked.map((t) => [t.id, t]));
    const changes = [...last.values()]
      .filter(
        ({ id, completed }) =>
          state.tasks[id] &&
          !state.tasks[id].deleted &&
          state.tasks[id].completed !== completed,
      )
      .flatMap(({ id, completed, at }) =>
        completion(state, id, completed).map(
          ([changed, patch]): [string, Partial<Fields>] => [
            changed,
            changed === id && completed ? { ...patch, completedAt: at } : patch,
          ],
        ),
      );
    if (changes.length) {
      await persist(
        changes.reduce((next, [id, patch]) => mutate(next, id, patch), state),
      );
      if (folder) {
        syncStatus = 'Changes pending';
        emit();
      }
    }
    await widget.clearTicks(ticked.length);
  });
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
  await update(id, newList(kind, list));
  return id;
}
export const move = (id: string, list: string) =>
  update(id, { list, section: '', epic: '' });
// Moves the to-dos `ids` to `list`, into its `section` if given. Each keeps
// its epic only when it stays in its project.
export const moveAll = (ids: string[], list: string, section = '') =>
  updateAll(
    ids.map((id) => [
      id,
      state.tasks[id]?.list === list
        ? { section }
        : { list, section, epic: '' },
    ]),
  );
// A new, untitled epic of `project`, taking the next colour in turn.
export async function addEpic(project: string) {
  const id = crypto.randomUUID();
  await update(id, newEpic(state, project));
  return id;
}
export const deleteEpic = (id: string) => updateAll(epicDeletion(state, id));
export const deleteSection = (id: string) =>
  updateAll(sectionDeletion(state, id));
export const deleteList = (id: string) => updateAll(listDeletion(state, id));
export function sync() {
  return run(async () => {
    if (!ready || !native || !folder) return;
    syncStatus = 'Syncing…';
    emit();
    try {
      await request('save', JSON.stringify(state));
      const result = reconcile(
        state,
        await request('pull', state.device),
        Date.now(),
      );
      await persist(result.state);
      // Legacy files are removed only once this device's file holds them.
      await request(
        'push',
        JSON.stringify({
          device: state.device,
          snapshot: JSON.stringify({ ...state, saved: Date.now() }),
          retired: result.retired,
          legacy: result.imported,
        }),
      );
      const { failures } = result;
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

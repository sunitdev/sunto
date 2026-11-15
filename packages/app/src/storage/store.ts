import {
  emptyState,
  merge,
  mutate,
  restore,
  type Fields,
  type State,
} from './model';
import { native, request } from './driver';
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
export const setCompleted = (id: string, completed: boolean) =>
  update(id, { completed, completedAt: completed ? Date.now() : 0 });
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
export async function add(list = '') {
  const id = crypto.randomUUID();
  await update(id, {
    kind: 'task',
    list,
    title: '',
    notes: '',
    completed: false,
    completedAt: 0,
    trashed: false,
    trashedAt: 0,
    deleted: false,
    created: Date.now(),
  });
  return id;
}
export async function addList(kind: 'project' | 'area') {
  const id = crypto.randomUUID();
  await update(id, {
    kind,
    list: '',
    icon: '',
    title: '',
    notes: '',
    deleted: false,
    created: Date.now(),
  });
  return id;
}
// The project can't be restored; its to-dos move to Trash and Put Back
// returns them to the Inbox, remembering the project's name meanwhile.
export function deleteProject(id: string) {
  const project = state.tasks[id];
  if (!project) return Promise.resolve();
  const now = Date.now();
  const tasks = Object.values(state.tasks).filter(
    (t) => t.kind === 'task' && t.list === id && !t.deleted,
  );
  return updateAll([
    ...tasks.map((t): [string, Partial<Fields>] => [
      t.id,
      t.title.trim()
        ? {
            list: '',
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

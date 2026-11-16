// One record type holds to-dos, projects, areas, and project sections and
// epics, distinguished by kind. `list` is a to-do's project or area, a
// project's area, or a section's or epic's project ('' for none). `section`
// and `epic` are a to-do's section and epic within its project, `color` an
// epic's colour ('#RRGGBB'), and `kanban` shows a project as a board of
// sections.
// A to-do's `date` is the day it is due ('YYYY-MM-DD', '' for none), `repeat`
// its repeat rule as JSON ('' for none), and `planned` the day it was picked
// for that day's goal.
export type Kind = 'task' | 'project' | 'area' | 'section' | 'epic';
export type Fields = {
  kind: Kind;
  list: string;
  section: string;
  epic: string;
  kanban: boolean;
  icon: string;
  color: string;
  deletedFrom: string;
  date: string;
  repeat: string;
  planned: string;
  title: string;
  notes: string;
  completed: boolean;
  completedAt: number;
  trashed: boolean;
  trashedAt: number;
  deleted: boolean;
  created: number;
};
// A legacy (version 1) sync change: one edit to one record.
export type Change = {
  version: 1;
  id: string;
  device: string;
  task: string;
  revision: number;
  patch: Partial<Fields>;
};
// A field's last write: the Lamport revision and the device that made it.
export type Stamp = [number, string];
export type Task = Fields & {
  id: string;
  stamps: Partial<Record<keyof Fields, Stamp>>;
};
// `seen` maps each other device to the highest revision of its writes that
// these tasks include, so a missing record can be told apart from one that
// was never received.
export type State = {
  version: 2;
  device: string;
  clock: number;
  seen: Record<string, number>;
  tasks: Record<string, Task>;
};
// A device's file in the sync folder: its whole state and when it was saved.
export type Snapshot = State & { saved: number };
export const emptyState = (): State => ({
  version: 2,
  device: crypto.randomUUID(),
  clock: 0,
  seen: {},
  tasks: {},
});
const keys = [
  'kind',
  'list',
  'section',
  'epic',
  'kanban',
  'icon',
  'color',
  'deletedFrom',
  'date',
  'repeat',
  'planned',
  'title',
  'notes',
  'completed',
  'completedAt',
  'trashed',
  'trashedAt',
  'deleted',
  'created',
];
const numbers = ['created', 'completedAt', 'trashedAt'];
const strings = [
  'kind',
  'list',
  'section',
  'epic',
  'icon',
  'color',
  'deletedFrom',
  'date',
  'repeat',
  'planned',
  'title',
  'notes',
];
const kinds = ['task', 'project', 'area', 'section', 'epic'];
const isId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-zA-Z0-9-]{1,100}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
const isRevision = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 1;
function validatePatch(patch: unknown): Partial<Fields> {
  if (!patch || typeof patch !== 'object') throw Error('Invalid task fields');
  const p = patch as Record<string, unknown>;
  for (const [key, v] of Object.entries(p)) {
    if (
      !keys.includes(key) ||
      (numbers.includes(key)
        ? typeof v !== 'number' || !Number.isFinite(v)
        : typeof v !== (strings.includes(key) ? 'string' : 'boolean')) ||
      (key === 'kind' && !kinds.includes(v as string)) ||
      ((key === 'date' || key === 'planned') &&
        !/^(\d{4}-\d{2}-\d{2})?$/.test(v as string)) ||
      (key === 'color' && !/^(#[0-9a-fA-F]{6})?$/.test(v as string))
    )
      throw Error('Invalid task field');
  }
  return Object.fromEntries(
    keys.filter((k) => Object.hasOwn(p, k)).map((k) => [k, p[k]]),
  );
}
export function validateChange(value: unknown): Change {
  const c = value as Change;
  if (
    !c ||
    c.version !== 1 ||
    ![c.id, c.device, c.task].every(isId) ||
    !isRevision(c.revision)
  )
    throw Error('Unsupported or malformed sync change');
  return {
    version: 1,
    id: c.id,
    device: c.device,
    task: c.task,
    revision: c.revision,
    patch: validatePatch(c.patch),
  };
}
export function validateSnapshot(value: unknown): Snapshot {
  const s = value as Snapshot;
  if (
    !s ||
    s.version !== 2 ||
    !isId(s.device) ||
    !Number.isSafeInteger(s.clock) ||
    s.clock < 0 ||
    typeof s.saved !== 'number' ||
    !s.seen ||
    typeof s.seen !== 'object' ||
    !Object.entries(s.seen).every(([d, r]) => isId(d) && isRevision(r)) ||
    !s.tasks ||
    typeof s.tasks !== 'object'
  )
    throw Error('Unsupported or malformed sync file');
  const tasks: Record<string, Task> = {};
  for (const [id, t] of Object.entries(s.tasks)) {
    if (!isId(id) || !t || t.id !== id || !t.stamps)
      throw Error('Invalid task');
    const stamps = Object.entries(t.stamps);
    if (
      !stamps.every(
        ([k, v]) =>
          keys.includes(k) &&
          Array.isArray(v) &&
          v.length === 2 &&
          isRevision(v[0]) &&
          v[0] <= s.clock &&
          isId(v[1]),
      )
    )
      throw Error('Invalid task stamp');
    // Only stamped fields carry data; the rest are defaults.
    const fields = validatePatch(
      Object.fromEntries(stamps.map(([k]) => [k, t[k as keyof Fields]])),
    );
    tasks[id] = clean({
      ...blank(id),
      ...fields,
      stamps: Object.fromEntries(stamps.map(([k, [r, d]]) => [k, [r, d]])),
    });
  }
  return {
    version: 2,
    device: s.device,
    clock: s.clock,
    saved: s.saved,
    seen: { ...s.seen },
    tasks,
  };
}
const blank = (id: string): Task => ({
  id,
  kind: 'task',
  list: '',
  section: '',
  epic: '',
  kanban: false,
  icon: '',
  color: '',
  deletedFrom: '',
  date: '',
  repeat: '',
  planned: '',
  title: '',
  notes: '',
  completed: false,
  completedAt: 0,
  trashed: false,
  trashedAt: 0,
  deleted: false,
  created: 0,
  stamps: {},
});
// Deletion is permanent, so a deleted record keeps only its tombstone.
const clean = (task: Task): Task =>
  task.deleted
    ? {
        ...blank(task.id),
        deleted: true,
        stamps: { deleted: task.stamps.deleted },
      }
    : task;
// Whether `b` is a later write than `a`; equal revisions go to the higher
// device ID so every device picks the same winner.
const later = (a: Stamp | undefined, b: Stamp) =>
  !a || b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]);
// Whether `state` includes the write `stamp`.
const includes = (state: State, [revision, device]: Stamp) =>
  (device === state.device ? state.clock : (state.seen[device] ?? 0)) >=
  revision;
// Whether `state` once held every write of `task`. Such a record missing
// from `state` was permanently deleted there and its tombstone removed.
const held = (state: State, task: Task) =>
  Object.values(task.stamps).every((s) => includes(state, s));
// Applies the stamped fields of `patch` to the record `id`. Fields keep the
// later write, and deletion wins over any edit.
function apply(
  tasks: Record<string, Task>,
  id: string,
  patch: Partial<Fields>,
  stamps: Partial<Record<keyof Fields, Stamp>>,
): Task | undefined {
  const old = tasks[id];
  if (old?.deleted) return;
  const task: Task = structuredClone(old ?? blank(id));
  let changed = false;
  for (const key of Object.keys(stamps) as (keyof Fields)[]) {
    const stamp = stamps[key]!;
    if (key === 'deleted' ? patch.deleted : later(task.stamps[key], stamp)) {
      Object.assign(task, { [key]: patch[key] });
      task.stamps[key] = stamp;
      changed = true;
    }
  }
  return changed ? clean(task) : undefined;
}
// Replays one legacy change. Changes are idempotent, so repeats are harmless.
function replay(state: State, c: Change): State {
  const stamp: Stamp = [c.revision, c.device];
  const stamps = Object.fromEntries(
    Object.keys(c.patch).map((k) => [k, stamp]),
  );
  const task = apply(state.tasks, c.task, c.patch, stamps);
  return {
    ...state,
    clock: Math.max(state.clock, c.revision),
    tasks: task ? { ...state.tasks, [task.id]: task } : state.tasks,
  };
}
// Imports a legacy change from the sync folder, unless it is for a record
// that was deleted and whose tombstone is already gone.
export function merge(state: State, input: unknown): State {
  const c = validateChange(input);
  if (!state.tasks[c.task] && includes(state, [c.revision, c.device]))
    return { ...state, clock: Math.max(state.clock, c.revision) };
  return replay(state, c);
}
// Merges another device's state field by field. Records it held but no
// longer has were deleted there, and records this state held but no longer
// has were deleted here, so neither is brought back.
export function mergeSnapshot(state: State, input: unknown): State {
  const remote = validateSnapshot(input);
  const tasks = { ...state.tasks };
  for (const r of Object.values(remote.tasks)) {
    if (!tasks[r.id] && held(state, r)) continue;
    if (r.deleted) {
      if (!tasks[r.id]?.deleted) tasks[r.id] = r;
      continue;
    }
    const task = apply(tasks, r.id, r, r.stamps);
    if (task) tasks[r.id] = task;
  }
  for (const t of Object.values(state.tasks))
    if (!remote.tasks[t.id] && held(remote, t)) delete tasks[t.id];
  const seen = { ...state.seen };
  for (const [d, r] of Object.entries({
    ...remote.seen,
    [remote.device]: remote.clock,
  }))
    if (d !== state.device) seen[d] = Math.max(seen[d] ?? 0, r);
  return {
    ...state,
    clock: Math.max(state.clock, remote.clock),
    seen,
    tasks,
  };
}
// Removes tombstones that every other device in `others` already has, so
// none of them can still hold the record.
export function purge(state: State, others: State[]): State {
  const tasks = Object.fromEntries(
    Object.entries(state.tasks).filter(
      ([id, t]) =>
        !t.deleted ||
        !others.every(
          (o) => o.tasks[id]?.deleted || includes(o, t.stamps.deleted!),
        ),
    ),
  );
  return { ...state, tasks };
}
// Devices whose files have not changed in this long are treated as gone.
export const retireAfter = 90 * 24 * 60 * 60 * 1000;
export type Folder = { files?: string[]; legacy?: string[]; pending?: boolean };
// Merges what was read from the sync folder: other devices' files and any
// legacy change files. Returns the merged state, the legacy changes and
// retired device files it is now safe to remove, and any files that could not
// be read. Tombstones are only removed when the whole folder was read.
export function reconcile(state: State, folder: Folder, now: number) {
  let next = state;
  const failures: string[] = [];
  const imported: string[] = [];
  const retired: string[] = [];
  const active: Snapshot[] = [];
  for (const text of folder.legacy ?? [])
    try {
      const change = validateChange(JSON.parse(text));
      next = merge(next, change);
      imported.push(change.id);
    } catch (e) {
      failures.push(String(e));
    }
  for (const text of folder.files ?? [])
    try {
      const remote = validateSnapshot(JSON.parse(text));
      if (remote.device === state.device) continue;
      next = mergeSnapshot(next, remote);
      if (now - remote.saved > retireAfter) retired.push(remote.device);
      else active.push(remote);
    } catch (e) {
      failures.push(String(e));
    }
  // Legacy files mean a device may still run the old version and resend
  // records whose tombstones are gone.
  if (folder.pending) return { state: next, imported, retired: [], failures };
  if (!failures.length && !folder.legacy?.length) next = purge(next, active);
  return { state: next, imported, retired, failures };
}
export function mutate(
  state: State,
  task: string,
  patch: Partial<Fields>,
): State {
  const fields = validatePatch(patch);
  const revision = state.clock + 1;
  const stamp: Stamp = [revision, state.device];
  const updated = apply(
    state.tasks,
    task,
    fields,
    Object.fromEntries(Object.keys(fields).map((k) => [k, stamp])),
  );
  return {
    ...state,
    clock: revision,
    tasks: updated ? { ...state.tasks, [task]: updated } : state.tasks,
  };
}
// Loads a saved state, replaying the change log of a version 1 database.
export function restore(text: string): State {
  const saved = JSON.parse(text) as { version: number; device: string };
  if (saved.version === 2) {
    const s = validateSnapshot({ ...saved, saved: 0 });
    return {
      version: 2,
      device: s.device,
      clock: s.clock,
      seen: s.seen,
      tasks: s.tasks,
    };
  }
  const legacy = saved as unknown as { changes?: Record<string, Change> };
  if (
    saved.version !== 1 ||
    typeof saved.device !== 'string' ||
    !legacy.changes
  )
    throw Error('Unsupported database format');
  let result: State = { ...emptyState(), device: saved.device };
  for (const c of Object.values(legacy.changes))
    result = replay(result, validateChange(c));
  return result;
}

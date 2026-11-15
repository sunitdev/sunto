// One record type holds to-dos, projects, areas and project sections,
// distinguished by kind. `list` is a to-do's project or area, a project's
// area, or a section's project ('' for none). `section` is a to-do's section
// within its project, and `kanban` shows a project as a board of sections.
export type Kind = 'task' | 'project' | 'area' | 'section';
export type Fields = {
  kind: Kind;
  list: string;
  section: string;
  kanban: boolean;
  icon: string;
  deletedFrom: string;
  title: string;
  notes: string;
  completed: boolean;
  completedAt: number;
  trashed: boolean;
  trashedAt: number;
  deleted: boolean;
  created: number;
};
export type Change = {
  version: 1;
  id: string;
  device: string;
  task: string;
  revision: number;
  patch: Partial<Fields>;
};
export type Task = Fields & {
  id: string;
  stamps: Partial<Record<keyof Fields, [number, string]>>;
};
export type State = {
  version: 1;
  device: string;
  clock: number;
  tasks: Record<string, Task>;
  changes: Record<string, Change>;
};
export const emptyState = (): State => ({
  version: 1,
  device: crypto.randomUUID(),
  clock: 0,
  tasks: {},
  changes: {},
});
const keys = [
  'kind',
  'list',
  'section',
  'kanban',
  'icon',
  'deletedFrom',
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
  'icon',
  'deletedFrom',
  'title',
  'notes',
];
const kinds = ['task', 'project', 'area', 'section'];
export function validateChange(value: unknown): Change {
  const c = value as Change;
  if (
    !c ||
    c.version !== 1 ||
    ![c.id, c.device, c.task].every(
      (v) =>
        typeof v === 'string' &&
        /^[a-zA-Z0-9-]{1,100}$/.test(v) &&
        !['__proto__', 'constructor', 'prototype'].includes(v),
    ) ||
    !Number.isSafeInteger(c.revision) ||
    c.revision < 1 ||
    !c.patch ||
    typeof c.patch !== 'object'
  )
    throw Error('Unsupported or malformed sync change');
  for (const [key, v] of Object.entries(c.patch)) {
    if (
      !keys.includes(key) ||
      (numbers.includes(key)
        ? typeof v !== 'number' || !Number.isFinite(v)
        : typeof v !== (strings.includes(key) ? 'string' : 'boolean')) ||
      (key === 'kind' && !kinds.includes(v as string))
    )
      throw Error('Invalid task field');
  }
  return {
    version: 1,
    id: c.id,
    device: c.device,
    task: c.task,
    revision: c.revision,
    patch: Object.fromEntries(
      keys
        .filter((k) => Object.hasOwn(c.patch, k))
        .map((k) => [k, c.patch[k as keyof Fields]]),
    ),
  };
}
export function merge(state: State, input: unknown): State {
  const c = validateChange(input);
  if (state.changes[c.id]) {
    if (JSON.stringify(state.changes[c.id]) !== JSON.stringify(c))
      throw Error('Conflicting change identifier');
    return state;
  }
  const task: Task = structuredClone(
    state.tasks[c.task] ?? {
      id: c.task,
      kind: 'task',
      list: '',
      section: '',
      kanban: false,
      icon: '',
      deletedFrom: '',
      title: '',
      notes: '',
      completed: false,
      completedAt: 0,
      trashed: false,
      trashedAt: 0,
      deleted: false,
      created: 0,
      stamps: {},
    },
  );
  for (const key of Object.keys(c.patch) as (keyof Fields)[]) {
    const old = task.stamps[key];
    if (
      !old ||
      c.revision > old[0] ||
      (c.revision === old[0] && c.device > old[1])
    ) {
      Object.assign(task, { [key]: c.patch[key] });
      task.stamps[key] = [c.revision, c.device];
    }
  }
  return {
    ...state,
    clock: Math.max(state.clock, c.revision),
    tasks: { ...state.tasks, [task.id]: task },
    changes: { ...state.changes, [c.id]: c },
  };
}
export function mutate(
  state: State,
  task: string,
  patch: Partial<Fields>,
): State {
  return merge(state, {
    version: 1,
    id: crypto.randomUUID(),
    device: state.device,
    task,
    revision: state.clock + 1,
    patch,
  });
}
export function restore(text: string): State {
  const saved = JSON.parse(text) as State;
  if (saved.version !== 1 || typeof saved.device !== 'string' || !saved.changes)
    throw Error('Unsupported database format');
  let result = { ...emptyState(), device: saved.device };
  for (const c of Object.values(saved.changes)) result = merge(result, c);
  return result;
}

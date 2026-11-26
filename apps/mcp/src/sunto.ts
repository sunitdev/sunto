// What each MCP tool reads or changes, over the app's own model and rules.
import type {
  Fields,
  State,
  Task,
} from '../../../packages/app/src/storage/model';
import {
  completion,
  epicDeletion,
  listDeletion,
  newEpic,
  newList,
  newTask,
  rescheduling,
  sectionDeletion,
  trashing,
  type Changes,
} from '../../../packages/app/src/storage/ops';
import {
  dayKey,
  formatRepeat,
  parseDay,
  parseRepeat,
  type Repeat,
} from '../../../packages/app/src/storage/dates';
import {
  dayPlan,
  organize,
  visibleTasks,
  type Library,
} from '../../../packages/app/src/storage/selectors';
import { untitled } from '../../../packages/app/src/views';

const live = (state: State, id: string) =>
  state.tasks[id] && !state.tasks[id].deleted ? state.tasks[id] : undefined;
export function todo(state: State, id: string) {
  const t = live(state, id);
  if (t?.kind !== 'task') throw Error(`No to-do with id ${id}`);
  return t;
}
function list(state: State, id: string, kinds: Task['kind'][]) {
  const t = live(state, id);
  if (!t || !kinds.includes(t.kind))
    throw Error(`No ${kinds.join(' or ')} with id ${id}`);
  return t;
}
const name = (t: Task) =>
  t.title ||
  (t.kind === 'project' || t.kind === 'area'
    ? untitled(t)
    : `Untitled ${t.kind}`);
export function validDay(day: string) {
  if (day && dayKey(parseDay(day)) !== day) throw Error(`Invalid date ${day}`);
  return day;
}

// A to-do as the tools show it, leaving out empty fields.
export function describe(lib: Library, t: Task) {
  const where = lib.lists[lib.listOf(t)];
  const section = lib.sectionsOf(t.list).find((s) => s.id === t.section);
  const epic = lib.epicOf(t);
  const repeat = parseRepeat(t.repeat);
  return {
    id: t.id,
    title: t.title,
    ...(t.notes && { notes: t.notes }),
    list: where ? name(where) : 'Inbox',
    ...(where && { listId: where.id }),
    ...(section && { section: name(section), sectionId: section.id }),
    ...(epic && { epic: name(epic), epicId: epic.id }),
    ...(t.date && { date: t.date }),
    ...(repeat && { repeat }),
    ...(t.planned && { planned: t.planned }),
    ...(t.completed && {
      completed: new Date(t.completedAt || t.created).toISOString(),
    }),
    ...(t.trashed && { trashed: new Date(t.trashedAt).toISOString() }),
    ...(t.deletedFrom && { deletedFrom: t.deletedFrom }),
  };
}

// The sidebar: areas with their projects, then projects outside an area,
// each project with its sections, epics and to-do counts.
export function overview(state: State) {
  const lib = organize(state);
  const today = dayKey();
  const day = dayPlan(lib, today);
  const project = (p: Task) => {
    const todos = lib.todos.filter(
      (t) => t.list === p.id && !t.trashed && t.title.trim(),
    );
    return {
      id: p.id,
      title: name(p),
      ...(p.icon && { icon: p.icon }),
      ...(p.notes && { notes: p.notes }),
      ...(p.kanban && { kanban: true }),
      open: todos.filter((t) => !t.completed).length,
      completed: todos.filter((t) => t.completed).length,
      sections: lib.sectionsOf(p.id).map((s) => ({ id: s.id, title: name(s) })),
      epics: lib
        .epicsOf(p.id)
        .map((e) => ({ id: e.id, title: name(e), color: e.color })),
    };
  };
  return {
    today,
    inbox: { open: lib.inboxCount },
    todayView: {
      dueOrOverdue: day.due.length,
      plannedForGoal: day.goal.length,
    },
    areas: lib.areas.map((a) => ({
      id: a.id,
      title: name(a),
      ...(a.icon && { icon: a.icon }),
      ...(a.notes && { notes: a.notes }),
      projects: lib.projects.filter((p) => lib.areaOf(p) === a.id).map(project),
    })),
    projects: lib.projects.filter((p) => !lib.areaOf(p)).map(project),
  };
}

export type ViewName =
  'inbox' | 'today' | 'goal' | 'logbook' | 'trash' | 'list';
// The to-dos a view of the app shows, in its order. `list` names the project
// or area of the 'list' view, and `epic` narrows a project to one epic.
export function listTodos(
  state: State,
  view: ViewName,
  options: { list?: string; epic?: string; limit: number },
) {
  const lib = organize(state);
  if (view === 'list') {
    if (!options.list) throw Error('The list view needs a list id');
    list(state, options.list, ['project', 'area']);
  }
  const tasks = visibleTasks(lib, view === 'list' ? options.list! : view, {
    list: view === 'list' ? options.list! : '',
    epic: options.epic,
    today: dayKey(),
    editing: null,
    lingering: {},
  }).filter((t) => t.title.trim());
  return {
    total: tasks.length,
    todos: tasks.slice(0, options.limit).map((t) => describe(lib, t)),
  };
}

// To-dos and lists whose title or notes contain `query`.
export function search(state: State, query: string, includeDone: boolean) {
  const lib = organize(state);
  const q = query.toLowerCase();
  const hit = (t: Task) =>
    t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q);
  return {
    lists: [...lib.areas, ...lib.projects]
      .filter(hit)
      .map((l) => ({ id: l.id, kind: l.kind, title: name(l) })),
    todos: lib.todos
      .filter(
        (t) =>
          t.title.trim() &&
          hit(t) &&
          (includeDone || (!t.completed && !t.trashed)),
      )
      .map((t) => describe(lib, t)),
  };
}

export function get(state: State, id: string) {
  const t = live(state, id);
  if (!t) throw Error(`Nothing with id ${id}`);
  if (t.kind === 'task')
    return { kind: 'task', ...describe(organize(state), t) };
  return {
    kind: t.kind,
    id: t.id,
    title: name(t),
    ...(t.notes && { notes: t.notes }),
    ...(t.icon && { icon: t.icon }),
    ...(t.color && { color: t.color }),
    ...(t.kanban && { kanban: true }),
    ...(t.list && { parentId: t.list }),
  };
}

export type TodoInput = {
  title?: string;
  notes?: string;
  list?: string;
  section?: string;
  epic?: string;
  date?: string;
  repeat?: Repeat | null;
  plannedToday?: boolean;
};
// The fields of `input` for a to-do that will be in `listId`, checking that
// its section and epic belong to that project.
function todoFields(state: State, listId: string, input: TodoInput) {
  const fields: Partial<Fields> = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw Error('A to-do needs a title');
    fields.title = input.title;
  }
  if (input.notes !== undefined) fields.notes = input.notes;
  if (input.section) {
    if (list(state, input.section, ['section']).list !== listId)
      throw Error(`Section ${input.section} is not in the to-do's project`);
    fields.section = input.section;
  } else if (input.section === '') fields.section = '';
  if (input.epic) {
    if (list(state, input.epic, ['epic']).list !== listId)
      throw Error(`Epic ${input.epic} is not in the to-do's project`);
    fields.epic = input.epic;
  } else if (input.epic === '') fields.epic = '';
  if (input.date !== undefined) fields.date = validDay(input.date);
  if (input.repeat !== undefined)
    fields.repeat = input.repeat
      ? formatRepeat(parseRepeat(JSON.stringify(input.repeat)))
      : '';
  if (input.plannedToday !== undefined)
    fields.planned = input.plannedToday ? dayKey() : '';
  return fields;
}
function checkList(state: State, id: string | undefined) {
  if (id) list(state, id, ['project', 'area']);
  return id ?? '';
}

export function addTodos(
  state: State,
  inputs: TodoInput[],
  ids: string[],
): Changes {
  return inputs.map((input) => {
    if (!input.title?.trim()) throw Error('A to-do needs a title');
    const where = checkList(state, input.list);
    const fields = todoFields(state, where, input);
    if (fields.repeat && !fields.date)
      throw Error('A repeating to-do needs a date');
    const id = crypto.randomUUID();
    ids.push(id);
    return [id, { ...newTask(where, ''), ...fields }];
  });
}

// Moving a to-do to another list takes it out of its section and epic,
// unless new ones in that list are given.
export function updateTodo(
  state: State,
  id: string,
  input: TodoInput,
): Changes {
  const t = todo(state, id);
  const moved = input.list !== undefined && input.list !== t.list;
  const where = moved ? checkList(state, input.list) : t.list;
  const fields = {
    ...(moved && { list: where, section: '', epic: '' }),
    ...todoFields(state, where, input),
  };
  if ((fields.repeat ?? t.repeat) && !(fields.date ?? t.date))
    throw Error('A repeating to-do needs a date');
  // An explicit plannedToday wins over a new date.
  return [
    [id, input.plannedToday === undefined ? rescheduling(t, fields) : fields],
  ];
}

export const completeTodos = (
  state: State,
  ids: string[],
  completed: boolean,
  forever = false,
) =>
  ids.flatMap((id) =>
    todo(state, id).completed === completed
      ? []
      : completion(state, id, completed, forever),
  );

export const trashTodos = (
  state: State,
  ids: string[],
  trashed: boolean,
): Changes =>
  ids.flatMap((id): Changes =>
    todo(state, id).trashed === trashed ? [] : [[id, trashing(trashed)]],
  );

// As in the app, only to-dos already in Trash can be deleted for good.
export const deleteTodos = (state: State, ids: string[]): Changes =>
  ids.map((id) => {
    if (!todo(state, id).trashed)
      throw Error(`To-do ${id} is not in Trash; move it to Trash first`);
    return [id, { deleted: true }];
  });

export type ListInput = {
  title?: string;
  notes?: string;
  icon?: string;
  kanban?: boolean;
  color?: string;
  area?: string;
};
export function addList(
  state: State,
  kind: 'project' | 'area' | 'section' | 'epic',
  parent: string | undefined,
  input: ListInput,
  id: string,
): Changes {
  if (!input.title?.trim()) throw Error(`A ${kind} needs a title`);
  if (kind === 'area' && parent) throw Error('An area has no parent');
  if (kind === 'project' && parent) list(state, parent, ['area']);
  if (kind === 'section' || kind === 'epic') {
    if (!parent) throw Error(`A ${kind} needs its project's id as parent`);
    list(state, parent, ['project']);
  }
  const base =
    kind === 'epic' ? newEpic(state, parent!) : newList(kind, parent ?? '');
  return [[id, { ...base, ...listFields(state, kind, input) }]];
}
function listFields(state: State, kind: Task['kind'], input: ListInput) {
  const fields: Partial<Fields> = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw Error('A title cannot be empty');
    fields.title = input.title;
  }
  if (input.notes !== undefined) fields.notes = input.notes;
  if (input.icon !== undefined) fields.icon = input.icon;
  if (input.kanban !== undefined) {
    if (kind !== 'project') throw Error('Only a project can be a board');
    fields.kanban = input.kanban;
  }
  if (input.color !== undefined) {
    if (kind !== 'epic') throw Error('Only an epic has a colour');
    fields.color = input.color;
  }
  if (input.area !== undefined) {
    if (kind !== 'project') throw Error('Only a project belongs to an area');
    if (input.area) list(state, input.area, ['area']);
    fields.list = input.area;
  }
  return fields;
}
export function updateList(
  state: State,
  id: string,
  input: ListInput,
): Changes {
  const t = list(state, id, ['project', 'area', 'section', 'epic']);
  return [[id, listFields(state, t.kind, input)]];
}
export function deleteList(state: State, id: string): Changes {
  const t = list(state, id, ['project', 'area', 'section', 'epic']);
  return t.kind === 'epic'
    ? epicDeletion(state, id)
    : t.kind === 'section'
      ? sectionDeletion(state, id)
      : listDeletion(state, id);
}

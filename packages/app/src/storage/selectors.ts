// Pure queries over the stored state that decide what each view shows.
import type { View } from '../views';
import type { State, Task } from './model';

export const completedTime = (t: Task) => t.completedAt || t.created;

const oldestFirst = (a: Task, b: Task) =>
  a.created - b.created || a.id.localeCompare(b.id);

// The live areas, projects, sections, epics and to-dos, and how they belong
// to each other.
export function organize(state: State) {
  const live = Object.values(state.tasks).filter((t) => !t.deleted);
  const areas = live.filter((t) => t.kind === 'area').sort(oldestFirst);
  const projects = live
    .filter((t) => t.kind === 'project')
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
  const lists = Object.fromEntries(
    [...areas, ...projects].map((l) => [l.id, l]),
  );
  const todos = live.filter((t) => t.kind === 'task');
  const sections = live.filter((t) => t.kind === 'section').sort(oldestFirst);
  // A project's sections, in the order they were added.
  const sectionsOf = (project: string) =>
    sections.filter((s) => s.list === project);
  const epics = live.filter((t) => t.kind === 'epic').sort(oldestFirst);
  // A project's epics, in the order they were added.
  const epicsOf = (project: string) => epics.filter((e) => e.list === project);
  // A to-do's epic, if it is still one of its project's.
  const epicOf = (t: Task) =>
    t.epic
      ? epics.find((e) => e.id === t.epic && e.list === t.list)
      : undefined;
  // To-dos whose project was deleted on another device fall back to the Inbox.
  const listOf = (t: Task) => (lists[t.list] ? t.list : '');
  const areaOf = (p: Task) => (lists[p.list]?.kind === 'area' ? p.list : '');
  // The share of a list's to-dos that are completed.
  function progress(id: string) {
    const all = todos.filter((t) => t.list === id && !t.trashed);
    return all.length ? all.filter((t) => t.completed).length / all.length : 0;
  }
  const inboxCount = todos.filter(
    (t) => !listOf(t) && !t.trashed && !t.completed && t.title.trim(),
  ).length;
  // The Inbox ('') and every list, in sidebar order: projects outside an
  // area, then each area followed by its projects.
  const order = [
    '',
    ...projects.filter((p) => !areaOf(p)).map((p) => p.id),
    ...areas.flatMap((a) => [
      a.id,
      ...projects.filter((p) => areaOf(p) === a.id).map((p) => p.id),
    ]),
  ];
  return {
    areas,
    projects,
    lists,
    todos,
    sectionsOf,
    epicsOf,
    epicOf,
    listOf,
    areaOf,
    progress,
    inboxCount,
    order,
  };
}
export type Library = ReturnType<typeof organize>;

// For the day `today`: the open to-dos due then or overdue, earliest first,
// and the to-dos picked for its goal.
export function dayPlan({ todos }: Library, today: string) {
  const due = todos
    .filter(
      (t) =>
        !t.trashed &&
        !t.completed &&
        t.date &&
        t.date <= today &&
        t.title.trim(),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const goal = todos.filter((t) => t.planned === today && !t.trashed);
  return { due, goal };
}
export type Day = ReturnType<typeof dayPlan>;

// The to-dos `view` shows, in display order. `list` is the open project or
// area ('' for the Inbox), `epic` the project's epic to show alone ('' for
// all), and `today` the current day. The to-do being
// edited stays visible, and so does one just completed while it lingers; the
// phone keeps completed to-dos in the Inbox, and the goal keeps them all.
export function visibleTasks(
  { todos, listOf }: Library,
  view: View,
  options: {
    list: string;
    epic?: string;
    today: string;
    editing: string | null;
    lingering: Record<string, true>;
    phone: boolean;
  },
) {
  const { list, epic, today, editing, lingering, phone } = options;
  const open = (t: Task) => !t.completed || lingering[t.id];
  const shows = (t: Task) =>
    view === 'logbook'
      ? t.completed && !lingering[t.id]
      : view === 'today'
        ? !!t.date && t.date <= today && open(t)
        : view === 'goal'
          ? t.planned === today
          : listOf(t) === list &&
            (phone || open(t)) &&
            (!epic || t.epic === epic);
  return todos
    .filter((t) =>
      view === 'trash'
        ? t.trashed
        : !t.trashed && (t.id === editing || shows(t)),
    )
    .sort(
      view === 'logbook'
        ? (a, b) => completedTime(b) - completedTime(a)
        : view === 'trash'
          ? (a, b) => b.trashedAt - a.trashedAt
          : (a, b) => b.created - a.created || a.id.localeCompare(b.id),
    );
}

// `list` is the project or area ('' for the Inbox) of a group by list.
export type Group = {
  key: string;
  section?: Task;
  list?: string;
  tasks: Task[];
};

// The Logbook groups to-dos by the day they were completed. A project with
// `sections` groups by section, after any to-dos in none, keeping empty
// sections. Other views show a single group.
export function groupTasks(
  tasks: Task[],
  view: View,
  sections: Task[] = [],
): Group[] {
  if (sections.length) {
    const ids = new Set(sections.map((s) => s.id));
    const loose = tasks.filter((t) => !ids.has(t.section));
    return [
      ...(loose.length ? [{ key: 'none', tasks: loose }] : []),
      ...sections.map((section) => ({
        key: section.id,
        section,
        tasks: tasks.filter((t) => t.section === section.id),
      })),
    ];
  }
  const groups: Group[] = [];
  for (const task of tasks) {
    const key =
      view === 'logbook' ? new Date(completedTime(task)).toDateString() : view;
    if (groups.at(-1)?.key !== key) groups.push({ key, tasks: [] });
    groups.at(-1)!.tasks.push(task);
  }
  return groups;
}

// Today and the goal group to-dos by their list, in sidebar order.
export function groupByList(tasks: Task[], { order, listOf }: Library) {
  return order
    .map((list) => ({
      key: list || 'inbox',
      list,
      tasks: tasks.filter((t) => listOf(t) === list),
    }))
    .filter((g) => g.tasks.length > 0);
}

// Pure queries over the stored state that decide what each view shows.
import type { View } from '../views';
import type { State, Task } from './model';

export const completedTime = (t: Task) => t.completedAt || t.created;

const oldestFirst = (a: Task, b: Task) =>
  a.created - b.created || a.id.localeCompare(b.id);

// The live areas, projects, sections and to-dos, and how they belong to each
// other.
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
  return {
    areas,
    projects,
    lists,
    todos,
    sectionsOf,
    listOf,
    areaOf,
    progress,
    inboxCount,
  };
}
export type Library = ReturnType<typeof organize>;

// The to-dos `view` shows, in display order. `list` is the open project or
// area ('' for the Inbox). The to-do being edited stays visible, and so does
// one just completed while it lingers; the phone keeps completed to-dos in
// the Inbox.
export function visibleTasks(
  { todos, listOf }: Library,
  view: View,
  options: {
    list: string;
    editing: string | null;
    lingering: Record<string, true>;
    phone: boolean;
  },
) {
  const { list, editing, lingering, phone } = options;
  return todos
    .filter((t) =>
      view === 'trash'
        ? t.trashed
        : !t.trashed &&
          (t.id === editing ||
            (view === 'logbook'
              ? t.completed && !lingering[t.id]
              : listOf(t) === list &&
                (phone || !t.completed || lingering[t.id]))),
    )
    .sort(
      view === 'logbook'
        ? (a, b) => completedTime(b) - completedTime(a)
        : view === 'trash'
          ? (a, b) => b.trashedAt - a.trashedAt
          : (a, b) => b.created - a.created || a.id.localeCompare(b.id),
    );
}

export type Group = { key: string; section?: Task; tasks: Task[] };

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

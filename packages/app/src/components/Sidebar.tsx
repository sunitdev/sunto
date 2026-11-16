import { useState, type DragEvent, type ReactNode } from 'react';
import * as store from '../storage/store';
import type { Task } from '../storage/model';
import type { Day, Library } from '../storage/selectors';
import { taskDropTarget } from '../drag';
import { useCollapsedAreas } from '../hooks/useCollapsedAreas';
import { titles, untitled, type StaticView, type View } from '../views';
import { ListIcon, SettingsIcon, ViewIcon } from './icons';
import { NewListMenu } from './NewListMenu';

export function Sidebar({
  library,
  day,
  today,
  view,
  show,
  openMenu,
  addList,
}: {
  library: Library;
  day: Day;
  today: string;
  view: View;
  show: (view: View) => void;
  openMenu: (menu: { id: string; x: number; y: number }) => void;
  addList: (kind: 'project' | 'area') => void;
}) {
  const {
    areas,
    projects,
    lists,
    todos,
    listOf,
    areaOf,
    progress,
    inboxCount,
  } = library;
  // The project being dragged, and the area it would join ('' for none).
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  // The list ('' for the Inbox) that a dragged to-do would move to.
  const [taskDrop, setTaskDrop] = useState<string | null>(null);
  const [collapsed, toggleArea] = useCollapsedAreas();
  function taskTarget(list: string) {
    return taskDropTarget(
      (over) =>
        setTaskDrop((current) =>
          over ? list : current === list ? null : current,
        ),
      (id) => {
        const task = todos.find((t) => t.id === id);
        if (task && listOf(task) !== list) void store.move(id, list);
      },
    );
  }
  const goalDone = day.goal.filter((t) => t.completed).length;
  const counts: Partial<Record<StaticView, ReactNode>> = {
    inbox: inboxCount > 0 && (
      <span
        className="sidebar-count"
        aria-label={`${inboxCount} incomplete tasks`}
      >
        {inboxCount}
      </span>
    ),
    today: day.due.length > 0 && (
      <span
        className={`sidebar-count${day.due.some((t) => t.date < today) ? ' is-overdue' : ''}`}
        aria-label={`${day.due.length} due`}
      >
        {day.due.length}
      </span>
    ),
    goal: day.goal.length > 0 && (
      <span
        className={`sidebar-count goal-count${goalDone === day.goal.length ? ' is-complete' : ''}`}
        aria-label={`${goalDone} of ${day.goal.length} done`}
      >
        {goalDone}/{day.goal.length}
      </span>
    ),
  };
  const looseProjects = projects.filter((p) => !areaOf(p));
  const dragging = drag ? lists[drag] : undefined;
  function dropZone(area: string) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDrop(area);
      },
      onDragLeave: (e: DragEvent) => {
        if (
          e.relatedTarget instanceof Node &&
          e.currentTarget.contains(e.relatedTarget)
        )
          return;
        setDrop((current) => (current === area ? null : current));
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (dragging && areaOf(dragging) !== area)
          void store.update(dragging.id, { list: area });
        setDrag(null);
        setDrop(null);
      },
    };
  }
  function listButton(list: Task) {
    const project = list.kind === 'project';
    return (
      <button
        key={list.id}
        className={`sidebar-item${taskDrop === list.id ? ' is-drop' : ''}`}
        aria-current={view === list.id ? 'page' : undefined}
        {...taskTarget(list.id)}
        draggable={project}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', list.title || untitled(list));
          setDrag(list.id);
        }}
        onDragEnd={() => {
          setDrag(null);
          setDrop(null);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu({ id: list.id, x: e.clientX, y: e.clientY });
        }}
        onClick={() => show(list.id)}
      >
        <ListIcon list={list} progress={progress(list.id)} />
        <span className={`sidebar-title${list.title ? '' : ' untitled'}`}>
          {list.title || untitled(list)}
        </span>
      </button>
    );
  }
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav" aria-label="Lists">
        {(['inbox', 'today', 'goal', 'logbook', 'trash'] as const).map((v) => (
          <button
            key={v}
            className={`sidebar-item${v === 'inbox' || v === 'goal' ? ' sidebar-break' : ''}${v === 'inbox' && taskDrop === '' ? ' is-drop' : ''}`}
            aria-current={view === v ? 'page' : undefined}
            {...(v === 'inbox' && taskTarget(''))}
            onClick={() => show(v)}
          >
            <ViewIcon view={v} />
            <span className="sidebar-title">{titles[v]}</span>
            {counts[v]}
          </button>
        ))}
        {/* Dropping a project here takes it out of its area. */}
        {(looseProjects.length > 0 || (dragging && areaOf(dragging))) && (
          <div
            className={`sidebar-group sidebar-loose${drop === '' ? ' is-drop' : ''}`}
            {...dropZone('')}
          >
            {looseProjects.map(listButton)}
          </div>
        )}
        {areas.map((area) => {
          const open = !collapsed.has(area.id);
          const title = area.title || untitled(area);
          return (
            <div
              key={area.id}
              className={`sidebar-group sidebar-area${drop === area.id ? ' is-drop' : ''}`}
              {...dropZone(area.id)}
            >
              <div className="sidebar-area-row">
                <button
                  className="area-toggle"
                  aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
                  aria-expanded={open}
                  onClick={() => toggleArea(area.id)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {listButton(area)}
              </div>
              {open && (
                <div
                  className="sidebar-area-projects"
                  role="group"
                  aria-label={`${title} projects`}
                >
                  {projects
                    .filter((p) => areaOf(p) === area.id)
                    .map(listButton)}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <NewListMenu create={addList} />
        <button
          className="settings-open"
          aria-label="Settings"
          title="Settings"
          aria-current={view === 'settings' ? 'page' : undefined}
          onClick={() => show('settings')}
        >
          <SettingsIcon />
        </button>
      </div>
    </aside>
  );
}

import { useState, type DragEvent } from 'react';
import * as store from '../storage/store';
import type { Task } from '../storage/model';
import type { Library } from '../storage/selectors';
import { taskDropTarget } from '../drag';
import { titles, untitled, type View } from '../views';
import { ListIcon, ViewIcon } from './icons';
import { NewListMenu } from './NewListMenu';

export function Sidebar({
  library,
  view,
  show,
  openMenu,
  addList,
}: {
  library: Library;
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
          if (!project) return;
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
        {(['inbox', 'logbook', 'trash'] as const).map((v) => (
          <button
            key={v}
            className={`sidebar-item${v === 'inbox' && taskDrop === '' ? ' is-drop' : ''}`}
            aria-current={view === v ? 'page' : undefined}
            {...(v === 'inbox' && taskTarget(''))}
            onClick={() => show(v)}
          >
            <ViewIcon view={v} />
            <span className="sidebar-title">{titles[v]}</span>
            {v === 'inbox' && inboxCount > 0 && (
              <span
                className="sidebar-count"
                aria-label={`${inboxCount} incomplete tasks`}
              >
                {inboxCount}
              </span>
            )}
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
        {areas.map((area) => (
          <div
            key={area.id}
            className={`sidebar-group sidebar-area${drop === area.id ? ' is-drop' : ''}`}
            {...dropZone(area.id)}
          >
            {listButton(area)}
            {projects.filter((p) => areaOf(p) === area.id).map(listButton)}
          </div>
        ))}
      </nav>
      <NewListMenu create={addList} />
    </aside>
  );
}

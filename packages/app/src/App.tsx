import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react';
import * as store from './storage/store';
import { native } from './storage/driver';
import type { Task } from './storage/model';
import {
  completedTime,
  groupTasks,
  organize,
  visibleTasks,
} from './storage/selectors';
import { phoneQuery, usePhone } from './hooks/usePhone';
import {
  dayName,
  empties,
  isStatic,
  titles,
  untitled,
  type StaticView,
  type View,
} from './views';
import { Check } from './components/Check';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu } from './components/ContextMenu';
import { Editor } from './components/Editor';
import {
  InboxIcon,
  ListIcon,
  Plus,
  ToolbarIcon,
  ViewIcon,
} from './components/icons';
import { ListHeader } from './components/ListHeader';
import { NewListMenu } from './components/NewListMenu';

export function App() {
  const { state, ready, error, syncStatus, folder } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const phone = usePhone();
  const [selectedView, setSelectedView] = useState<View>('inbox');
  const [editing, setEditing] = useState<string | null>(null);
  const [lingering, setLingering] = useState<Record<string, true>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [settings, setSettings] = useState(false);
  // The project being dragged in the sidebar, and the area it would join
  // ('' for none).
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onKey = useRef((e: KeyboardEvent) => void e);
  const addButton = useRef<HTMLButtonElement>(null);
  const footer = useRef<HTMLElement>(null);
  const editorArea = useRef<HTMLLIElement>(null);
  const closeEditor = useRef<(then?: (id: string) => void) => void>(() => {});
  const library = organize(state);
  const { areas, projects, lists, todos, areaOf, progress, inboxCount } =
    library;
  const listName = (t: Task) => {
    const list = lists[t.list];
    return list ? list.title || untitled(list) : t.deletedFrom;
  };
  // The phone layout has no navigation, so it always shows the Inbox.
  const view: View =
    phone || !(isStatic(selectedView) || lists[selectedView])
      ? 'inbox'
      : selectedView;
  const openList = isStatic(view) ? undefined : lists[view];
  const tasks = visibleTasks(library, view, {
    list: openList?.id ?? '',
    editing,
    lingering,
    phone,
  });
  const groups = groupTasks(tasks, view).map((group) => ({
    ...group,
    label:
      view === 'logbook' ? dayName(completedTime(group.tasks[0]), false) : '',
  }));
  const looseProjects = projects.filter((p) => !areaOf(p));
  const dragging = drag ? lists[drag] : undefined;
  useLayoutEffect(() => {
    closeEditor.current = (then) => {
      // Unmount flushes the editor's draft before this cleanup is queued.
      const id = editing;
      setEditing(null);
      setTimeout(() => {
        if (id) {
          then?.(id);
          const t = store.getSnapshot().state.tasks[id];
          if (t && !t.title.trim()) void store.update(id, { deleted: true });
        }
        addButton.current?.focus();
      }, 0);
    };
  }, [editing]);
  useEffect(() => {
    void store.start().then(store.sync).then(store.purgeTrash);
    const interval = setInterval(
      () => void store.sync().then(store.purgeTrash),
      10000,
    );
    const refresh = () => {
      if (!document.hidden) void store.sync();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (!editing) return;
    const outside = (e: PointerEvent) => {
      if (
        !phoneQuery.matches &&
        e.target instanceof Node &&
        !editorArea.current?.contains(e.target) &&
        !footer.current?.contains(e.target)
      )
        closeEditor.current();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [editing]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => onKey.current(e);
    // Clicking anywhere other than a to-do or its menu clears the selection.
    const deselect = (e: PointerEvent) => {
      if (
        e.target instanceof Element &&
        !e.target.closest('.task-row, .context-menu')
      )
        setSelected(null);
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', deselect);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', deselect);
    };
  }, []);
  useEffect(() => {
    // Keyboard focus follows the selection, e.g. after deleting a to-do.
    const active = document.activeElement;
    if (
      selected &&
      (active === document.body || active?.classList.contains('task-title'))
    )
      document
        .querySelector<HTMLElement>(`[data-task="${selected}"] .task-title`)
        ?.focus();
  }, [selected]);
  // Selects the neighbouring to-do so repeated deletes keep working.
  function leave(task: Task) {
    const i = tasks.findIndex((t) => t.id === task.id);
    setSelected((tasks[i + 1] ?? tasks[i - 1])?.id ?? null);
  }
  // In Trash, deleting is permanent; elsewhere it moves the to-do to Trash.
  function remove(task: Task) {
    leave(task);
    void (view === 'trash'
      ? store.update(task.id, { deleted: true })
      : store.setTrashed(task.id, true));
  }
  function putBack(task: Task) {
    leave(task);
    void store.setTrashed(task.id, false);
  }
  useLayoutEffect(() => {
    onKey.current = (e) => {
      if (phoneQuery.matches || editing || menu || e.isComposing) return;
      const target = e.target as Element;
      if (
        target.closest(
          'input, textarea, .storage-panel, .popover, .dialog, .context-menu',
        )
      )
        return;
      const i = tasks.findIndex((t) => t.id === selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!tasks.length) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const next =
          i < 0
            ? step > 0
              ? 0
              : tasks.length - 1
            : Math.max(0, Math.min(tasks.length - 1, i + step));
        setSelected(tasks[next].id);
        return;
      }
      if (i < 0) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        remove(tasks[i]);
      } else if (
        e.key === 'Enter' &&
        (target.tagName !== 'BUTTON' || target.classList.contains('task-title'))
      ) {
        e.preventDefault();
        setEditing(tasks[i].id);
      } else if (e.key === 'Escape') setSelected(null);
    };
  });
  function openEditor(task: Task) {
    if (editing) closeEditor.current();
    setSelected(task.id);
    setEditing(task.id);
  }
  function toggle(task: Task) {
    const completed = !task.completed;
    void store.setCompleted(task.id, completed);
    // Completed to-dos stay briefly in their list before moving to the Logbook.
    const linger =
      completed && (view === 'inbox' || !!openList) && !task.trashed;
    setLinger(task.id, linger);
    if (linger) setTimeout(() => setLinger(task.id, false), 900);
  }
  function setLinger(id: string, on: boolean) {
    setLingering((current) => {
      const next = { ...current };
      if (on) next[id] = true;
      else delete next[id];
      return next;
    });
  }
  function showView(next: View) {
    if (editing) closeEditor.current();
    setSelected(null);
    setSelectedView(next);
  }
  async function addTask() {
    // New to-dos join the open project or area; elsewhere they go to the Inbox.
    if (!openList) setSelectedView('inbox');
    const id = await store.add(openList?.id);
    if (store.getSnapshot().state.tasks[id]) setEditing(id);
  }
  async function addList(kind: 'project' | 'area') {
    if (editing) closeEditor.current();
    setSelected(null);
    const id = await store.addList(kind);
    if (store.getSnapshot().state.tasks[id]) setSelectedView(id);
  }
  function deleteProject(id: string) {
    setConfirmDelete(null);
    if (editing) closeEditor.current();
    if (selectedView === id) setSelectedView('inbox');
    void store.deleteProject(id);
  }
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
        className="sidebar-item"
        aria-current={view === list.id ? 'page' : undefined}
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
          setMenu({ id: list.id, x: e.clientX, y: e.clientY });
        }}
        onClick={() => showView(list.id)}
      >
        <ListIcon list={list} progress={progress(list.id)} />
        <span className={`sidebar-title${list.title ? '' : ' untitled'}`}>
          {list.title || untitled(list)}
        </span>
      </button>
    );
  }
  const menuTask = menu && tasks.find((t) => t.id === menu.id);
  const menuProject =
    menu && lists[menu.id]?.kind === 'project' && lists[menu.id];
  const deleting = confirmDelete ? lists[confirmDelete] : undefined;
  const deletingCount = deleting
    ? todos.filter(
        (t) => t.list === deleting.id && !t.trashed && t.title.trim(),
      ).length
    : 0;
  const areaProjects =
    openList?.kind === 'area'
      ? projects.filter((p) => areaOf(p) === openList.id)
      : [];
  const settingsToggle = (
    <button
      className="settings-toggle"
      aria-label="Storage settings"
      onClick={() => setSettings(!settings)}
    >
      ···
    </button>
  );
  return (
    <div className={`inbox-app${editing ? ' is-editing' : ''}`}>
      <aside className="sidebar">
        <nav className="sidebar-nav" aria-label="Lists">
          {(['inbox', 'logbook', 'trash'] as const).map((v) => {
            return (
              <button
                key={v}
                className="sidebar-item"
                aria-current={view === v ? 'page' : undefined}
                onClick={() => showView(v)}
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
            );
          })}
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
        <NewListMenu create={(kind) => void addList(kind)} />
      </aside>
      <main className={`inbox-main view-${openList ? 'list' : view}`}>
        {openList ? (
          <ListHeader
            key={openList.id}
            list={openList}
            progress={progress(openList.id)}
          >
            {settingsToggle}
          </ListHeader>
        ) : (
          <header className="inbox-header">
            <ViewIcon view={view as StaticView} />
            <h1>{titles[view as StaticView]}</h1>
            {settingsToggle}
          </header>
        )}
        {error && (
          <div className="save-error" role="alert">
            {error} <button onClick={() => void store.retry()}>Retry</button>
          </div>
        )}
        {settings && (
          <section className="storage-panel" aria-label="Storage settings">
            <strong>Storage & sync</strong>
            <p>
              {native
                ? 'Tasks are saved in SQLite on this device. Select the same iCloud Drive/Sunto folder on both devices.'
                : 'Tasks are saved in this browser. Open the native app to use iCloud folder sync.'}
            </p>
            <p role="status">
              {syncStatus}
              {folder && ` · ${folder}`}
            </p>
            {native && (
              <div>
                <button onClick={() => void store.chooseFolder()}>
                  Choose folder
                </button>
                {folder && (
                  <>
                    <button onClick={() => void store.sync()}>Sync now</button>
                    <button onClick={() => void store.disconnect()}>
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            )}
            <button onClick={() => setSettings(false)}>Close</button>
          </section>
        )}
        <div className="task-scroll">
          {areaProjects.length > 0 && (
            <ul className="area-projects" aria-label="Projects">
              {areaProjects.map((p) => (
                <li key={p.id}>
                  <button
                    className={p.title ? undefined : 'untitled'}
                    onClick={() => showView(p.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ id: p.id, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <ListIcon list={p} progress={progress(p.id)} />
                    {p.title || untitled(p)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {view === 'trash' && tasks.length > 0 && (
            <button
              className="empty-trash"
              onClick={() => {
                if (editing) closeEditor.current();
                void store.updateAll(
                  tasks.map((t) => [t.id, { deleted: true }]),
                );
              }}
            >
              Empty Trash
            </button>
          )}
          {groups.map((group) => (
            <section key={group.key} className="task-group">
              {group.label && <h2>{group.label}</h2>}
              <ul
                className="task-list"
                aria-label={
                  group.label ||
                  `${openList ? openList.title || untitled(openList) : titles[view as StaticView]} tasks`
                }
              >
                {group.tasks.map((task) => (
                  <li
                    key={task.id}
                    data-task={task.id}
                    ref={editing === task.id ? editorArea : undefined}
                    className={`task-item${task.completed ? ' task-row--completed' : ''}${editing === task.id ? ' task-item--editing' : ''}${selected === task.id && !phone ? ' task-item--selected' : ''}`}
                  >
                    {editing === task.id ? (
                      <Editor
                        task={task}
                        close={() => closeEditor.current()}
                        onToggle={toggle}
                      />
                    ) : (
                      <div
                        className="task-row"
                        onContextMenu={(e) => {
                          if (phone) return;
                          e.preventDefault();
                          if (editing) closeEditor.current();
                          setSelected(task.id);
                          setMenu({ id: task.id, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <Check task={task} onToggle={toggle} />
                        {view === 'logbook' && task.completed && (
                          <span className="task-date">
                            {dayName(completedTime(task), true)}
                          </span>
                        )}
                        <button
                          className="task-title"
                          // Desktop: click selects, double-click edits.
                          onClick={() =>
                            phone ? openEditor(task) : setSelected(task.id)
                          }
                          onDoubleClick={() => openEditor(task)}
                          onFocus={() => {
                            if (!phone) setSelected(task.id);
                          }}
                        >
                          <span>{task.title || 'New To-Do'}</span>
                          {(view === 'logbook' || view === 'trash') &&
                            listName(task) && (
                              <span className="task-list-name">
                                {listName(task)}
                              </span>
                            )}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {tasks.length === 0 && !openList && (
            <div className="empty-state">
              <InboxIcon empty />
              <span>
                {ready ? empties[view as StaticView] : 'Loading tasks…'}
              </span>
            </div>
          )}
        </div>
        <div className="bottom-fade" aria-hidden="true" />
        <footer className="inbox-footer" ref={footer}>
          {!editing ? (
            <button
              ref={addButton}
              className="add-button"
              disabled={!ready}
              aria-label="New to-do"
              title="New To-Do"
              onClick={() => void addTask()}
            >
              <Plus />
            </button>
          ) : phone ? null : view === 'trash' ? (
            <button
              className="footer-button"
              aria-label="Put back"
              title="Put Back"
              onClick={() =>
                closeEditor.current((id) => void store.setTrashed(id, false))
              }
            >
              <ToolbarIcon d="M4.5 12h15M13.5 6l6 6-6 6" />
            </button>
          ) : (
            <button
              className="footer-button"
              aria-label="Move to Trash"
              title="Move to Trash"
              onClick={() =>
                closeEditor.current((id) => void store.setTrashed(id, true))
              }
            >
              <ToolbarIcon d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5L17.2 7" />
            </button>
          )}
        </footer>
      </main>
      {menuTask && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={
            view === 'trash'
              ? [
                  { label: 'Put Back', action: () => putBack(menuTask) },
                  {
                    label: 'Delete Immediately',
                    action: () => remove(menuTask),
                  },
                ]
              : [{ label: 'Delete', action: () => remove(menuTask) }]
          }
        />
      )}
      {menuProject && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={[
            {
              label: 'Delete Project…',
              action: () => setConfirmDelete(menuProject.id),
            },
          ]}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title || untitled(deleting)}”?`}
          body={
            deletingCount === 0
              ? 'This project has no to-dos. The project can’t be restored.'
              : `Its ${deletingCount === 1 ? '1 to-do' : `${deletingCount} to-dos`} will be moved to the Trash. The project itself can’t be restored.`
          }
          action="Delete Project"
          confirm={() => deleteProject(deleting.id)}
          cancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

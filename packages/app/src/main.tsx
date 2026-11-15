import {
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import * as store from './storage/store';
import { native } from './storage/driver';
import type { Task } from './storage/model';
import './styles.css';

type View = 'inbox' | 'logbook' | 'trash';
const titles: Record<View, string> = {
  inbox: 'Inbox',
  logbook: 'Logbook',
  trash: 'Trash',
};
const empties: Record<View, string> = {
  inbox: 'Inbox is empty',
  logbook: 'Completed to-dos will appear here',
  trash: 'Trash is empty',
};
const phoneQuery = matchMedia('(width < 700px)');
function subscribePhone(listener: () => void) {
  phoneQuery.addEventListener('change', listener);
  return () => phoneQuery.removeEventListener('change', listener);
}
const DAY = 86400000;
function dayName(time: number, short: boolean) {
  const day = new Date(time).toDateString();
  const now = Date.now();
  if (day === new Date(now).toDateString()) return short ? 'today' : 'Today';
  if (day === new Date(now - DAY).toDateString())
    return short ? 'yesterday' : 'Yesterday';
  return new Date(time).toLocaleDateString(
    'en-GB',
    short
      ? { day: 'numeric', month: 'short' }
      : { weekday: 'long', day: 'numeric', month: 'long' },
  );
}
const completedTime = (t: Task) => t.completedAt || t.created;

function InboxIcon({ empty = false }: { empty?: boolean }) {
  return (
    <svg
      className={`view-icon inbox-icon${empty ? ' empty-icon' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={empty ? 1.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="phone-glyph">
        <path d="M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13" />
        <path
          d="M3 13h5.2a1 1 0 0 1 1 .8 3 3 0 0 0 5.6 0 1 1 0 0 1 1-.8H21v4.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          fill={empty ? 'none' : 'currentColor'}
        />
      </g>
      <g className="desktop-glyph">
        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="5.5"
          fill="currentColor"
          stroke="none"
        />
        <g stroke="white" strokeWidth="1.6">
          <path d="M6 13.2l1.5-3.9a1.3 1.3 0 0 1 1.2-.8h6.6a1.3 1.3 0 0 1 1.2.8l1.5 3.9V16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" />
          <path d="M6 13.2h3.5a2.5 2.5 0 0 0 5 0H18" />
        </g>
      </g>
    </svg>
  );
}
function LogbookIcon() {
  return (
    <svg
      className="view-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="4" y="1.5" width="16" height="21" rx="2.5" fill="#5dbb63" />
      <rect x="4" y="1.5" width="4.5" height="21" rx="2.2" fill="#3e9a4a" />
      <path
        d="M10.5 12.3l2.1 2.2 4.2-4.7"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      className="view-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="trash-body"
        d="M5 6.5h14l-1.4 13.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z"
      />
      <ellipse className="trash-rim" cx="12" cy="6.5" rx="7.5" ry="2.2" />
    </svg>
  );
}
const viewIcons: Record<View, typeof InboxIcon> = {
  inbox: InboxIcon,
  logbook: LogbookIcon,
  trash: TrashIcon,
};
function ToolbarIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
function Plus() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}
function Check({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (task: Task) => void;
}) {
  return (
    <button
      className="task-check"
      type="button"
      aria-label={`${task.completed ? 'Mark as not completed' : 'Mark as completed'}: ${task.title || 'New to-do'}`}
      aria-pressed={task.completed}
      onClick={() => onToggle(task)}
    >
      <span className="task-box">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </span>
    </button>
  );
}
function Editor({
  task,
  close,
  onToggle,
}: {
  task: Task;
  close: () => void;
  onToggle: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const draft = useRef({ title, notes });
  const saved = useRef({ title: task.title, notes: task.notes });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useRef(() => {});
  useLayoutEffect(() => {
    flush.current = () => {
      clearTimeout(timer.current);
      const patch: { title?: string; notes?: string } = {};
      if (draft.current.title !== saved.current.title)
        patch.title = draft.current.title;
      if (draft.current.notes !== saved.current.notes)
        patch.notes = draft.current.notes;
      if (Object.keys(patch).length) {
        saved.current = { ...draft.current };
        void store.update(task.id, patch);
      }
    };
  }, [task.id]);
  useEffect(() => {
    const save = () => flush.current();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, []);
  function change(key: 'title' | 'notes', value: string) {
    draft.current[key] = value;
    if (key === 'title') setTitle(value);
    else setNotes(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), 250);
  }
  function done() {
    flush.current();
    if (!draft.current.title.trim())
      void store.update(task.id, { deleted: true });
    close();
  }
  return (
    <div className="task-editor">
      <div className="task-row">
        <Check task={task} onToggle={onToggle} />
        <input
          autoFocus
          aria-label="To-do title"
          placeholder="New To-Do"
          value={title}
          onChange={(e) => change('title', e.target.value)}
          onKeyDown={(e) => {
            if (
              !e.nativeEvent.isComposing &&
              (e.key === 'Enter' || e.key === 'Escape')
            ) {
              e.preventDefault();
              done();
            }
          }}
        />
      </div>
      <textarea
        aria-label="Notes"
        placeholder="Notes"
        rows={3}
        value={notes}
        onChange={(e) => change('notes', e.target.value)}
        onKeyDown={(e) => {
          if (!e.nativeEvent.isComposing && e.key === 'Escape') done();
        }}
      />
      <div className="editor-actions">
        <button onClick={done}>Done</button>
      </div>
    </div>
  );
}
type MenuItem = { label: string; action: () => void };
function ContextMenu({
  x,
  y,
  items,
  close,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  close: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Keep the menu inside the window, like a native context menu.
    const el = menu.current!;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(4, Math.min(x, innerWidth - width - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(y, innerHeight - height - 4))}px`;
    el.querySelector('button')?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (e: Event) => {
      if (!(e.target instanceof Node && menu.current?.contains(e.target)))
        close();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...menu.current!.querySelectorAll('button')];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        buttons[(i + step + buttons.length) % buttons.length].focus();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', keys);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', keys);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [close]);
  return (
    <div ref={menu} className="context-menu" role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            close();
            item.action();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
function App() {
  const { state, ready, error, syncStatus, folder } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const phone = useSyncExternalStore(subscribePhone, () => phoneQuery.matches);
  const [selectedView, setSelectedView] = useState<View>('inbox');
  const [editing, setEditing] = useState<string | null>(null);
  const [lingering, setLingering] = useState<Record<string, true>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [settings, setSettings] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onKey = useRef((e: KeyboardEvent) => void e);
  const addButton = useRef<HTMLButtonElement>(null);
  const footer = useRef<HTMLElement>(null);
  const editorArea = useRef<HTMLLIElement>(null);
  const closeEditor = useRef<(then?: (id: string) => void) => void>(() => {});
  // The phone layout has no navigation, so it always shows the Inbox.
  const view: View = phone ? 'inbox' : selectedView;
  const live = Object.values(state.tasks).filter((t) => !t.deleted);
  const tasks = live
    .filter((t) =>
      view === 'trash'
        ? t.trashed
        : !t.trashed &&
          (t.id === editing ||
            (view === 'logbook'
              ? t.completed && !lingering[t.id]
              : phone || !t.completed || lingering[t.id])),
    )
    .sort(
      view === 'inbox'
        ? (a, b) => b.created - a.created || a.id.localeCompare(b.id)
        : view === 'logbook'
          ? (a, b) => completedTime(b) - completedTime(a)
          : (a, b) => b.trashedAt - a.trashedAt,
    );
  const groups: { key: string; label: string; tasks: Task[] }[] = [];
  for (const task of tasks) {
    const key =
      view === 'logbook' ? new Date(completedTime(task)).toDateString() : view;
    if (groups.at(-1)?.key !== key)
      groups.push({
        key,
        label: view === 'logbook' ? dayName(completedTime(task), false) : '',
        tasks: [],
      });
    groups.at(-1)!.tasks.push(task);
  }
  const count = live.filter(
    (t) => !t.trashed && !t.completed && t.title.trim(),
  ).length;
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
      if (target.closest('input, textarea, .storage-panel')) return;
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
    // Completed to-dos stay briefly in the Inbox before moving to the Logbook.
    const linger = completed && view === 'inbox' && !task.trashed;
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
    setSelectedView('inbox');
    const id = await store.add();
    if (store.getSnapshot().state.tasks[id]) setEditing(id);
  }
  const ViewIcon = viewIcons[view];
  const menuTask = menu && tasks.find((t) => t.id === menu.id);
  return (
    <div className={`inbox-app${editing ? ' is-editing' : ''}`}>
      <aside className="sidebar" aria-label="Lists">
        {(['inbox', 'logbook', 'trash'] as const).map((v) => {
          const Icon = viewIcons[v];
          return (
            <button
              key={v}
              className="sidebar-item"
              aria-current={view === v ? 'page' : undefined}
              onClick={() => showView(v)}
            >
              <Icon />
              <span className="sidebar-title">{titles[v]}</span>
              {v === 'inbox' && count > 0 && (
                <span
                  className="sidebar-count"
                  aria-label={`${count} incomplete tasks`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </aside>
      <main className={`inbox-main view-${view}`}>
        <header className="inbox-header">
          <ViewIcon />
          <h1>{titles[view]}</h1>
          <button
            className="settings-toggle"
            aria-label="Storage settings"
            onClick={() => setSettings(!settings)}
          >
            ···
          </button>
        </header>
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
                aria-label={group.label || `${titles[view]} tasks`}
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
                          {task.title || 'New To-Do'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {tasks.length === 0 && (
            <div className="empty-state">
              <InboxIcon empty />
              <span>{ready ? empties[view] : 'Loading tasks…'}</span>
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
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

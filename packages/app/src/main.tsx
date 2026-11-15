import {
  StrictMode,
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

function InboxIcon({ empty = false }: { empty?: boolean }) {
  return (
    <svg
      className={`inbox-icon${empty ? ' empty-icon' : ''}`}
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
function Check({ task }: { task: Task }) {
  return (
    <button
      className="task-check"
      type="button"
      aria-label={`${task.completed ? 'Mark as not completed' : 'Mark as completed'}: ${task.title || 'New to-do'}`}
      aria-pressed={task.completed}
      onClick={() => void store.update(task.id, { completed: !task.completed })}
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
function Editor({ task, close }: { task: Task; close: () => void }) {
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
        <Check task={task} />
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
function App() {
  const { state, ready, error, syncStatus, folder } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const editorArea = useRef<HTMLLIElement>(null);
  const closeEditor = useRef(() => {});
  const tasks = Object.values(state.tasks)
    .filter((t) => !t.deleted)
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
  const count = tasks.filter((t) => !t.completed && t.title.trim()).length;
  useLayoutEffect(() => {
    closeEditor.current = () => {
      // Unmount flushes the editor's draft before this cleanup is queued.
      const id = editing;
      setEditing(null);
      setTimeout(() => {
        if (id) {
          const t = store.getSnapshot().state.tasks[id];
          if (t && !t.title.trim()) void store.update(id, { deleted: true });
        }
        addButton.current?.focus();
      }, 0);
    };
  }, [editing]);
  useEffect(() => {
    void store.start().then(store.sync);
    const interval = setInterval(() => void store.sync(), 10000);
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
        window.innerWidth >= 700 &&
        e.target instanceof Node &&
        !editorArea.current?.contains(e.target)
      )
        closeEditor.current();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [editing]);
  async function addTask() {
    const id = await store.add();
    if (store.getSnapshot().state.tasks[id]) setEditing(id);
  }
  return (
    <div className={`inbox-app${editing ? ' is-editing' : ''}`}>
      <aside className="sidebar" aria-label="Inbox navigation">
        <div className="sidebar-inbox" aria-current="page">
          <InboxIcon />
          <span className="sidebar-title">Inbox</span>
          {count > 0 && (
            <span
              className="sidebar-count"
              aria-label={`${count} incomplete tasks`}
            >
              {count}
            </span>
          )}
        </div>
      </aside>
      <main className="inbox-main">
        <header className="inbox-header">
          <InboxIcon />
          <h1>Inbox</h1>
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
          <ul className="task-list" aria-label="Inbox tasks">
            {tasks.map((task) => (
              <li
                key={task.id}
                ref={editing === task.id ? editorArea : undefined}
                className={`task-item${task.completed ? ' task-row--completed' : ''}${editing === task.id ? ' task-item--editing' : ''}`}
              >
                {editing === task.id ? (
                  <Editor task={task} close={() => closeEditor.current()} />
                ) : (
                  <div className="task-row">
                    <Check task={task} />
                    <button
                      className="task-title"
                      onClick={() => {
                        if (editing) closeEditor.current();
                        setEditing(task.id);
                      }}
                    >
                      {task.title || 'New To-Do'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {tasks.length === 0 && (
            <div className="empty-state">
              <InboxIcon empty />
              <span>{ready ? 'Inbox is empty' : 'Loading tasks…'}</span>
            </div>
          )}
        </div>
        <div className="bottom-fade" aria-hidden="true" />
        <footer className="inbox-footer">
          {!editing && (
            <button
              ref={addButton}
              className="add-button"
              disabled={!ready}
              aria-label="New to-do"
              onClick={() => void addTask()}
            >
              <Plus />
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

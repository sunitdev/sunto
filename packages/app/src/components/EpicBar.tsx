import { Fragment, useCallback, useState } from 'react';
import * as store from '../storage/store';
import { confirmAction } from '../feedback';
import type { Task } from '../storage/model';
import type { Library } from '../storage/selectors';
import { taskDropTarget } from '../drag';
import { useDraft } from '../hooks/useDraft';
import { usePhone } from '../hooks/usePhone';
import { epicStyle } from '../views';
import { ContextMenu } from './ContextMenu';
import { EpicDot, MoreIcon, Plus } from './icons';

const colorNames = ['Red', 'Orange', 'Green', 'Blue', 'Purple', 'Pink'];

// A project's epics as chips that filter its to-dos to one epic, each with
// its count of completed to-dos. Double-click renames an epic, right-click
// sets its colour or deletes it, and dropping a to-do on one assigns it. On
// the phone, a button beside the chosen epic opens the same menu.
export function EpicBar({
  project,
  library,
  filter,
  setFilter,
}: {
  project: Task;
  library: Library;
  filter: string;
  setFilter: (epic: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [over, setOver] = useState<string | null>(null);
  const phone = usePhone();
  const closeMenu = useCallback(() => setMenu(null), []);
  const epics = library.epicsOf(project.id);
  const menuEpic = menu && epics.find((e) => e.id === menu.id);
  function remove(epic: Task) {
    const count = library.todos.filter(
      (t) => t.list === project.id && t.epic === epic.id && !t.trashed,
    ).length;
    confirmAction({
      title: `Delete “${epic.title || 'New Epic'}”?`,
      body: `${
        count === 0
          ? 'No to-dos are in this epic.'
          : `Its ${count === 1 ? 'to-do stays' : `${count} to-dos stay`} in the project, without an epic.`
      } The epic itself can’t be restored.`,
      action: 'Delete Epic',
      run: () => {
        if (filter === epic.id) setFilter('');
        void store.deleteEpic(epic.id);
      },
    });
  }
  return (
    <div className="epic-bar" role="group" aria-label="Epics">
      <button
        className="epic-chip epic-all"
        aria-pressed={!filter}
        title="Show all to-dos"
        onClick={() => setFilter('')}
      >
        All
      </button>
      {epics.map((epic) => {
        const tasks = library.todos.filter(
          (t) => t.list === project.id && t.epic === epic.id && !t.trashed,
        );
        const on = filter === epic.id;
        // A new epic starts untitled, ready to be named.
        return renaming === epic.id || !epic.title ? (
          <EpicName key={epic.id} epic={epic} done={() => setRenaming(null)} />
        ) : (
          <Fragment key={epic.id}>
            <button
              className={`epic-chip${over === epic.id ? ' is-drop' : ''}`}
              style={epicStyle(epic)}
              aria-pressed={on}
              title="Click to filter. Double-click to rename. Right-click for colour and delete."
              onClick={() => setFilter(on ? '' : epic.id)}
              onDoubleClick={() => setRenaming(epic.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ id: epic.id, x: e.clientX, y: e.clientY });
              }}
              {...taskDropTarget(
                (hover) =>
                  setOver((current) =>
                    hover ? epic.id : current === epic.id ? null : current,
                  ),
                (id) => {
                  if (store.getSnapshot().state.tasks[id]?.list === project.id)
                    void store.update(id, { epic: epic.id });
                },
              )}
            >
              <EpicDot color={epic.color} />
              <span>{epic.title}</span>
              <span className="epic-progress">
                {tasks.filter((t) => t.completed).length}/{tasks.length}
              </span>
            </button>
            {phone && on && (
              <button
                className="epic-more"
                aria-label="Epic options"
                aria-haspopup="true"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({ id: epic.id, x: r.left, y: r.bottom + 4 });
                }}
              >
                <MoreIcon />
              </button>
            )}
          </Fragment>
        );
      })}
      <button
        className="epic-add"
        onClick={() => void store.addEpic(project.id)}
      >
        <Plus />
        Epic
      </button>
      {menuEpic && menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={[
            { label: 'Rename', action: () => setRenaming(menuEpic.id) },
            'divider',
            { heading: 'Colour' },
            ...store.epicColors.map((color, i) => ({
              label: colorNames[i],
              dot: color,
              checked: menuEpic.color === color,
              action: () => void store.update(menuEpic.id, { color }),
            })),
            'divider',
            {
              label: 'Delete Epic…',
              danger: true,
              action: () => remove(menuEpic),
            },
          ]}
        />
      )}
    </div>
  );
}
// An epic's name being edited; Enter or Escape finishes, and an epic left
// without a name is called New Epic.
function EpicName({ epic, done }: { epic: Task; done: () => void }) {
  const { draft, latest, change, flush } = useDraft(epic);
  return (
    <input
      className="epic-name"
      style={epicStyle(epic)}
      autoFocus
      aria-label="Epic name"
      placeholder="Epic name"
      size={Math.max(draft.title.length + 1, 8)}
      value={draft.title}
      onChange={(e) => change('title', e.target.value)}
      onKeyDown={(e) => {
        if (
          !e.nativeEvent.isComposing &&
          (e.key === 'Enter' || e.key === 'Escape')
        ) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        flush();
        if (!latest.current.title.trim())
          void store.update(epic.id, { title: 'New Epic' });
        done();
      }}
    />
  );
}

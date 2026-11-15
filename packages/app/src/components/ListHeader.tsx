import { useCallback, useState, type ReactNode } from 'react';
import * as store from '../storage/store';
import type { Task } from '../storage/model';
import { useDraft } from '../hooks/useDraft';
import { untitled } from '../views';
import { ContextMenu } from './ContextMenu';
import { EmojiPicker } from './EmojiPicker';
import { ListIcon, MoreIcon } from './icons';

// A project or area's icon, name and notes. A project also has actions:
// showing it as a list or a board, adding a section, and deleting it.
export function ListHeader({
  list,
  progress,
  addSection,
  deleteProject,
  children,
}: {
  list: Task;
  progress: number;
  addSection: () => void;
  deleteProject: () => void;
  children: ReactNode;
}) {
  const { draft, change } = useDraft(list);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const closePicker = useCallback(() => setPicker(null), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  function setIcon(icon: string) {
    if (icon !== list.icon) void store.update(list.id, { icon });
  }
  function setKanban(kanban: boolean) {
    if (kanban !== list.kanban) void store.update(list.id, { kanban });
  }
  return (
    <>
      <header className="inbox-header list-header">
        <button
          className="icon-button"
          aria-label="Change icon"
          title="Change icon"
          aria-haspopup="dialog"
          onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())}
        >
          <ListIcon list={list} progress={progress} />
        </button>
        <input
          className="list-title"
          // A new list starts untitled, ready to be named.
          autoFocus={!list.title}
          aria-label={list.kind === 'area' ? 'Area name' : 'Project name'}
          placeholder={untitled(list)}
          size={Math.max((draft.title || untitled(list)).length + 1, 4)}
          value={draft.title}
          onChange={(e) => change('title', e.target.value)}
        />
        {list.kind === 'project' && (
          <button
            className="list-actions"
            aria-label="Project actions"
            title="Project actions"
            aria-haspopup="true"
            aria-expanded={!!menu}
            onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
          >
            <MoreIcon />
          </button>
        )}
        {children}
      </header>
      <textarea
        className="list-notes"
        aria-label="Description"
        placeholder="Notes"
        rows={2}
        value={draft.notes}
        onChange={(e) => change('notes', e.target.value)}
      />
      {picker && (
        <EmojiPicker
          anchor={picker}
          current={list.icon}
          choose={setIcon}
          close={closePicker}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.left}
          y={menu.bottom + 4}
          close={closeMenu}
          items={[
            { heading: 'View as' },
            {
              label: 'List',
              checked: !list.kanban,
              action: () => setKanban(false),
            },
            {
              label: 'Kanban',
              checked: list.kanban,
              action: () => setKanban(true),
            },
            'divider',
            { label: 'Add Section', action: addSection },
            'divider',
            { label: 'Delete Project…', danger: true, action: deleteProject },
          ]}
        />
      )}
    </>
  );
}

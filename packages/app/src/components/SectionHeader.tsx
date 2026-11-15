import { useCallback, useState } from 'react';
import * as store from '../storage/store';
import type { Task } from '../storage/model';
import { useDraft } from '../hooks/useDraft';
import { ContextMenu } from './ContextMenu';
import { EmojiPicker } from './EmojiPicker';
import { MoreIcon, Plus } from './icons';

// A project section's icon, editable name and actions. On a board it also
// shows the count of open to-dos and a button adding one at the top.
export function SectionHeader({
  section,
  count,
  addTask,
}: {
  section: Task;
  count?: number;
  addTask: (section: string) => void;
}) {
  const { draft, change } = useDraft(section);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closePicker = useCallback(() => setPicker(null), []);
  function setIcon(icon: string) {
    if (icon !== section.icon) void store.update(section.id, { icon });
  }
  return (
    <div className="section-header">
      {section.icon && (
        <button
          className="section-icon"
          aria-label="Change section icon"
          onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())}
        >
          {section.icon}
        </button>
      )}
      <input
        className="section-title"
        // A new section starts untitled, ready to be named.
        autoFocus={!section.title}
        aria-label="Section name"
        placeholder="New Section"
        size={Math.max((draft.title || 'New Section').length + 1, 3)}
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
      />
      {count !== undefined && (
        <>
          <span className="section-count">{count}</span>
          <button
            className="section-button"
            aria-label="New to-do at top"
            title="New To-Do"
            onClick={() => addTask(section.id)}
          >
            <Plus />
          </button>
        </>
      )}
      <button
        className="section-button"
        aria-label="Section actions"
        title="Section actions"
        aria-haspopup="true"
        aria-expanded={!!menu}
        onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
      >
        <MoreIcon />
      </button>
      {menu && (
        <ContextMenu
          x={menu.left}
          y={menu.bottom + 4}
          close={closeMenu}
          items={[
            { label: 'Add To-Do', action: () => addTask(section.id) },
            {
              label: section.icon ? 'Change Icon…' : 'Add Icon…',
              action: () => setPicker(menu),
            },
            'divider',
            {
              label: 'Delete Section',
              danger: true,
              action: () => void store.deleteSection(section.id),
            },
          ]}
        />
      )}
      {picker && (
        <EmojiPicker
          anchor={picker}
          current={section.icon}
          choose={setIcon}
          close={closePicker}
        />
      )}
    </div>
  );
}

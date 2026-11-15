import { useCallback, useRef, useState, type ReactNode } from 'react';
import * as store from '../storage/store';
import type { Task } from '../storage/model';
import { canShowEmojiPanel, showEmojiPanel } from '../platform';
import { useDraft } from '../hooks/useDraft';
import { untitled } from '../views';
import { ContextMenu } from './ContextMenu';
import { ListIcon } from './icons';

// The last emoji in `value`, including flags, keycaps and skin tones.
function lastEmoji(value: string) {
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segments.segment(value)]
    .map((s) => s.segment)
    .filter((g) =>
      /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(g),
    )
    .at(-1);
}
export function ListHeader({
  list,
  progress,
  children,
}: {
  list: Task;
  progress: number;
  children: ReactNode;
}) {
  const { draft, change } = useDraft(list);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const button = useRef<HTMLButtonElement>(null);
  const emojiField = useRef<HTMLInputElement>(null);
  function setIcon(icon: string) {
    if (icon !== list.icon) void store.update(list.id, { icon });
  }
  return (
    <>
      <header className="inbox-header list-header">
        <div className="icon-anchor">
          <button
            ref={button}
            className="icon-button"
            aria-label="Change icon"
            title={
              canShowEmojiPanel
                ? 'Change icon'
                : 'Change icon (press Control-Command-Space)'
            }
            onClick={() => {
              emojiField.current?.focus();
              showEmojiPanel();
            }}
            onContextMenu={(e) => {
              if (!list.icon) return;
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            <ListIcon list={list} progress={progress} />
          </button>
          {/* The system emoji picker types into this field, which sits over
              the icon so the picker opens beside it. Moving focus away as
              the emoji arrived left the picker open, so the field keeps
              focus and its text until it is focused again. */}
          <input
            ref={emojiField}
            className="emoji-field"
            tabIndex={-1}
            aria-label="Icon emoji"
            onFocus={(e) => (e.currentTarget.value = '')}
            onChange={(e) => {
              const emoji = lastEmoji(e.target.value);
              if (emoji) setIcon(emoji);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                setIcon('');
              } else if (e.key === 'Escape' || e.key === 'Enter')
                button.current?.focus();
            }}
          />
        </div>
        <input
          className="list-title"
          // A new list starts untitled, ready to be named.
          autoFocus={!list.title}
          aria-label={list.kind === 'area' ? 'Area name' : 'Project name'}
          placeholder={untitled(list)}
          value={draft.title}
          onChange={(e) => change('title', e.target.value)}
        />
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
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={[{ label: 'Remove Icon', action: () => setIcon('') }]}
        />
      )}
    </>
  );
}

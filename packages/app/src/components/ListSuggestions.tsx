import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Task } from '../storage/model';
import type { Library } from '../storage/selectors';
import { ListIcon, ToolbarIcon, TrayIcon } from './icons';

// A list a "#" in a new to-do's title can name, or a section a "/" can; the
// Inbox has neither `list` nor `section`.
export type Choice = { id: string; title: string; list?: Task; section?: Task };

// The lists or sections a "#" or "/" being typed in `field` could name,
// under it or above it when there is no room. Pressing a row picks it
// without taking focus from the field, which handles the keys.
export function ListSuggestions({
  id,
  label,
  field,
  choices,
  active,
  library,
  setActive,
  pick,
}: {
  id: string;
  label: string;
  field: RefObject<HTMLElement | null>;
  choices: Choice[];
  active: number;
  library: Library;
  setActive: (i: number) => void;
  pick: (choice: Choice) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current!;
    const place = () => {
      const r = field.current!.getBoundingClientRect();
      const bottom = visualViewport?.height ?? innerHeight;
      const below = r.bottom + 4;
      el.style.left = `${Math.max(8, Math.min(r.left - 14, innerWidth - el.offsetWidth - 8))}px`;
      el.style.top = `${below + el.offsetHeight <= bottom - 8 ? below : Math.max(8, r.top - el.offsetHeight - 4)}px`;
    };
    place();
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  });
  useLayoutEffect(() => {
    root.current!.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const { lists, areaOf, progress } = library;
  return (
    <div
      ref={root}
      id={id}
      className="list-suggestions move-rows"
      role="listbox"
      aria-label={label}
    >
      {choices.map((c, i) => {
        const area = c.list && lists[areaOf(c.list)];
        return (
          <button
            key={c.id || 'inbox'}
            id={`${id}-${i}`}
            className={`move-row${i === active ? ' is-active' : ''}`}
            role="option"
            aria-selected={i === active}
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onPointerMove={() => i !== active && setActive(i)}
            onClick={() => pick(c)}
          >
            {c.section ? (
              <span className="suggestion-section" aria-hidden="true">
                {c.section.icon || <ToolbarIcon d="M5 7h14M5 12h14M5 17h9" />}
              </span>
            ) : c.list ? (
              <ListIcon list={c.list} progress={progress(c.id)} />
            ) : (
              <TrayIcon />
            )}
            <span className="move-label">
              <span>{c.title}</span>
              {c.list?.kind === 'area' ? (
                <span className="move-sub">Area</span>
              ) : (
                area && (
                  <span className="move-sub">{area.title || 'New Area'}</span>
                )
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

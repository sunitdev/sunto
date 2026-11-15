import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as store from '../storage/store';
import { phoneQuery } from './usePhone';

// The to-do being edited. Closing the editor deletes a to-do left without a
// title and returns focus to the add button; `then` receives the closed
// to-do's id. On desktop, a press outside the editor, footer and popovers
// (such as the list picker the editor opens) closes it.
export function useEditor() {
  const [editing, setEditing] = useState<string | null>(null);
  const editorArea = useRef<HTMLLIElement>(null);
  const footer = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const close = useRef<(then?: (id: string) => void) => void>(() => {});
  useLayoutEffect(() => {
    close.current = (then) => {
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
    if (!editing) return;
    const outside = (e: PointerEvent) => {
      if (
        !phoneQuery.matches &&
        e.target instanceof Node &&
        !editorArea.current?.contains(e.target) &&
        !footer.current?.contains(e.target) &&
        !(e.target instanceof Element && e.target.closest('.popover'))
      )
        close.current();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [editing]);
  const closeEditor = useCallback(
    (then?: (id: string) => void) => close.current(then),
    [],
  );
  return { editing, setEditing, closeEditor, editorArea, footer, addButton };
}

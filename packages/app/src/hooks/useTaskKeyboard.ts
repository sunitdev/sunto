import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Task } from '../storage/model';
import { phoneQuery } from './usePhone';

// Desktop keyboard control of the selected to-do: arrow keys move the
// selection through `tasks`, Backspace/Delete removes the to-do, Enter edits
// it and Escape clears the selection. Keys are ignored while `paused`.
// Clicking anywhere other than a to-do or its menu also clears the selection,
// and keyboard focus follows it.
export function useTaskKeyboard({
  tasks,
  selected,
  select,
  paused,
  remove,
  edit,
}: {
  tasks: Task[];
  selected: string | null;
  select: (id: string | null) => void;
  paused: boolean;
  remove: (task: Task) => void;
  edit: (id: string) => void;
}) {
  const onKey = useRef((e: KeyboardEvent) => void e);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => onKey.current(e);
    const deselect = (e: PointerEvent) => {
      if (
        e.target instanceof Element &&
        !e.target.closest('.task-row, .context-menu')
      )
        select(null);
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', deselect);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', deselect);
    };
  }, [select]);
  useEffect(() => {
    // E.g. after deleting a to-do, focus moves to the newly selected one.
    const active = document.activeElement;
    if (
      selected &&
      (active === document.body || active?.classList.contains('task-title'))
    )
      document
        .querySelector<HTMLElement>(`[data-task="${selected}"] .task-title`)
        ?.focus();
  }, [selected]);
  useLayoutEffect(() => {
    onKey.current = (e) => {
      if (phoneQuery.matches || paused || e.isComposing) return;
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
        select(tasks[next].id);
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
        edit(tasks[i].id);
      } else if (e.key === 'Escape') select(null);
    };
  });
}

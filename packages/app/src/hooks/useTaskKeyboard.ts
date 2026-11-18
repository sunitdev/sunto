import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Task } from '../storage/model';
import { phoneQuery } from './usePhone';

// Desktop keyboard control of the selected to-do: arrow keys move the
// selection through `tasks`, Backspace/Delete removes the to-do, Enter edits
// it and Escape clears the selection. Shift with an arrow key picks the
// to-dos from the selected one to the next, and Cmd+A picks them all; then
// Backspace/Delete removes every picked to-do. Keys are ignored while
// `paused`. Clicking anywhere other than a to-do, its menu or a popover also
// clears the selection, and keyboard focus follows it.
export function useTaskKeyboard({
  tasks,
  selected,
  picked,
  select,
  pick,
  paused,
  remove,
  removeAll,
  edit,
}: {
  tasks: Task[];
  selected: string | null;
  picked: Task[];
  select: (id: string | null) => void;
  pick: (ids: string[]) => void;
  paused: boolean;
  remove: (task: Task) => void;
  removeAll: (tasks: Task[]) => void;
  edit: (id: string) => void;
}) {
  const onKey = useRef((e: KeyboardEvent) => void e);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => onKey.current(e);
    // The phone shows no selection, but keeps the to-dos being picked.
    const deselect = (e: PointerEvent) => {
      if (
        !phoneQuery.matches &&
        e.target instanceof Element &&
        !e.target.closest(
          '.task-row, .context-menu, .popover, .dialog, .bulk-actions',
        )
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
          'input, textarea, .settings, .popover, .dialog, .context-menu',
        )
      )
        return;
      const i = tasks.findIndex((t) => t.id === selected);
      if (
        e.key.toLowerCase() === 'a' &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey
      ) {
        if (!tasks.length) return;
        e.preventDefault();
        if (i < 0) select(tasks[0].id);
        pick(tasks.map((t) => t.id));
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!tasks.length) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        if (e.shiftKey && i >= 0) {
          // The picked to-dos run from the selected one to their far end,
          // which moves a step.
          const ends = picked.map((t) => tasks.indexOf(t));
          const far =
            ends.length < 2
              ? i
              : Math.abs(Math.min(...ends) - i) >
                  Math.abs(Math.max(...ends) - i)
                ? Math.min(...ends)
                : Math.max(...ends);
          const next = Math.max(0, Math.min(tasks.length - 1, far + step));
          pick(
            tasks
              .slice(Math.min(i, next), Math.max(i, next) + 1)
              .map((t) => t.id),
          );
          document
            .querySelector(`[data-task="${tasks[next].id}"]`)
            ?.scrollIntoView({ block: 'nearest' });
          return;
        }
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
        if (picked.length > 1) removeAll(picked);
        else remove(tasks[i]);
      } else if (picked.length > 1 && e.key !== 'Escape') {
        return;
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

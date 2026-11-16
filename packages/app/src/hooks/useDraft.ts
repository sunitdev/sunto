import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as store from '../storage/store';
import type { Fields, Task } from '../storage/model';

// Title and notes edits are saved after a pause, and flushed on unmount or
// when the page is hidden. On unmount, `finish` can turn the title into a
// new title and other fields.
export function useDraft(
  task: Task,
  finish?: (title: string) => Partial<Fields> | undefined,
) {
  const [draft, setDraft] = useState({ title: task.title, notes: task.notes });
  const latest = useRef(draft);
  const saved = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useRef<(closing?: boolean) => void>(() => {});
  const finisher = useRef(finish);
  useLayoutEffect(() => {
    finisher.current = finish;
  });
  useLayoutEffect(() => {
    flush.current = (closing = false) => {
      clearTimeout(timer.current);
      const patch: Partial<Fields> =
        (closing && finisher.current?.(latest.current.title)) || {};
      if (patch.title !== undefined)
        latest.current = { ...latest.current, title: patch.title };
      if (latest.current.title !== saved.current.title)
        patch.title = latest.current.title;
      else delete patch.title;
      if (latest.current.notes !== saved.current.notes)
        patch.notes = latest.current.notes;
      if (Object.keys(patch).length) {
        saved.current = latest.current;
        void store.update(task.id, patch);
      }
    };
  }, [task.id]);
  useEffect(() => {
    const save = () => flush.current();
    const close = () => flush.current(true);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      close();
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, []);
  function change(key: 'title' | 'notes', value: string) {
    latest.current = { ...latest.current, [key]: value };
    setDraft(latest.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), 250);
  }
  return { draft, latest, change, flush: () => flush.current() };
}

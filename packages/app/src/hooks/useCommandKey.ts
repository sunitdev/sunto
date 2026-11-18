import { useEffect, useLayoutEffect, useRef } from 'react';
import { getConfirmation } from '../feedback';
import { phoneQuery } from './usePhone';

// Desktop Cmd+`key` (Ctrl+`key` elsewhere) calls `run`, also while a to-do is
// being edited. Ignored while `paused` or a confirmation is open.
export function useCommandKey(key: string, run: () => void, paused: boolean) {
  const onKey = useRef((e: KeyboardEvent) => void e);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => onKey.current(e);
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  useLayoutEffect(() => {
    onKey.current = (e) => {
      if (
        e.key.toLowerCase() !== key ||
        !(e.metaKey || e.ctrlKey) ||
        e.shiftKey ||
        e.altKey ||
        e.isComposing ||
        e.repeat
      )
        return;
      e.preventDefault();
      if (phoneQuery.matches || paused || getConfirmation()) return;
      run();
    };
  });
}

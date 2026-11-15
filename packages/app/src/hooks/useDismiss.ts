import { useEffect, type RefObject } from 'react';

// Closes a popover on Escape or a pointer press outside `ref`.
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target)))
        close();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [ref, open, close]);
}

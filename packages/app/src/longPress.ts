import type { MouseEvent, PointerEvent } from 'react';

// Touch has no right-click, so holding a finger still on an element opens
// its menu instead, at the finger. The tap that ends the hold does nothing
// else. Only one hold can be under way, so its state is shared.
let timer = 0;
let start: { x: number; y: number } | null = null;
let held = false;
function cancel() {
  clearTimeout(timer);
  start = null;
}
export function longPress(open: (x: number, y: number) => void) {
  return {
    onPointerDown: (e: PointerEvent) => {
      held = false;
      cancel();
      if (e.pointerType !== 'touch') return;
      const { clientX: x, clientY: y } = e;
      start = { x, y };
      timer = window.setTimeout(() => {
        start = null;
        held = true;
        open(x, y);
      }, 500);
    },
    // Scrolling or dragging the finger away is not a hold.
    onPointerMove: (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10)
        cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (e: MouseEvent) => {
      if (!held) return;
      held = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

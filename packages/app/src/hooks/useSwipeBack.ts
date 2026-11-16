import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { getConfirmation } from '../feedback';
import { phoneQuery } from './usePhone';

const settle = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
// How far the screen underneath sits to the left until uncovered.
const parallax = 0.3;

// On the phone, swiping to the right goes back, like the back button: the
// screen follows the finger, uncovering `under()` (the previous screen) as
// it goes. Letting go past a third of the way, or with a flick, finishes and
// calls `back`; otherwise the screen slides back into place. Ignored while
// `paused` or a sheet or confirmation is open. A swipe that would scroll
// something to the left, such as a board, scrolls it instead, and one in a
// text field moves its text, unless it starts at the screen's edge.
export function useSwipeBack(
  back: () => void,
  under: () => HTMLElement | null,
  paused: boolean,
) {
  const latest = useRef({ back, under, paused });
  useLayoutEffect(() => {
    latest.current = { back, under, paused };
  });
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    // Set once the touch is known to be a swipe back.
    let swipe: {
      main: HTMLElement;
      below: HTMLElement | null;
      dx: number;
      // The last move, to tell a flick.
      x: number;
      time: number;
      speed: number;
    } | null = null;
    let busy = false;
    const width = () => innerWidth;
    function place(
      { main, below }: { main: HTMLElement; below: HTMLElement | null },
      dx: number,
      transition = '',
    ) {
      main.style.transition = transition;
      main.style.transform = `translateX(${dx}px)`;
      if (below) {
        below.style.transition = transition;
        below.style.transform = `translateX(${(dx / width() - 1) * parallax * 100}%)`;
      }
    }
    function begin(main: HTMLElement) {
      const below = latest.current.under();
      if (below) {
        below.classList.add('swipe-under');
        below.inert = true;
        if (!below.isConnected) main.before(below);
      }
      main.parentElement?.classList.add('is-swiping');
      return below;
    }
    function finish(done: boolean) {
      const current = swipe;
      swipe = null;
      if (!current) return;
      busy = true;
      const { main, below } = current;
      const end = () => {
        if (done) flushSync(() => latest.current.back());
        main.style.transition = main.style.transform = '';
        main.parentElement?.classList.remove('is-swiping');
        if (below) {
          below.style.transition = below.style.transform = '';
          below.inert = false;
          below.classList.remove('swipe-under');
          // A copy of the previous screen goes; the lists stay.
          if (!below.classList.contains('sidebar')) below.remove();
        }
        busy = false;
      };
      place(current, done ? width() : 0, settle);
      setTimeout(end, 250);
    }
    const touchstart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const { paused } = latest.current;
      start =
        e.touches.length === 1 &&
        !busy &&
        !paused &&
        phoneQuery.matches &&
        !getConfirmation() &&
        !blocked(e, touch)
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    };
    const touchmove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (swipe) {
        e.preventDefault();
        const dx = Math.max(0, touch.clientX - start!.x);
        const time = e.timeStamp;
        swipe.speed =
          (touch.clientX - swipe.x) / Math.max(1, time - swipe.time);
        swipe.x = touch.clientX;
        swipe.time = time;
        swipe.dx = dx;
        place(swipe, dx);
        return;
      }
      if (!start) return;
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      if (Math.abs(dx) < 10 && dy < 10) return;
      // Only a mostly sideways move to the right is a swipe back.
      const main = document.querySelector<HTMLElement>('.inbox-main');
      if (dx <= 0 || dy > dx / 2 || !main) {
        start = null;
        return;
      }
      e.preventDefault();
      swipe = {
        main,
        below: begin(main),
        dx: 0,
        x: touch.clientX,
        time: e.timeStamp,
        speed: 0,
      };
    };
    const touchend = () => {
      start = null;
      if (swipe)
        finish(swipe.dx > width() / 3 || (swipe.speed > 0.4 && swipe.dx > 30));
    };
    document.addEventListener('touchstart', touchstart, { passive: true });
    document.addEventListener('touchmove', touchmove, { passive: false });
    document.addEventListener('touchend', touchend, { passive: true });
    document.addEventListener('touchcancel', touchend, { passive: true });
    return () => {
      document.removeEventListener('touchstart', touchstart);
      document.removeEventListener('touchmove', touchmove);
      document.removeEventListener('touchend', touchend);
      document.removeEventListener('touchcancel', touchend);
    };
  }, []);
}
function blocked(e: TouchEvent, touch: Touch) {
  if (document.querySelector('.popover, .context-menu, .dialog, .welcome'))
    return true;
  if (touch.clientX < 24) return false;
  for (
    let el = e.target instanceof Element ? e.target : null;
    el;
    el = el.parentElement
  )
    if (el.scrollLeft > 0 || el.matches('input, textarea')) return true;
  return false;
}

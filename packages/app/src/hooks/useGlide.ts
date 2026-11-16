import { useLayoutEffect, useRef, type RefObject } from 'react';

// The to-dos and group headings that glide, and the name each keeps when it
// moves to another group.
const movers = '[data-task], [data-group] > h2';
const nameOf = (el: HTMLElement) =>
  el.dataset.task ?? `group:${el.parentElement?.dataset.group}`;
// Where `el` sits in `root`, which must be positioned, ignoring transforms
// and scrolling.
function topOf(el: HTMLElement, root: HTMLElement) {
  let top = 0;
  for (
    let at: Element | null = el;
    at instanceof HTMLElement && at !== root;
    at = at.offsetParent
  )
    top += at.offsetTop;
  return top;
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// While `on`, glides the to-dos and group headings in `root` from where they
// were to where they are whenever their order changes, after a moment for a
// tick to show, and fades in new ones. A glide interrupted by another change
// carries on from where it got to.
export function useGlide(root: RefObject<HTMLElement | null>, on: boolean) {
  const last = useRef(new Map<string, number>());
  const glides = useRef(new WeakMap<HTMLElement, Animation>());
  useLayoutEffect(() => {
    const box = root.current;
    const before = last.current;
    if (!on || !box) {
      last.current = new Map();
      return;
    }
    const els = [...box.querySelectorAll<HTMLElement>(movers)];
    const now = new Map(els.map((el) => [nameOf(el), topOf(el, box)]));
    last.current = now;
    if (
      !before.size ||
      reduced.matches ||
      [...before.keys()].join() === [...now.keys()].join()
    )
      return;
    const easing = getComputedStyle(box).getPropertyValue('--ease-out');
    for (const el of els) {
      const name = nameOf(el);
      const was = before.get(name);
      const running = glides.current.get(el);
      // How far along an interrupted glide had got.
      const partway = running
        ? new DOMMatrix(getComputedStyle(el).transform).m42
        : 0;
      running?.cancel();
      glides.current.delete(el);
      if (was === undefined) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 320,
          easing: 'ease',
        });
        continue;
      }
      const shift = was - now.get(name)! + partway;
      if (Math.abs(shift) < 1) continue;
      const glide = el.animate(
        [{ transform: `translateY(${shift}px)` }, { transform: 'none' }],
        { duration: 700, delay: running ? 0 : 220, easing, fill: 'backwards' },
      );
      glides.current.set(el, glide);
      glide.onfinish = () => glides.current.delete(el);
    }
  });
}

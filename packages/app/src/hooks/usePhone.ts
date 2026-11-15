import { useSyncExternalStore } from 'react';

export const phoneQuery = matchMedia('(width < 700px)');
function subscribe(listener: () => void) {
  phoneQuery.addEventListener('change', listener);
  return () => phoneQuery.removeEventListener('change', listener);
}
export const usePhone = () =>
  useSyncExternalStore(subscribe, () => phoneQuery.matches);

// Places a popover or menu at `left`, `top`. On the phone it is a sheet along
// the bottom of the screen instead, which the stylesheet places.
export function place(el: HTMLElement, left: number, top: number) {
  if (phoneQuery.matches) return;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

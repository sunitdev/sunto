import { useSyncExternalStore } from 'react';

export const phoneQuery = matchMedia('(width < 700px)');
function subscribe(listener: () => void) {
  phoneQuery.addEventListener('change', listener);
  return () => phoneQuery.removeEventListener('change', listener);
}
export const usePhone = () =>
  useSyncExternalStore(subscribe, () => phoneQuery.matches);

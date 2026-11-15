import { useState } from 'react';

// How many to-dos a day's goal aims for, remembered on this device.
const key = 'sunto.dailyTarget';
const defaultTarget = 5;
function load() {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : defaultTarget;
  } catch {
    return defaultTarget;
  }
}
export function useDailyTarget() {
  const [target, setTarget] = useState(load);
  function change(next: number) {
    const n = Math.max(1, Math.min(12, next));
    setTarget(n);
    try {
      localStorage.setItem(key, String(n));
    } catch {
      // Private browsing can refuse storage; the target still applies now.
    }
  }
  return [target, change] as const;
}

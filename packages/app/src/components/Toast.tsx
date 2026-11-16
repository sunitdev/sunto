import { useEffect, useState, useSyncExternalStore } from 'react';
import { dismissToast, getToast, subscribe } from '../feedback';

// How long a toast stays, and how long it takes to slide away, matching the
// stylesheet.
const showTime = 5000;
const leaveTime = 200;
// The toast that `showToast` shows, along the bottom of the main column. It
// stays while the pointer is over it, and leaves after a few seconds.
export function Toast() {
  const toast = useSyncExternalStore(subscribe, getToast);
  // The toast on screen, kept while it slides away.
  const [shown, setShown] = useState(toast);
  const [hovered, setHovered] = useState(false);
  if (toast && toast !== shown) {
    setShown(toast);
    setHovered(false);
  }
  useEffect(() => {
    if (!toast || hovered) return;
    const timer = setTimeout(() => dismissToast(toast.id), showTime);
    return () => clearTimeout(timer);
  }, [toast, hovered]);
  useEffect(() => {
    if (toast || !shown) return;
    const timer = setTimeout(() => setShown(null), leaveTime);
    return () => clearTimeout(timer);
  }, [toast, shown]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {shown && (
        <div
          key={shown.id}
          className={`toast${toast ? '' : ' is-leaving'}`}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <span className="toast-message">{shown.message}</span>
          {shown.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                shown.undo?.();
                dismissToast(shown.id);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

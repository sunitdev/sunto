import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  dismissConfirmation,
  getConfirmation,
  subscribe,
  type Confirmation,
} from '../feedback';

// How long the dialog takes to fade away, matching the stylesheet.
const closeTime = 140;
// The confirmation that `confirmAction` asks for, if any.
export function ConfirmDialog() {
  const request = useSyncExternalStore(subscribe, getConfirmation);
  return request && <Dialog request={request} />;
}
function Dialog({ request }: { request: Confirmation }) {
  const { title, body, action, run } = request;
  const [closing, setClosing] = useState(false);
  // Focus returns where it was, if that is still on screen.
  useEffect(() => {
    const before = document.activeElement;
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);
  // The action runs at once, while the dialog fades away.
  function finish(confirmed: boolean) {
    if (closing) return;
    setClosing(true);
    if (confirmed) run();
    setTimeout(dismissConfirmation, closeTime);
  }
  return (
    <div
      className={`dialog-scrim${closing ? ' is-closing' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) finish(false);
      }}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-body"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        }}
      >
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-body">{body}</p>
        <div className="dialog-actions">
          <button autoFocus onClick={() => finish(false)}>
            Cancel
          </button>
          <button className="danger-button" onClick={() => finish(true)}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

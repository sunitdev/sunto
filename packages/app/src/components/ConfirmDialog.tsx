export function ConfirmDialog({
  title,
  body,
  action,
  confirm,
  cancel,
}: {
  title: string;
  body: string;
  action: string;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <div
      className="dialog-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) cancel();
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
            cancel();
          }
        }}
      >
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-body">{body}</p>
        <div className="dialog-actions">
          <button autoFocus onClick={cancel}>
            Cancel
          </button>
          <button className="danger-button" onClick={confirm}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

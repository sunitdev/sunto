import type { RefObject } from 'react';
import * as store from '../storage/store';
import { Plus, ToolbarIcon } from './icons';

// The add button, or while editing on desktop, a button that closes the
// editor and moves the to-do to the Trash (or back out of it).
export function Footer({
  footerRef,
  addButtonRef,
  editing,
  phone,
  inTrash,
  ready,
  add,
  closeEditor,
}: {
  footerRef: RefObject<HTMLElement | null>;
  addButtonRef: RefObject<HTMLButtonElement | null>;
  editing: boolean;
  phone: boolean;
  inTrash: boolean;
  ready: boolean;
  add: () => void;
  closeEditor: (then: (id: string) => void) => void;
}) {
  return (
    <footer className="inbox-footer" ref={footerRef}>
      {!editing ? (
        <button
          ref={addButtonRef}
          className="add-button"
          disabled={!ready}
          aria-label="New to-do"
          title="New To-Do"
          onClick={add}
        >
          <Plus />
        </button>
      ) : phone ? null : inTrash ? (
        <button
          className="footer-button"
          aria-label="Put back"
          title="Put Back"
          onClick={() => closeEditor((id) => void store.setTrashed(id, false))}
        >
          <ToolbarIcon d="M4.5 12h15M13.5 6l6 6-6 6" />
        </button>
      ) : (
        <button
          className="footer-button"
          aria-label="Move to Trash"
          title="Move to Trash"
          onClick={() => closeEditor((id) => void store.setTrashed(id, true))}
        >
          <ToolbarIcon d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5L17.2 7" />
        </button>
      )}
    </footer>
  );
}

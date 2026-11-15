import type { RefObject } from 'react';
import * as store from '../storage/store';
import { Plus, ToolbarIcon } from './icons';

// The add button, and in a project, a button adding a section. While editing,
// buttons that move the to-do to another list, and that close the editor and
// move the to-do to the Trash (or back out of it); on the phone they are
// labelled, beside a button that closes the editor.
export function Footer({
  footerRef,
  addButtonRef,
  editing,
  phone,
  inTrash,
  ready,
  add,
  addSection,
  move,
  closeEditor,
}: {
  footerRef: RefObject<HTMLElement | null>;
  addButtonRef: RefObject<HTMLButtonElement | null>;
  editing: boolean;
  phone: boolean;
  inTrash: boolean;
  ready: boolean;
  add: () => void;
  addSection?: () => void;
  move: (anchor: DOMRect) => void;
  closeEditor: (then?: (id: string) => void) => void;
}) {
  return (
    <footer className="inbox-footer" ref={footerRef}>
      {!editing ? (
        <>
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
          {addSection && (
            <button
              className="footer-button"
              aria-label="New section"
              title="New Section"
              onClick={addSection}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
                <path d="M12 8.2v7.6M8.2 12h7.6" />
              </svg>
            </button>
          )}
        </>
      ) : phone ? (
        <>
          {inTrash ? (
            <button
              className="bar-button"
              onClick={() =>
                closeEditor((id) => void store.setTrashed(id, false))
              }
            >
              <ToolbarIcon d="M19.5 12h-15M10.5 6l-6 6 6 6" />
              Put Back
            </button>
          ) : (
            <>
              <button
                className="bar-button"
                aria-haspopup="dialog"
                onClick={(e) => move(e.currentTarget.getBoundingClientRect())}
              >
                <ToolbarIcon d="M4.5 12h15M13.5 6l6 6-6 6" />
                Move
              </button>
              <button
                className="bar-button bar-danger"
                onClick={() =>
                  closeEditor((id) => void store.setTrashed(id, true))
                }
              >
                <ToolbarIcon d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5L17.2 7" />
                Delete
              </button>
            </>
          )}
          <button className="bar-done" onClick={() => closeEditor()}>
            Done
          </button>
        </>
      ) : inTrash ? (
        <button
          className="footer-button"
          aria-label="Put back"
          title="Put Back"
          onClick={() => closeEditor((id) => void store.setTrashed(id, false))}
        >
          <ToolbarIcon d="M4.5 12h15M13.5 6l6 6-6 6" />
        </button>
      ) : (
        <>
          <button
            className="footer-button"
            aria-label="Move to another list"
            title="Move"
            aria-haspopup="dialog"
            onClick={(e) => move(e.currentTarget.getBoundingClientRect())}
          >
            <ToolbarIcon d="M4.5 12h15M13.5 6l6 6-6 6" />
          </button>
          <button
            className="footer-button"
            aria-label="Move to Trash"
            title="Move to Trash"
            onClick={() => closeEditor((id) => void store.setTrashed(id, true))}
          >
            <ToolbarIcon d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5L17.2 7" />
          </button>
        </>
      )}
    </footer>
  );
}

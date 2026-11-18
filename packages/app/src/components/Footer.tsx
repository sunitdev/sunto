import type { RefObject } from 'react';
import * as store from '../storage/store';
import { trashTodo } from '../feedback';
import { Plus, ToolbarIcon } from './icons';

const icons = {
  move: 'M4.5 12h15M13.5 6l6 6-6 6',
  back: 'M19.5 12h-15M10.5 6l-6 6 6 6',
  date: 'M6.5 5.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM4.5 10h15M8.5 3.5v3M15.5 3.5v3',
  trash:
    'M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5L17.2 7',
};
// What the footer offers for several picked to-dos. In the Trash they can be
// put back or deleted; elsewhere moved, given a date, where they have one to
// change, and moved to the Trash. On the phone, `done` stops picking.
export type Bulk = {
  count: number;
  done?: () => void;
  inTrash: boolean;
  move?: (anchor: DOMRect) => void;
  date?: (anchor: DOMRect) => void;
  putBack: () => void;
  remove: () => void;
};
// The add button, if given, and in a project, a button adding a section. While
// editing, buttons that move the to-do to another list, and that close the
// editor and move the to-do to the Trash (or back out of it); on the phone
// they are labelled, beside a button that closes the editor. With several
// to-dos picked, their count and what can be done with them all.
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
  bulk,
}: {
  footerRef: RefObject<HTMLElement | null>;
  addButtonRef: RefObject<HTMLButtonElement | null>;
  editing: boolean;
  phone: boolean;
  inTrash: boolean;
  ready: boolean;
  add?: () => void;
  addSection?: () => void;
  move: (anchor: DOMRect) => void;
  closeEditor: (then?: (id: string) => void) => void;
  bulk?: Bulk;
}) {
  return (
    <footer className="inbox-footer" ref={footerRef}>
      {bulk && !editing && phone ? (
        <div className="bulk-actions">
          <span className="bulk-count">{bulk.count} selected</span>
          {bulk.inTrash ? (
            <button
              className="bar-button"
              aria-label="Put back"
              disabled={!bulk.count}
              onClick={bulk.putBack}
            >
              <ToolbarIcon d={icons.back} />
            </button>
          ) : (
            <>
              {bulk.move && (
                <button
                  className="bar-button"
                  aria-label="Move"
                  aria-haspopup="dialog"
                  disabled={!bulk.count}
                  onClick={(e) =>
                    bulk.move?.(e.currentTarget.getBoundingClientRect())
                  }
                >
                  <ToolbarIcon d={icons.move} />
                </button>
              )}
              {bulk.date && (
                <button
                  className="bar-button"
                  aria-label="Date"
                  aria-haspopup="dialog"
                  disabled={!bulk.count}
                  onClick={(e) =>
                    bulk.date?.(e.currentTarget.getBoundingClientRect())
                  }
                >
                  <ToolbarIcon d={icons.date} />
                </button>
              )}
            </>
          )}
          <button
            className="bar-button bar-danger"
            aria-label={bulk.inTrash ? 'Delete immediately' : 'Delete'}
            disabled={!bulk.count}
            onClick={bulk.remove}
          >
            <ToolbarIcon d={icons.trash} />
          </button>
          <button className="bar-done" onClick={bulk.done}>
            Done
          </button>
        </div>
      ) : bulk && !editing ? (
        <div className="bulk-actions">
          <span className="bulk-count">{bulk.count} selected</span>
          {bulk.inTrash ? (
            <>
              <button
                className="footer-button"
                aria-label="Put back"
                data-hint="Put Back"
                onClick={bulk.putBack}
              >
                <ToolbarIcon d={icons.move} />
              </button>
              <button
                className="footer-button"
                aria-label="Delete immediately"
                data-hint="Delete Immediately"
                onClick={bulk.remove}
              >
                <ToolbarIcon d={icons.trash} />
              </button>
            </>
          ) : (
            <>
              {bulk.move && (
                <button
                  className="footer-button"
                  aria-label="Move to another list"
                  data-hint="Move to Another List"
                  aria-haspopup="dialog"
                  onClick={(e) =>
                    bulk.move?.(e.currentTarget.getBoundingClientRect())
                  }
                >
                  <ToolbarIcon d={icons.move} />
                </button>
              )}
              {bulk.date && (
                <button
                  className="footer-button"
                  aria-label="Set date"
                  data-hint="Set Date"
                  aria-haspopup="dialog"
                  onClick={(e) =>
                    bulk.date?.(e.currentTarget.getBoundingClientRect())
                  }
                >
                  <ToolbarIcon d={icons.date} />
                </button>
              )}
              <button
                className="footer-button"
                aria-label="Move to Trash"
                data-hint="Move to Trash"
                onClick={bulk.remove}
              >
                <ToolbarIcon d={icons.trash} />
              </button>
            </>
          )}
        </div>
      ) : !editing ? (
        <>
          {add && (
            <button
              ref={addButtonRef}
              className="add-button"
              disabled={!ready}
              aria-label="New to-do"
              data-hint="New To-Do (⌘N)"
              onClick={add}
            >
              <Plus />
            </button>
          )}
          {addSection && (
            <button
              className="footer-button"
              aria-label="New section"
              data-hint="New Section"
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
              <ToolbarIcon d={icons.back} />
              Put Back
            </button>
          ) : (
            <>
              <button
                className="bar-button"
                aria-haspopup="dialog"
                onClick={(e) => move(e.currentTarget.getBoundingClientRect())}
              >
                <ToolbarIcon d={icons.move} />
                Move
              </button>
              <button
                className="bar-button bar-danger"
                onClick={() => closeEditor(trashTodo)}
              >
                <ToolbarIcon d={icons.trash} />
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
          data-hint="Put Back"
          onClick={() => closeEditor((id) => void store.setTrashed(id, false))}
        >
          <ToolbarIcon d={icons.move} />
        </button>
      ) : (
        <>
          <button
            className="footer-button"
            aria-label="Move to another list"
            data-hint="Move to Another List"
            aria-haspopup="dialog"
            onClick={(e) => move(e.currentTarget.getBoundingClientRect())}
          >
            <ToolbarIcon d={icons.move} />
          </button>
          <button
            className="footer-button"
            aria-label="Move to Trash"
            data-hint="Move to Trash"
            onClick={() => closeEditor(trashTodo)}
          >
            <ToolbarIcon d={icons.trash} />
          </button>
        </>
      )}
    </footer>
  );
}

import { useEffect, useRef } from 'react';
import * as store from '../storage/store';
import type { Task } from '../storage/model';
import { useDraft } from '../hooks/useDraft';
import { dueLabel, untitled } from '../views';
import { Check } from './Check';
import {
  CalendarIcon,
  EpicDot,
  ListIcon,
  RepeatIcon,
  TagIcon,
  TrayIcon,
} from './icons';

// `list` is the to-do's project or area, shown on a button that opens
// `onMove` with the button's bounds; in a project, another shows its `epic`
// and opens `onEpic`, and a third shows its date and opens `onDate`.
export function Editor({
  task,
  today,
  list,
  progress,
  epic,
  close,
  onToggle,
  onMove,
  onDate,
  onEpic,
}: {
  task: Task;
  today: string;
  list?: Task;
  progress: number;
  epic?: Task;
  close: () => void;
  onToggle: (task: Task) => void;
  onMove?: (anchor: DOMRect) => void;
  onDate?: (anchor: DOMRect) => void;
  onEpic?: (anchor: DOMRect) => void;
}) {
  const listLabel = list ? list.title || untitled(list) : 'Inbox';
  const due = task.date ? dueLabel(task.date, today) : undefined;
  const { draft, latest, change, flush } = useDraft(task);
  const { title, notes } = draft;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // A textarea focuses with the caret at its start; editing picks up at the end.
  useEffect(() => {
    const el = titleRef.current;
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);
  function done() {
    flush();
    if (!latest.current.title.trim())
      void store.update(task.id, { deleted: true });
    close();
  }
  return (
    <div className="task-editor">
      <div className="task-row">
        <Check task={task} onToggle={onToggle} />
        {/* A textarea, so a long title wraps; Enter finishes instead of
            adding a line, and pasted line breaks become spaces. */}
        <textarea
          ref={titleRef}
          autoFocus
          className="editor-title"
          aria-label="To-do title"
          placeholder="New To-Do"
          rows={1}
          enterKeyHint="done"
          value={title}
          onChange={(e) =>
            change('title', e.target.value.replace(/\r?\n/g, ' '))
          }
          onKeyDown={(e) => {
            if (
              !e.nativeEvent.isComposing &&
              (e.key === 'Enter' || e.key === 'Escape')
            ) {
              e.preventDefault();
              done();
            }
          }}
        />
      </div>
      <textarea
        className="editor-notes"
        aria-label="Notes"
        placeholder="Notes"
        rows={3}
        value={notes}
        onChange={(e) => change('notes', e.target.value)}
        onKeyDown={(e) => {
          if (!e.nativeEvent.isComposing && e.key === 'Escape') done();
        }}
      />
      {(onMove || onDate) && (
        <div className="editor-foot">
          <div className="editor-pills">
            {onMove && (
              <button
                className="move-pill"
                aria-label={`Move to another list. Currently in ${listLabel}`}
                aria-haspopup="dialog"
                onClick={(e) => onMove(e.currentTarget.getBoundingClientRect())}
              >
                {list ? (
                  <ListIcon list={list} progress={progress} />
                ) : (
                  <TrayIcon />
                )}
                <span>{listLabel}</span>
              </button>
            )}
            {onEpic && (
              <button
                className={`epic-pill${epic ? ' has-epic' : ''}`}
                aria-label={
                  epic
                    ? `Epic: ${epic.title || 'New Epic'}. Change epic`
                    : 'Assign an epic'
                }
                aria-haspopup="menu"
                onClick={(e) => onEpic(e.currentTarget.getBoundingClientRect())}
              >
                {epic ? <EpicDot color={epic.color} /> : <TagIcon />}
                <span>{epic ? epic.title || 'New Epic' : 'Epic'}</span>
              </button>
            )}
            {onDate && (
              <button
                className={`date-pill${due?.overdue && !task.completed ? ' is-overdue' : ''}`}
                aria-label={
                  due
                    ? `Date: ${due.long}${task.repeat ? ', repeating' : ''}. Change date`
                    : 'Set a date'
                }
                aria-haspopup="dialog"
                onClick={(e) => onDate(e.currentTarget.getBoundingClientRect())}
              >
                <CalendarIcon />
                <span>{due ? due.long : 'When'}</span>
                {task.repeat && <RepeatIcon />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

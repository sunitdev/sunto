import * as store from '../storage/store';
import type { Task } from '../storage/model';
import { useDraft } from '../hooks/useDraft';
import { dueLabel, untitled } from '../views';
import { Check } from './Check';
import { CalendarIcon, ListIcon, RepeatIcon, TrayIcon } from './icons';

// `list` is the to-do's project or area, shown on a button that opens
// `onMove` with the button's bounds; another shows its date and opens
// `onDate`.
export function Editor({
  task,
  today,
  list,
  progress,
  close,
  onToggle,
  onMove,
  onDate,
}: {
  task: Task;
  today: string;
  list?: Task;
  progress: number;
  close: () => void;
  onToggle: (task: Task) => void;
  onMove?: (anchor: DOMRect) => void;
  onDate?: (anchor: DOMRect) => void;
}) {
  const listLabel = list ? list.title || untitled(list) : 'Inbox';
  const due = task.date ? dueLabel(task.date, today) : undefined;
  const { draft, latest, change, flush } = useDraft(task);
  const { title, notes } = draft;
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
        <input
          autoFocus
          aria-label="To-do title"
          placeholder="New To-Do"
          value={title}
          onChange={(e) => change('title', e.target.value)}
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
      )}
      <div className="editor-actions">
        <button onClick={done}>Done</button>
      </div>
    </div>
  );
}

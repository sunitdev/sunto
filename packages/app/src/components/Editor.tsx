import * as store from '../storage/store';
import type { Task } from '../storage/model';
import { useDraft } from '../hooks/useDraft';
import { untitled } from '../views';
import { Check } from './Check';
import { ListIcon, TrayIcon } from './icons';

// `list` is the to-do's project or area, shown on a button that opens
// `onMove` with the button's bounds.
export function Editor({
  task,
  list,
  progress,
  close,
  onToggle,
  onMove,
}: {
  task: Task;
  list?: Task;
  progress: number;
  close: () => void;
  onToggle: (task: Task) => void;
  onMove?: (anchor: DOMRect) => void;
}) {
  const listLabel = list ? list.title || untitled(list) : 'Inbox';
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
      {onMove && (
        <button
          className="move-pill"
          aria-label={`Move to another list. Currently in ${listLabel}`}
          aria-haspopup="dialog"
          onClick={(e) => onMove(e.currentTarget.getBoundingClientRect())}
        >
          {list ? <ListIcon list={list} progress={progress} /> : <TrayIcon />}
          <span>{listLabel}</span>
        </button>
      )}
      <div className="editor-actions">
        <button onClick={done}>Done</button>
      </div>
    </div>
  );
}

import * as store from '../storage/store';
import type { Task } from '../storage/model';
import { useDraft } from '../hooks/useDraft';
import { Check } from './Check';

export function Editor({
  task,
  close,
  onToggle,
}: {
  task: Task;
  close: () => void;
  onToggle: (task: Task) => void;
}) {
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
      <div className="editor-actions">
        <button onClick={done}>Done</button>
      </div>
    </div>
  );
}

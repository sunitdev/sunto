import type { RefObject } from 'react';
import type { Task } from '../storage/model';
import { completedTime } from '../storage/selectors';
import { dayName, type View } from '../views';
import { Check } from './Check';
import { Editor } from './Editor';

// The view's to-dos, in their groups.
export function TaskList({
  groups,
  label,
  view,
  phone,
  editing,
  selected,
  editorRef,
  listName,
  closeEditor,
  onToggle,
  onEdit,
  onSelect,
  onMenu,
}: {
  groups: { key: string; label: string; tasks: Task[] }[];
  // Labels the list when its group has no heading.
  label: string;
  view: View;
  phone: boolean;
  editing: string | null;
  selected: string | null;
  editorRef: RefObject<HTMLLIElement | null>;
  listName: (task: Task) => string;
  closeEditor: () => void;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onSelect: (id: string) => void;
  onMenu: (task: Task, x: number, y: number) => void;
}) {
  return groups.map((group) => (
    <section key={group.key} className="task-group">
      {group.label && <h2>{group.label}</h2>}
      <ul className="task-list" aria-label={group.label || label}>
        {group.tasks.map((task) => (
          <li
            key={task.id}
            data-task={task.id}
            ref={editing === task.id ? editorRef : undefined}
            className={`task-item${task.completed ? ' task-row--completed' : ''}${editing === task.id ? ' task-item--editing' : ''}${selected === task.id && !phone ? ' task-item--selected' : ''}`}
          >
            {editing === task.id ? (
              <Editor task={task} close={closeEditor} onToggle={onToggle} />
            ) : (
              <div
                className="task-row"
                onContextMenu={(e) => {
                  if (phone) return;
                  e.preventDefault();
                  onMenu(task, e.clientX, e.clientY);
                }}
              >
                <Check task={task} onToggle={onToggle} />
                {view === 'logbook' && task.completed && (
                  <span className="task-date">
                    {dayName(completedTime(task), true)}
                  </span>
                )}
                <button
                  className="task-title"
                  // Desktop: click selects, double-click edits.
                  onClick={() => (phone ? onEdit(task) : onSelect(task.id))}
                  onDoubleClick={() => onEdit(task)}
                  onFocus={() => {
                    if (!phone) onSelect(task.id);
                  }}
                >
                  <span>{task.title || 'New To-Do'}</span>
                  {(view === 'logbook' || view === 'trash') &&
                    listName(task) && (
                      <span className="task-list-name">{listName(task)}</span>
                    )}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  ));
}

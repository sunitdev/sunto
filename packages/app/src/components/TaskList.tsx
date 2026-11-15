import { useState, type RefObject } from 'react';
import type { Task } from '../storage/model';
import { completedTime, type Group, type Library } from '../storage/selectors';
import { startTaskDrag } from '../drag';
import { dayName, untitled, type View } from '../views';
import { Check } from './Check';
import { Editor } from './Editor';
import { Plus } from './icons';
import { SectionHeader } from './SectionHeader';

export type ItemProps = {
  view: View;
  phone: boolean;
  editing: string | null;
  selected: string | null;
  editorRef: RefObject<HTMLLIElement | null>;
  library: Library;
  closeEditor: () => void;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onSelect: (id: string) => void;
  onMenu: (task: Task, x: number, y: number) => void;
  onMove: (task: Task, anchor: DOMRect) => void;
};
// One to-do, or its editor. On desktop, to-dos in the Inbox, projects and
// areas can be dragged onto another list.
export function TaskItem({
  task,
  view,
  phone,
  editing,
  selected,
  editorRef,
  library,
  closeEditor,
  onToggle,
  onEdit,
  onSelect,
  onMenu,
  onMove,
}: ItemProps & { task: Task }) {
  const [dragging, setDragging] = useState(false);
  const archive = view === 'logbook' || view === 'trash';
  const list = library.lists[library.listOf(task)];
  const listName = list ? list.title || untitled(list) : task.deletedFrom;
  return (
    <li
      data-task={task.id}
      ref={editing === task.id ? editorRef : undefined}
      className={`task-item${task.completed ? ' task-row--completed' : ''}${editing === task.id ? ' task-item--editing' : ''}${selected === task.id && !phone ? ' task-item--selected' : ''}${dragging ? ' task-item--dragging' : ''}`}
    >
      {editing === task.id ? (
        <Editor
          task={task}
          list={list}
          progress={list ? library.progress(list.id) : 0}
          close={closeEditor}
          onToggle={onToggle}
          onMove={
            phone || task.trashed ? undefined : (anchor) => onMove(task, anchor)
          }
        />
      ) : (
        <div
          className="task-row"
          draggable={!phone && !archive}
          onDragStart={(e) => {
            startTaskDrag(e, task);
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
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
            {archive && listName && (
              <span className="task-list-name">{listName}</span>
            )}
          </button>
        </div>
      )}
    </li>
  );
}
// The view's to-dos, in their groups. A project's groups are its sections,
// each ending with a button that adds a to-do to it.
export function TaskList({
  groups,
  label,
  addTask,
  ...item
}: ItemProps & {
  groups: (Group & { label: string })[];
  // Labels the list when its group has no heading.
  label: string;
  addTask?: (section: string) => void;
}) {
  return groups.map((group) => (
    <section
      key={group.key}
      className={`task-group${group.section ? ' section-group' : ''}`}
    >
      {group.label && <h2>{group.label}</h2>}
      {group.section && addTask && (
        <SectionHeader section={group.section} addTask={addTask} />
      )}
      <ul
        className="task-list"
        aria-label={
          group.section
            ? group.section.title || 'New Section'
            : group.label || label
        }
      >
        {group.tasks.map((task) => (
          <TaskItem key={task.id} task={task} {...item} />
        ))}
      </ul>
      {addTask && (
        <button
          className="group-add"
          onClick={() => addTask(group.section?.id ?? '')}
        >
          <Plus />
          New To-Do
        </button>
      )}
    </section>
  ));
}

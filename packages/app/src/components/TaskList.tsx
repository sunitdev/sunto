import { useState, type RefObject } from 'react';
import type { Task } from '../storage/model';
import { completedTime, type Group, type Library } from '../storage/selectors';
import { startTaskDrag } from '../drag';
import { longPress } from '../longPress';
import { dayName, dueLabel, epicStyle, untitled, type View } from '../views';
import { Check } from './Check';
import { Editor } from './Editor';
import { EpicDot, InboxIcon, ListIcon, Plus, RepeatIcon } from './icons';
import { SectionHeader } from './SectionHeader';

export type ItemProps = {
  view: View;
  today: string;
  phone: boolean;
  editing: string | null;
  selected: string | null;
  // The to-dos picked together, when there are several.
  picked: string[];
  editorRef: RefObject<HTMLLIElement | null>;
  library: Library;
  closeEditor: () => void;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  // Shift-click picks the to-dos from the selected one to this one, and
  // Cmd-click adds this one to those picked or takes it out.
  onSelect: (id: string, how?: 'range' | 'toggle') => void;
  onMenu: (task: Task, x: number, y: number) => void;
  onMove: (task: Task, anchor: DOMRect) => void;
  onDate: (task: Task, anchor: DOMRect) => void;
  onEpic: (task: Task, anchor: DOMRect) => void;
};
// One to-do, or its editor. On desktop, to-dos in the Inbox, projects and
// areas can be dragged onto another list, or onto an epic of their project,
// along with the others picked with it. Its menu opens with a right-click, or
// by holding a finger on it.
export function TaskItem({
  task,
  view,
  today,
  phone,
  editing,
  selected,
  picked,
  editorRef,
  library,
  closeEditor,
  onToggle,
  onEdit,
  onSelect,
  onMenu,
  onMove,
  onDate,
  onEpic,
}: ItemProps & { task: Task }) {
  const [dragging, setDragging] = useState(false);
  const archive = view === 'logbook' || view === 'trash';
  const list = library.lists[library.listOf(task)];
  const listName = list ? list.title || untitled(list) : task.deletedFrom;
  const due = task.date && !task.completed && dueLabel(task.date, today);
  const epic = library.epicOf(task);
  return (
    <li
      data-task={task.id}
      ref={editing === task.id ? editorRef : undefined}
      className={`task-item${task.completed ? ' task-row--completed' : ''}${editing === task.id ? ' task-item--editing' : ''}${(selected === task.id && !phone) || picked.includes(task.id) ? ' task-item--selected' : ''}${dragging ? ' task-item--dragging' : ''}`}
    >
      {editing === task.id ? (
        <Editor
          task={task}
          today={today}
          library={library}
          list={list}
          progress={list ? library.progress(list.id) : 0}
          epic={epic}
          close={closeEditor}
          onToggle={onToggle}
          onMove={task.trashed ? undefined : (anchor) => onMove(task, anchor)}
          onDate={task.trashed ? undefined : (anchor) => onDate(task, anchor)}
          onEpic={
            task.trashed || list?.kind !== 'project'
              ? undefined
              : (anchor) => onEpic(task, anchor)
          }
        />
      ) : (
        <div
          className="task-row"
          draggable={!phone && !archive}
          onDragStart={(e) => {
            startTaskDrag(
              e,
              task,
              picked.includes(task.id) ? picked : undefined,
            );
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
          onContextMenu={(e) => {
            if (phone) return;
            e.preventDefault();
            onMenu(task, e.clientX, e.clientY);
          }}
          {...longPress((x, y) => onMenu(task, x, y))}
        >
          <Check task={task} onToggle={onToggle} />
          {view === 'logbook' && task.completed && (
            <span className="task-date">
              {dayName(completedTime(task), true)}
            </span>
          )}
          <button
            className="task-title"
            // Desktop: click selects, double-click edits. A modified click
            // keeps focus, and so the selection, where it was.
            onMouseDown={(e) => {
              if (e.shiftKey || e.metaKey || e.ctrlKey) e.preventDefault();
            }}
            onClick={(e) =>
              phone
                ? onEdit(task)
                : onSelect(
                    task.id,
                    e.shiftKey
                      ? 'range'
                      : e.metaKey || e.ctrlKey
                        ? 'toggle'
                        : undefined,
                  )
            }
            onDoubleClick={() => onEdit(task)}
            onFocus={() => {
              if (!phone && !picked.includes(task.id)) onSelect(task.id);
            }}
          >
            <span>{task.title || 'New To-Do'}</span>
            {archive && listName && (
              <span className="task-list-name">{listName}</span>
            )}
          </button>
          {epic && (
            <span className="task-epic" style={epicStyle(epic)}>
              <EpicDot color={epic.color} />
              <span>{epic.title || 'New Epic'}</span>
            </span>
          )}
          {due && (
            <span className={`task-due${due.overdue ? ' is-overdue' : ''}`}>
              {task.repeat && <RepeatIcon label="Repeats" />}
              {due.short}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
const listTitle = (list?: Task) =>
  list ? list.title || untitled(list) : 'Inbox';
// The view's to-dos, in their groups. A project's groups are its sections,
// each ending with a button that adds a to-do to it. Groups by list are
// headed by a button opening the list.
export function TaskList({
  groups,
  label,
  addTask,
  showList,
  ...item
}: ItemProps & {
  groups: (Group & { label: string })[];
  // Labels the list when its group has no heading.
  label: string;
  addTask?: (section: string) => void;
  showList?: (id: string) => void;
}) {
  const { lists, progress } = item.library;
  return groups.map((group) => (
    <section
      key={group.key}
      data-group={group.key}
      className={`task-group${group.section ? ' section-group' : ''}${group.list !== undefined ? ' list-group' : ''}`}
    >
      {group.label && <h2>{group.label}</h2>}
      {group.list !== undefined && (
        <h2>
          <button
            className="list-group-header"
            onClick={() => showList?.(group.list || 'inbox')}
          >
            {lists[group.list] ? (
              <ListIcon
                list={lists[group.list]}
                progress={progress(group.list)}
              />
            ) : (
              <InboxIcon />
            )}
            <span>{listTitle(lists[group.list])}</span>
          </button>
        </h2>
      )}
      {group.section && addTask && (
        <SectionHeader section={group.section} addTask={addTask} />
      )}
      <ul
        className="task-list"
        aria-label={
          group.section
            ? group.section.title || 'New Section'
            : group.list !== undefined
              ? listTitle(lists[group.list])
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

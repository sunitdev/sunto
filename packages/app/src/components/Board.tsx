import { useState } from 'react';
import * as store from '../storage/store';
import type { Task } from '../storage/model';
import type { Group } from '../storage/selectors';
import { taskDropTarget } from '../drag';
import { Plus } from './icons';
import { SectionHeader } from './SectionHeader';
import { TaskItem, type ItemProps } from './TaskList';

// A project shown as a board: a column for each section, after one for the
// to-dos in none. Dragging a to-do onto a column moves it to that section.
export function Board({
  project,
  groups,
  addTask,
  addSection,
  ...item
}: ItemProps & {
  project: string;
  groups: Group[];
  addTask: (section: string) => void;
  addSection: () => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const columns = groups.length
    ? groups
    : [{ key: 'none', section: undefined, tasks: [] as Task[] }];
  return (
    <div className="board">
      {columns.map((column) => {
        const section = column.section?.id ?? '';
        const open = column.tasks.filter((t) => !t.completed).length;
        return (
          <section
            key={column.key}
            className={`board-column${over === column.key ? ' is-drop' : ''}`}
            {...taskDropTarget(
              (on) =>
                setOver((current) =>
                  on ? column.key : current === column.key ? null : current,
                ),
              (id) => {
                if (!column.tasks.some((t) => t.id === id))
                  void store.update(id, { list: project, section });
              },
            )}
          >
            {column.section ? (
              <SectionHeader
                section={column.section}
                count={open}
                addTask={addTask}
              />
            ) : (
              <div className="section-header">
                <span className="section-title">No Section</span>
                <span className="section-count">{open}</span>
                <button
                  className="section-button"
                  aria-label="New to-do at top"
                  title="New To-Do"
                  onClick={() => addTask('')}
                >
                  <Plus />
                </button>
              </div>
            )}
            <ul
              className="task-list"
              aria-label={
                column.section
                  ? column.section.title || 'New Section'
                  : 'No Section'
              }
            >
              {column.tasks.map((task) => (
                <TaskItem key={task.id} task={task} {...item} />
              ))}
            </ul>
            <button className="column-add" onClick={() => addTask(section)}>
              <Plus />
              Add To-Do
            </button>
          </section>
        );
      })}
      <button className="new-section" onClick={addSection}>
        + New Section
      </button>
    </div>
  );
}

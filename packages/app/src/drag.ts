import type { DragEvent } from 'react';
import type { Task } from './storage/model';

// To-dos are dragged by id under their own type, so drop targets can tell
// them from dragged projects and text while the drag is under way. Dragging
// one of several selected to-dos drags them all, as `ids`.
const type = 'application/x-sunto-task';
export function startTaskDrag(e: DragEvent, task: Task, ids = [task.id]) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(type, ids.join('\n'));
  e.dataTransfer.setData('text/plain', task.title);
}
// Handlers for an element that accepts dropped to-dos, calling `drop` for
// each. `hover` reports when a to-do is dragged over or away from it.
export function taskDropTarget(
  hover: (over: boolean) => void,
  drop: (id: string) => void,
) {
  return {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(type)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      hover(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (
        e.relatedTarget instanceof Node &&
        e.currentTarget.contains(e.relatedTarget)
      )
        return;
      hover(false);
    },
    onDrop: (e: DragEvent) => {
      const ids = e.dataTransfer.getData(type);
      if (!ids) return;
      e.preventDefault();
      e.stopPropagation();
      hover(false);
      ids.split('\n').forEach(drop);
    },
  };
}

import * as store from './storage/store';
import { todoCount } from './views';

// The confirmation waiting for an answer, and the toast on screen, each held
// here so any component can ask for one without passing callbacks down.
export type Confirmation = {
  title: string;
  body: string;
  // The destructive button's label.
  action: string;
  run: () => void;
};
export type Toast = { id: number; message: string; undo?: () => void };
let confirmation: Confirmation | null = null;
let toast: Toast | null = null;
let toasts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export const getConfirmation = () => confirmation;
export const getToast = () => toast;
// Asks before an action that can't be undone.
export function confirmAction(request: Confirmation) {
  confirmation = request;
  emit();
}
export function dismissConfirmation() {
  confirmation = null;
  emit();
}
// Shows `message`, replacing any toast already showing; `undo` adds a button.
export function showToast(message: string, undo?: () => void) {
  toast = { id: ++toasts, message, undo };
  emit();
}
export function dismissToast(id: number) {
  if (toast?.id !== id) return;
  toast = null;
  emit();
}
// Moves a to-do to the Trash, offering to put it back. Changes apply in turn,
// so the title is read once the editor's last edit has landed; an untitled
// to-do is deleted when its editor closes, so there is nothing to put back.
export function trashTodo(id: string) {
  void store.setTrashed(id, true).then(() => {
    const title = store.getSnapshot().state.tasks[id]?.title.trim();
    if (title)
      showToast(
        `“${title}” moved to Trash`,
        () => void store.setTrashed(id, false),
      );
  });
}
// Moves several to-dos to the Trash, offering to put them all back.
export function trashTodos(ids: string[]) {
  void store
    .setTrashedAll(ids, true)
    .then(() =>
      showToast(
        `${todoCount(ids.length)} moved to Trash`,
        () => void store.setTrashedAll(ids, false),
      ),
    );
}

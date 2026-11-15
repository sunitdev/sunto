import type { Task } from '../storage/model';

export function Check({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (task: Task) => void;
}) {
  return (
    <button
      className="task-check"
      type="button"
      aria-label={`${task.completed ? 'Mark as not completed' : 'Mark as completed'}: ${task.title || 'New to-do'}`}
      aria-pressed={task.completed}
      onClick={() => onToggle(task)}
    >
      <span className="task-box">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </span>
    </button>
  );
}

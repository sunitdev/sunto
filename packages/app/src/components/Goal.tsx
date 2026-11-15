import type { Task } from '../storage/model';
import { groupByList, type Library } from '../storage/selectors';
import { dueLabel, untitled } from '../views';
import { GoalIcon, InboxIcon, ListIcon } from './icons';

const plural = (n: number) => (n === 1 ? '1 to-do is' : `${n} to-dos are`);
// Shown in Today's Goal until the day is planned.
export function PlanPrompt({
  due,
  target,
  start,
}: {
  due: number;
  target: number;
  start: () => void;
}) {
  return (
    <div className="plan-card plan-prompt">
      <GoalIcon />
      <div className="plan-text">
        <strong>Plan your day</strong>
        <span>
          {plural(due)} due today or overdue. Your daily target is {target}.
        </span>
      </div>
      <button className="plan-primary" onClick={start}>
        Plan
      </button>
    </div>
  );
}
function Stepper({
  value,
  change,
}: {
  value: number;
  change: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <button aria-label="Lower daily target" onClick={() => change(value - 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span aria-live="polite">{value}</span>
      <button aria-label="Raise daily target" onClick={() => change(value + 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
// Picks the day's goal from the to-dos due today or overdue, grouped by list,
// against a daily target that more picks can exceed.
export function Planner({
  library,
  due,
  today,
  picked,
  target,
  setTarget,
  toggle,
  cancel,
  finish,
}: {
  library: Library;
  due: Task[];
  today: string;
  picked: string[];
  target: number;
  setTarget: (target: number) => void;
  toggle: (id: string) => void;
  cancel: () => void;
  finish: () => void;
}) {
  const { lists, progress } = library;
  const count = picked.length;
  const over = count - target;
  const status =
    over > 0
      ? `${count} picked, ${over} over your daily target`
      : over === 0
        ? `${count} of ${target} picked · target reached`
        : `${count} of ${target} picked`;
  return (
    <div className="planner">
      <div className="plan-card planner-card">
        <div className="planner-head">
          <div className="plan-text">
            <strong>Plan your day</strong>
            <span>Pick the to-dos you’ll finish today.</span>
          </div>
          <span className="planner-target">Daily target</span>
          <Stepper value={target} change={setTarget} />
        </div>
        <div
          className="plan-slots"
          role="meter"
          aria-label="Daily capacity"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={count}
        >
          {Array.from({ length: Math.max(target, count) }, (_, k) => (
            <span
              key={k}
              className={
                k >= count ? '' : k >= target ? 'is-over' : 'is-filled'
              }
            />
          ))}
        </div>
        <div className="planner-foot">
          <span
            className={`planner-status${over > 0 ? ' is-over' : over === 0 ? ' is-reached' : ''}`}
          >
            {status}
          </span>
          <button className="plan-secondary" onClick={cancel}>
            Cancel
          </button>
          <button className="plan-primary" onClick={finish}>
            Start my day
          </button>
        </div>
      </div>
      <div role="group" aria-label="Due today and overdue">
        {groupByList(due, library).map((group) => {
          const list = lists[group.list];
          return (
            <div key={group.key} className="plan-group">
              <div className="plan-group-head">
                {list ? (
                  <ListIcon list={list} progress={progress(list.id)} />
                ) : (
                  <InboxIcon />
                )}
                <span>{list ? list.title || untitled(list) : 'Inbox'}</span>
              </div>
              {group.tasks.map((task) => {
                const on = picked.includes(task.id);
                const when = dueLabel(task.date, today);
                return (
                  <button
                    key={task.id}
                    className="plan-row"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(task.id)}
                  >
                    <span className="plan-ring">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12.5l4.2 4.2L19 7" />
                      </svg>
                    </span>
                    <span className="plan-title">{task.title}</span>
                    <span
                      className={`plan-when${when.overdue ? ' is-overdue' : ''}`}
                    >
                      {when.short}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {due.length === 0 && (
          <p className="plan-note plan-empty">
            Nothing is due today or overdue. Give a to-do a date to plan it into
            your day.
          </p>
        )}
        {over >= 0 && due.length > count && (
          <p className="plan-note">
            {over > 0
              ? `That is ${over} more than your usual ${target}. Fine if today allows it.`
              : `You have hit your daily target of ${target}. You can still add more if you have the capacity.`}
          </p>
        )}
      </div>
    </div>
  );
}
// The planned day's progress, above its to-dos.
export function GoalCard({ goal, edit }: { goal: Task[]; edit: () => void }) {
  const done = goal.filter((t) => t.completed).length;
  const complete = done === goal.length;
  return (
    <div className={`plan-card goal-card${complete ? ' is-complete' : ''}`}>
      <div className="goal-head">
        <GoalIcon />
        <strong>Today’s goal</strong>
        <span className="goal-progress">
          {complete
            ? `All ${goal.length} done`
            : `${done} of ${goal.length} done`}
        </span>
        <button className="goal-edit" onClick={edit}>
          Edit plan
        </button>
      </div>
      <div
        className="plan-slots"
        role="progressbar"
        aria-label="Today’s goal progress"
        aria-valuemin={0}
        aria-valuemax={goal.length}
        aria-valuenow={done}
      >
        {goal.map((t, k) => (
          <span key={t.id} className={k < done ? 'is-filled' : ''} />
        ))}
      </div>
      {complete && (
        <span className="goal-done">
          Goal complete. Anything else today is a bonus.
        </span>
      )}
    </div>
  );
}

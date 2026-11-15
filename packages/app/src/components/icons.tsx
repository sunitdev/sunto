import type { Task } from '../storage/model';
import type { StaticView } from '../views';

export function InboxIcon({ empty = false }: { empty?: boolean }) {
  return (
    <svg
      className={`view-icon inbox-icon${empty ? ' empty-icon' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={empty ? 1.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="phone-glyph">
        <path d="M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13" />
        <path
          d="M3 13h5.2a1 1 0 0 1 1 .8 3 3 0 0 0 5.6 0 1 1 0 0 1 1-.8H21v4.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          fill={empty ? 'none' : 'currentColor'}
        />
      </g>
      <g className="desktop-glyph">
        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="5.5"
          fill="currentColor"
          stroke="none"
        />
        <g stroke="white" strokeWidth="1.6">
          <path d="M6 13.2l1.5-3.9a1.3 1.3 0 0 1 1.2-.8h6.6a1.3 1.3 0 0 1 1.2.8l1.5 3.9V16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" />
          <path d="M6 13.2h3.5a2.5 2.5 0 0 0 5 0H18" />
        </g>
      </g>
    </svg>
  );
}
function TodayIcon() {
  return (
    <svg className="view-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6l2.85 5.75 6.35.93-4.6 4.47 1.09 6.32L12 17.1l-5.69 2.97 1.09-6.32-4.6-4.47 6.35-.93z"
        fill="#f2c230"
      />
    </svg>
  );
}
export function GoalIcon() {
  return (
    <svg
      className="view-icon goal-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}
function LogbookIcon() {
  return (
    <svg
      className="view-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="4" y="1.5" width="16" height="21" rx="2.5" fill="#5dbb63" />
      <rect x="4" y="1.5" width="4.5" height="21" rx="2.2" fill="#3e9a4a" />
      <path
        d="M10.5 12.3l2.1 2.2 4.2-4.7"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      className="view-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="trash-body"
        d="M5 6.5h14l-1.4 13.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z"
      />
      <ellipse className="trash-rim" cx="12" cy="6.5" rx="7.5" ry="2.2" />
    </svg>
  );
}
const viewIcons: Record<StaticView, typeof InboxIcon> = {
  inbox: InboxIcon,
  today: TodayIcon,
  goal: GoalIcon,
  logbook: LogbookIcon,
  trash: TrashIcon,
};
export function ViewIcon({ view }: { view: StaticView }) {
  const Icon = viewIcons[view];
  return <Icon />;
}
// A pie filled by the share of the project's to-dos that are completed.
function piePath(progress: number) {
  if (progress <= 0) return '';
  if (progress >= 1)
    return 'M12 6.8a5.2 5.2 0 1 1 0 10.4a5.2 5.2 0 1 1 0-10.4z';
  const a = progress * 2 * Math.PI;
  const x = (12 + 5.2 * Math.sin(a)).toFixed(2);
  const y = (12 - 5.2 * Math.cos(a)).toFixed(2);
  return `M12 12L12 6.8A5.2 5.2 0 ${progress > 0.5 ? 1 : 0} 1 ${x} ${y}Z`;
}
export function ProjectIcon({ progress }: { progress: number }) {
  return (
    <svg
      className="view-icon project-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
      <path d={piePath(progress)} fill="currentColor" />
    </svg>
  );
}
export function AreaIcon() {
  return (
    <svg
      className="view-icon area-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </svg>
  );
}
export function ListIcon({ list, progress }: { list: Task; progress: number }) {
  if (list.icon)
    return (
      <span className="view-icon emoji-icon" aria-hidden="true">
        {list.icon}
      </span>
    );
  return list.kind === 'area' ? (
    <AreaIcon />
  ) : (
    <ProjectIcon progress={progress} />
  );
}
// The Inbox where a to-do's list is shown, as in the editor's list button.
export function TrayIcon() {
  return (
    <svg
      className="view-icon tray-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 13l2.4-6.4A1.6 1.6 0 0 1 7.4 5.5h9.2a1.6 1.6 0 0 1 1.5 1.1L20.5 13v4.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 13h4.6l1.2 2.2h5.4l1.2-2.2h4.6" />
    </svg>
  );
}
export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}
export function ToolbarIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
export function Plus() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}
export function RepeatIcon({ label }: { label?: string }) {
  return (
    <svg
      className="repeat-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      <path d="M4 11a7 7 0 0 1 12-4.9L18 8M20 13a7 7 0 0 1-12 4.9L6 16" />
      <path d="M18 4v4h-4M6 20v-4h4" />
    </svg>
  );
}
export function CalendarIcon() {
  return (
    <svg
      className="calendar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}
export function TagIcon() {
  return (
    <svg
      className="tag-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}
// An epic's colour.
export function EpicDot({ color }: { color: string }) {
  return (
    <span
      className="epic-dot"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

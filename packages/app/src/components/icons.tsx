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

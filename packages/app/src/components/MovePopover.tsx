import { useLayoutEffect, useRef, useState } from 'react';
import type { Task } from '../storage/model';
import type { Library } from '../storage/selectors';
import { useDismiss } from '../hooks/useDismiss';
import { untitled } from '../views';
import { ListIcon, TrayIcon } from './icons';

type Row = {
  key: string;
  list?: Task;
  label: string;
  sub?: string;
  current: boolean;
  drill?: boolean;
  pick: () => void;
};
function Chevron({ d }: { d: string }) {
  return (
    <svg
      className="chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
// Moves `task` to the Inbox, a project or an area. Areas with projects open
// to list them, and searching lists every match. It opens above the element
// that `anchor` measures, or below it when there is no room.
export function MovePopover({
  task,
  library,
  anchor,
  move,
  close,
}: {
  task: Task;
  library: Library;
  anchor: DOMRect;
  move: (list: string) => void;
  close: () => void;
}) {
  const { areas, projects, lists, listOf, areaOf, progress } = library;
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [drill, setDrill] = useState<string | null>(null);
  useDismiss(root, true, close);
  useLayoutEffect(() => {
    const el = root.current!;
    const { width, height } = el.getBoundingClientRect();
    const above = anchor.top - height - 6;
    el.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - width - 8))}px`;
    el.style.top = `${Math.max(8, above >= 8 ? above : Math.min(anchor.bottom + 6, innerHeight - height - 8))}px`;
  });
  const current = listOf(task);
  const currentArea =
    lists[current]?.kind === 'project' ? areaOf(lists[current]) : current;
  const row = (list: Task | undefined, extra: Partial<Row> = {}): Row => {
    const id = list?.id ?? '';
    return {
      key: id || 'inbox',
      list,
      label: list ? list.title || untitled(list) : 'Inbox',
      current: id === current,
      pick: () => (id === current ? close() : move(id)),
      ...extra,
    };
  };
  const q = query.trim().toLowerCase();
  const area = q ? undefined : lists[drill ?? ''];
  const rows = q
    ? [
        row(undefined),
        ...projects.map((p) => {
          const a = lists[areaOf(p)];
          return row(p, { sub: a ? a.title || untitled(a) : '' });
        }),
        ...areas.map((a) => row(a, { sub: 'Area' })),
      ].filter((r) => r.label.toLowerCase().includes(q))
    : area
      ? [
          row(area, { sub: 'Area' }),
          ...projects.filter((p) => areaOf(p) === area.id).map((p) => row(p)),
        ]
      : [
          row(undefined),
          ...projects.filter((p) => !areaOf(p)).map((p) => row(p)),
          ...areas.map((a) => {
            const opens = projects.some((p) => areaOf(p) === a.id);
            return row(a, {
              current: a.id === currentArea,
              drill: opens,
              pick: opens ? () => setDrill(a.id) : row(a).pick,
            });
          }),
        ];
  return (
    <div
      ref={root}
      className="popover move-popover"
      role="dialog"
      aria-label="Move to"
    >
      <div className="move-search">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
        <input
          autoFocus
          aria-label="Search lists"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (!e.nativeEvent.isComposing && e.key === 'Enter') {
              e.preventDefault();
              rows[0]?.pick();
            }
          }}
        />
      </div>
      <div className="move-rows">
        {area && (
          <button className="move-back" onClick={() => setDrill(null)}>
            <Chevron d="M15 5l-7 7 7 7" />
            {area.title || untitled(area)}
          </button>
        )}
        {rows.map((r) => (
          <button
            key={r.key}
            className={`move-row${r.current ? ' is-current' : ''}`}
            aria-current={r.current || undefined}
            onClick={r.pick}
          >
            {r.list ? (
              <ListIcon list={r.list} progress={progress(r.list.id)} />
            ) : (
              <TrayIcon />
            )}
            <span className="move-label">
              <span>{r.label}</span>
              {r.sub && <span className="move-sub">{r.sub}</span>}
            </span>
            {r.drill && <Chevron d="M9 5l7 7-7 7" />}
          </button>
        ))}
        {rows.length === 0 && <p className="move-empty">No matching lists</p>}
      </div>
    </div>
  );
}

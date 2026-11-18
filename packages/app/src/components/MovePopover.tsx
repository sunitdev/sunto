import { useLayoutEffect, useRef, useState } from 'react';
import type { Task } from '../storage/model';
import type { Library } from '../storage/selectors';
import { useDismiss } from '../hooks/useDismiss';
import { place } from '../hooks/usePhone';
import { untitled } from '../views';
import { ListIcon, SectionIcon, TrayIcon } from './icons';

type Row = {
  key: string;
  list?: Task;
  section?: Task;
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
// Moves to-dos to the Inbox, a project, a section of one, or an area.
// `current` is the list and section they share, if any. Areas with projects
// and projects with sections open to list them, and searching lists every
// match. It opens above the element that `anchor` measures, or below it when
// there is no room.
export function MovePopover({
  current: shared,
  library,
  anchor,
  move,
  close,
}: {
  current?: { list: string; section: string };
  library: Library;
  anchor: DOMRect;
  move: (list: string, section?: string) => void;
  close: () => void;
}) {
  const { areas, projects, lists, areaOf, sectionsOf, progress } = library;
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [drill, setDrill] = useState<string | null>(null);
  // An area's projects or a project's sections slide in from the right, and
  // the lists they were opened from back from the left, once one has been
  // opened.
  const [slide, setSlide] = useState<'in' | 'back' | null>(null);
  function open(list: string | null, back = false) {
    setSlide(back ? 'back' : 'in');
    setDrill(list);
  }
  useDismiss(root, true, close);
  useLayoutEffect(() => {
    const el = root.current!;
    // Offset sizes ignore the scale the popover opens with.
    const { offsetWidth: width, offsetHeight: height } = el;
    const above = anchor.top - height - 6;
    place(
      el,
      Math.max(8, Math.min(anchor.left, innerWidth - width - 8)),
      Math.max(
        8,
        above >= 8
          ? above
          : Math.min(anchor.bottom + 6, innerHeight - height - 8),
      ),
    );
  });
  const current = shared?.list;
  const currentArea =
    current && lists[current]?.kind === 'project'
      ? areaOf(lists[current])
      : current;
  // Picking where the to-dos already are closes the popover.
  const pick = (list: string, section = '') =>
    shared?.list === list && shared.section === section
      ? close()
      : move(list, section);
  const row = (list: Task | undefined, extra: Partial<Row> = {}): Row => {
    const id = list?.id ?? '';
    return {
      key: id || 'inbox',
      list,
      label: list ? list.title || untitled(list) : 'Inbox',
      current: id === current,
      pick: () => pick(id),
      ...extra,
    };
  };
  const sectionRow = (project: Task, section: Task, sub?: string): Row => ({
    key: section.id,
    section,
    label: section.title || 'New Section',
    sub,
    current: current === project.id && shared?.section === section.id,
    pick: () => pick(project.id, section.id),
  });
  // A project with sections opens to list them.
  const projectRow = (p: Task, extra: Partial<Row> = {}) =>
    sectionsOf(p.id).length
      ? row(p, { drill: true, pick: () => open(p.id), ...extra })
      : row(p, extra);
  const q = query.trim().toLowerCase();
  const opened = q ? undefined : lists[drill ?? ''];
  // Back from a project goes to its area, if it was opened from there.
  const parent = opened?.kind === 'project' ? lists[areaOf(opened)] : undefined;
  const rows = q
    ? [
        row(undefined),
        ...projects.flatMap((p) => {
          const a = lists[areaOf(p)];
          const name = p.title || untitled(p);
          return [
            row(p, { sub: a ? a.title || untitled(a) : '' }),
            ...sectionsOf(p.id).map((s) => sectionRow(p, s, name)),
          ];
        }),
        ...areas.map((a) => row(a, { sub: 'Area' })),
      ].filter((r) => r.label.toLowerCase().includes(q))
    : opened?.kind === 'project'
      ? [
          row(opened, {
            sub: 'No Section',
            current: current === opened.id && !shared?.section,
          }),
          ...sectionsOf(opened.id).map((s) => sectionRow(opened, s)),
        ]
      : opened
        ? [
            row(opened, { sub: 'Area' }),
            ...projects
              .filter((p) => areaOf(p) === opened.id)
              .map((p) => projectRow(p)),
          ]
        : [
            row(undefined),
            ...projects.filter((p) => !areaOf(p)).map((p) => projectRow(p)),
            ...areas.map((a) => {
              const opens = projects.some((p) => areaOf(p) === a.id);
              return row(a, {
                current: a.id === currentArea,
                drill: opens,
                pick: opens ? () => open(a.id) : row(a).pick,
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
      <div
        key={drill ?? ''}
        className={`move-rows${slide ? ` slide-${slide}` : ''}`}
      >
        {opened && (
          <button
            className="move-back"
            onClick={() => open(parent?.id ?? null, true)}
          >
            <Chevron d="M15 5l-7 7 7 7" />
            {opened.title || untitled(opened)}
          </button>
        )}
        {rows.map((r) => (
          <button
            key={r.key}
            className={`move-row${r.current ? ' is-current' : ''}`}
            aria-current={r.current || undefined}
            onClick={r.pick}
          >
            {r.section ? (
              <SectionIcon />
            ) : r.list ? (
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

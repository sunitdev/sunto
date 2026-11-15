import type { Task } from '../storage/model';
import { untitled } from '../views';
import { ListIcon } from './icons';

// The projects of the open area, listed above its to-dos.
export function AreaProjects({
  projects,
  progress,
  show,
  openMenu,
}: {
  projects: Task[];
  progress: (id: string) => number;
  show: (id: string) => void;
  openMenu: (menu: { id: string; x: number; y: number }) => void;
}) {
  return (
    <ul className="area-projects" aria-label="Projects">
      {projects.map((p) => (
        <li key={p.id}>
          <button
            className={p.title ? undefined : 'untitled'}
            onClick={() => show(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu({ id: p.id, x: e.clientX, y: e.clientY });
            }}
          >
            <ListIcon list={p} progress={progress(p.id)} />
            {p.title || untitled(p)}
          </button>
        </li>
      ))}
    </ul>
  );
}

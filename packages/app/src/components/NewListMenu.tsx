import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '../hooks/useDismiss';
import { AreaIcon, Plus, ProjectIcon } from './icons';

export function NewListMenu({
  create,
}: {
  create: (kind: 'project' | 'area') => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, close);
  function choose(kind: 'project' | 'area') {
    close();
    create(kind);
  }
  return (
    <div className="sidebar-footer" ref={root}>
      <button
        className="new-list"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Plus />
        New List
      </button>
      {open && (
        <div className="popover new-list-menu">
          <button onClick={() => choose('project')}>
            <ProjectIcon progress={0.75} />
            <span>
              <strong>New Project</strong>
              <span>A goal you work towards one to-do at a time.</span>
            </span>
          </button>
          <div className="popover-rule" />
          <button onClick={() => choose('area')}>
            <AreaIcon />
            <span>
              <strong>New Area</strong>
              <span>
                Group projects and to-dos by responsibility, like Family or
                Work.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

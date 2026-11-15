import { useEffect, useLayoutEffect, useRef } from 'react';
import { useDismiss } from '../hooks/useDismiss';

export type MenuItem = { label: string; action: () => void };
export function ContextMenu({
  x,
  y,
  items,
  close,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  close: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Keep the menu inside the window, like a native context menu.
    const el = menu.current!;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(4, Math.min(x, innerWidth - width - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(y, innerHeight - height - 4))}px`;
    el.querySelector('button')?.focus();
  }, [x, y]);
  useDismiss(menu, true, close);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...menu.current!.querySelectorAll('button')];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        buttons[(i + step + buttons.length) % buttons.length].focus();
      }
    };
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', keys);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', keys);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [close]);
  return (
    <div ref={menu} className="context-menu" role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            close();
            item.action();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

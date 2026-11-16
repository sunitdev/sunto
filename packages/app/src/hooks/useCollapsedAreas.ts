import { useState } from 'react';

// The areas whose projects are folded away in the sidebar, remembered on
// this device.
const key = 'sunto.collapsedAreas';
function load(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(
      Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [],
    );
  } catch {
    return new Set();
  }
}
export function useCollapsedAreas() {
  const [collapsed, setCollapsed] = useState(load);
  function toggle(id: string) {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      // Private browsing can refuse storage; the fold still applies now.
    }
  }
  return [collapsed, toggle] as const;
}

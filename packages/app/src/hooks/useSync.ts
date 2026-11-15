import { useEffect } from 'react';
import * as store from '../storage/store';

// Loads the stored to-dos, then checks the sync folder every ten seconds and
// whenever the app returns to the foreground. Expired Trash is purged after
// loading and after each periodic check.
export function useSync() {
  useEffect(() => {
    void store.start().then(store.sync).then(store.purgeTrash);
    const interval = setInterval(
      () => void store.sync().then(store.purgeTrash),
      10000,
    );
    const refresh = () => {
      if (!document.hidden) void store.sync();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
}

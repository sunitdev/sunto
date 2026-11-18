import { Capacitor, registerPlugin, type Plugin } from '@capacitor/core';
export type Reply = {
  data?: string;
  folder?: string;
  files?: string[];
  legacy?: string[];
  pending?: boolean;
};
export interface NativeStorage {
  request(options: { command: string; data?: string }): Promise<Reply>;
}
const ios = registerPlugin<NativeStorage & Plugin>('SuntoStorage');
async function webRequest(command: string, data?: string): Promise<Reply> {
  if (!['load', 'save'].includes(command))
    throw Error('Folder sync is available in the native apps.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('sunto', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('state');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<Reply>((resolve, reject) => {
      const tx = db.transaction(
        'state',
        command === 'save' ? 'readwrite' : 'readonly',
      );
      const r =
        command === 'save'
          ? tx.objectStore('state').put(data, 'state')
          : tx.objectStore('state').get('state');
      tx.oncomplete = () =>
        resolve(command === 'load' ? { data: r.result } : {});
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const native = !!window.sunto || Capacitor.getPlatform() === 'ios';
export function request(command: string, data?: string): Promise<Reply> {
  const driver =
    window.sunto ?? (Capacitor.getPlatform() === 'ios' ? ios : undefined);
  return driver ? driver.request({ command, data }) : webRequest(command, data);
}
// Calls `open` with the view a link such as the widget's sunto://goal asks
// the iPhone app to show.
export function onOpen(open: (view: string) => void) {
  if (Capacitor.getPlatform() !== 'ios') return () => {};
  const handle = ios.addListener('open', (event: { view: string }) =>
    open(event.view),
  );
  return () => void handle.then((h) => h.remove());
}

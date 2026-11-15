import * as store from '../storage/store';
import { native } from '../storage/driver';

export function StoragePanel({
  syncStatus,
  folder,
  close,
}: {
  syncStatus: string;
  folder: string;
  close: () => void;
}) {
  return (
    <section className="storage-panel" aria-label="Storage settings">
      <strong>Storage & sync</strong>
      <p>
        {native
          ? 'Tasks are saved in SQLite on this device. Select the same iCloud Drive/Sunto folder on both devices.'
          : 'Tasks are saved in this browser. Open the native app to use iCloud folder sync.'}
      </p>
      <p role="status">
        {syncStatus}
        {folder && ` · ${folder}`}
      </p>
      {native && (
        <div>
          <button onClick={() => void store.chooseFolder()}>
            Choose folder
          </button>
          {folder && (
            <>
              <button onClick={() => void store.sync()}>Sync now</button>
              <button onClick={() => void store.disconnect()}>
                Disconnect
              </button>
            </>
          )}
        </div>
      )}
      <button onClick={close}>Close</button>
    </section>
  );
}

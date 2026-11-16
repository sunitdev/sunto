import * as store from '../storage/store';
import { native } from '../storage/driver';
import { Stepper } from './Goal';
import { GoalIcon } from './icons';

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 7.6A2.1 2.1 0 0 1 5.1 5.5h3.8c.56 0 1.1.22 1.49.62L11.8 7.5h7.1A2.1 2.1 0 0 1 21 9.6v7.8a2.1 2.1 0 0 1-2.1 2.1H5.1A2.1 2.1 0 0 1 3 17.4z"
        fill="#4aa3f5"
      />
      <path d="M3 10h18" stroke="#2e8cf0" strokeWidth="1" />
    </svg>
  );
}
// The sync folder, which the native apps require, and the daily target.
export function Settings({
  folder,
  target,
  setTarget,
}: {
  folder: string;
  target: number;
  setTarget: (target: number) => void;
}) {
  return (
    <div className="settings">
      <h2 className="settings-heading">
        {native ? 'iCloud Drive' : 'Storage'}
      </h2>
      <div className="settings-group">
        <div className="settings-row">
          <span className="settings-badge">
            <FolderIcon />
          </span>
          <div className="settings-label">
            <strong>{native ? 'Sync folder' : 'This browser'}</strong>
            <span title={folder || undefined}>
              {native
                ? folder || 'No folder selected'
                : 'Open the Mac or iPhone app to sync with iCloud Drive.'}
            </span>
          </div>
          {native && (
            <button
              className="settings-button"
              onClick={() => void store.chooseFolder()}
            >
              Change…
            </button>
          )}
        </div>
      </div>
      <p className="settings-note">
        {native
          ? 'Sunto stores your areas, projects and to-dos in this folder, so they stay in sync on your Mac and iPhone. A folder is required; you can move to a different one at any time.'
          : 'To-dos saved in this browser stay on this device.'}
      </p>
      <h2 className="settings-heading">Today’s Goal</h2>
      <div className="settings-group">
        <div className="settings-row">
          <span className="settings-badge is-accent">
            <GoalIcon />
          </span>
          <div className="settings-label">
            <strong>Daily target</strong>
            <span>A guide for how many to-dos you plan each day.</span>
          </div>
          <Stepper value={target} change={setTarget} />
        </div>
      </div>
      <p className="settings-note">
        It is only an indicator. You can always plan more than your target.
      </p>
    </div>
  );
}
// Shown in the native apps until a sync folder is chosen.
export function Welcome() {
  return (
    <div
      className="welcome"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="welcome-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5.5 12.5l4.2 4.2L18.5 7.5" />
        </svg>
      </div>
      <h1 id="welcome-title">Welcome to Sunto</h1>
      <p>
        Sunto keeps your areas, projects and to-dos in a folder in iCloud Drive,
        so they are on all your devices. Choose a folder to get started.
      </p>
      <button
        className="welcome-choose"
        autoFocus
        onClick={() => void store.chooseFolder()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.2 18.5h10.3a4 4 0 0 0 .7-7.94A5.6 5.6 0 0 0 7.5 9.05 4.75 4.75 0 0 0 7.2 18.5z" />
        </svg>
        Choose iCloud Folder…
      </button>
      <span className="welcome-hint">
        You can change the folder later in Settings.
      </span>
    </div>
  );
}

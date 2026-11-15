# Sunto

A shared React + TypeScript todo app with Electron for macOS and Capacitor for iPhone. The responsive Inbox follows the supplied Minimal Todo design: inline title/notes editing, completion, a desktop add toolbar, and a phone floating add button. It follows the system light/dark appearance using the design's dark palettes. In the editor, Enter on the title or Escape closes it. On desktop, the sidebar adds Logbook (completed to-dos grouped by completion day; a completed to-do stays in the Inbox for a moment before moving there) and Trash (Put Back and Empty Trash); while editing, the toolbar's trash button moves the to-do to Trash. On desktop, click selects a to-do and double-click or Enter edits it; arrow keys move the selection. Backspace/Delete or the right-click menu's Delete moves the selected to-do to Trash; in Trash they delete it permanently, and the menu also offers Put Back. Trashed to-dos are permanently deleted three months after they were trashed. The sidebar's **New List** menu creates Projects and Areas. Each has an editable name, notes, and an emoji icon chosen from the macOS emoji picker by clicking the list's icon (right-click it to remove; projects without one show a pie of their completed share); new to-dos join the open project or area. An Area lists its projects, and projects can be dragged onto an area in the sidebar, or out of it. Right-click a project for **Delete Project…**: after confirmation its to-dos move to Trash, labelled with the project's name, and Put Back returns them to the Inbox. Logbook and Trash show each to-do's project or area. The phone layout shows only the Inbox, including completed to-dos. New installations start empty.

## Run locally

Requires Node 22.12+, pnpm 12.4.2, and Xcode with command-line tools. Native storage uses Apple's system SQLite library, compiled from the same Swift implementation for both platforms.

```sh
pnpm install --frozen-lockfile
pnpm dev:desktop
```

`pnpm dev:web` runs browser development at http://127.0.0.1:5173. Browser mode persists in IndexedDB; it has no iCloud folder integration. Samples for visual review are exported from `packages/app/src/storage/fixtures.ts` and are never inserted automatically.

To build the local unsigned Mac application, run `pnpm build:desktop`. The storage helper is built automatically and included outside Electron's ASAR archive. Output is under `apps/desktop/release/mac*/Sunto.app`. It targets the build machine's architecture; distribution signing and notarization are not configured.

## Install on your iPhone for personal use

```sh
pnpm ios:sync
pnpm ios:open
```

In Xcode, choose the App target's Signing & Capabilities tab, select your Apple account's Personal Team, and enable automatic signing. If necessary, replace `com.sunto.app` with a unique bundle identifier (also update the Capacitor and desktop configurations). Select your connected iPhone, enable Developer Mode if requested, and Run. No App Store publication or CloudKit container is needed.

Free provisioning expires after seven days. Rebuild and install from Xcode using the same bundle identifier; avoid deleting the app, which removes local-only data. Provisioning, trust prompts, and device installation require your Apple account and device. A paid membership is optional for this workflow, but removes the free provisioning constraint.

The native Xcode sources are retained in the repository. `pnpm ios:sync` rebuilds and copies web assets without replacing the custom view controller or storage plugin. The project references `native/StorageCore.swift` directly. Do not delete and regenerate the iOS project without restoring those customizations.

## Connect iCloud folder sync

1. Create a folder named **Sunto** in iCloud Drive using Finder or Files.
2. Open the app's **··· → Storage settings → Choose folder** on your Mac and select that folder.
3. On your iPhone, choose the same folder through the system Files picker.
4. Keep both apps open while iCloud delivers the changes. **Sync now** forces another folder check.

The picker grants access; the iPhone cannot silently open a hardcoded iCloud path. Sunto remembers the folder using a security-scoped bookmark. Reselect the folder if permission expires or the folder moves. Disconnecting stops sync but preserves local tasks and the folder's files.

SQLite remains local: `tasks.sqlite` in Electron's Sunto user-data directory on Mac, and `Library/Application Support/Sunto` inside the iPhone app container. The database uses a versioned `app_state` table containing the complete task snapshot and change journal, saved together in a SQLite transaction with full synchronization. React never accesses SQLite or the filesystem directly.

The chosen folder contains `sunto-changes-v1/*.json`: immutable change records published with coordinated, atomic writes. These files contain your task text, so select a private folder. Change records carrying completion times or trash state are rejected by builds older than the Logbook/Trash release, and those carrying projects, areas, or list membership by builds older than the Projects/Areas release, so update both devices together. Projects and areas are synced as records of the same journal, distinguished by a `kind` field. Every edit has a UUID, device ID, logical revision, and changed fields. Imports are idempotent. Concurrent edits to different fields are preserved; competing edits to the same field use logical revision followed by device ID as a deterministic tie-break. Blank-title cleanup creates a deletion tombstone, so delayed title edits cannot resurrect removed tasks.

Local edits work offline. A folder check runs every ten seconds while the app is active, on focus/foreground visibility changes, and when requested. iOS may suspend the app; continuous background sync is not provided. “Folder checked” confirms local exchange only, not delivery to another device. iCloud delivery can take time. Native directory access uses file coordination; v1 uses periodic checks rather than native file-presenter notifications.

Save failures show an error and retain changes in memory for Retry; do not quit until a failed local save succeeds. Title and notes changes are debounced by 250ms, flushed when closing/switching editors and on page visibility/pagehide events. Force termination can still lose an uncommitted draft. Completion changes persist immediately. Corrupt or unsupported database formats are reported without overwriting the stored database. Invalid sync records report an error; valid parsed records can still be imported. Sync history is retained without compaction in v1, so files and database size grow over time.

For recovery after reinstall, choose the original sync folder: retained change records rebuild the tasks. Changes that never reached that folder cannot be recovered after deleting the local app. Do not remove change files manually; they are the recovery journal.

## Code quality and Git hooks

`pnpm install` installs the Husky Git hooks through the `prepare` script. If hooks need to be reinstalled, run `pnpm prepare` from the repository root.

Before each commit, lint-staged runs ESLint with automatic fixes on staged JavaScript and TypeScript files, then formats them with Prettier. Other supported staged files (including CSS, HTML, JSON, YAML, and Markdown) are formatted with Prettier. Fixes are added to the commit automatically; lint-staged preserves unstaged changes in partially staged files.

Staged Swift files are formatted and strictly linted with Xcode's bundled `swift-format`, using `.swift-format.json`. Apple property lists, privacy manifests, entitlements, and Xcode project files are validated with `plutil`; storyboards, XIBs, schemes, workspace XML, and other XML files are validated with `xmllint`. These native tools run only when matching source files are present. Native checks require Xcode command-line tools; they do not build the app.

The hook then runs the full workspace TypeScript check and `git diff --cached --check` to reject whitespace errors and merge conflict markers. ESLint warnings also block commits. Fix any reported issues, stage the changes, and retry the commit.

Generated output, Capacitor's generated web assets/configuration and `CapApp-SPM` package, and the pnpm lockfile are excluded from formatting. Maintained native source and metadata are checked. Generated output and native iOS files are excluded from ESLint. React source uses the recommended Hooks and Vite Fast Refresh rules. EditorConfig keeps editor whitespace settings aligned with Prettier.

`pnpm format` and `pnpm format:check` include native checks. The standalone `pnpm native:format` and `pnpm native:check` commands inspect tracked and untracked source files, respecting Git ignores. To check particular files, pass their paths after either command.

Run `pnpm lint:fix` to apply ESLint fixes, `pnpm format` to format source and documentation, or `pnpm format:check` to check formatting without changes.

## Validation

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test:storage
pnpm check:desktop
pnpm ios:build
```

Storage tests cover which to-dos each view shows and in what order, Logbook day groups, concurrent field edits, deterministic conflict resolution, duplicate and reordered imports, tombstones, malformed/future changes, SQLite restart and Unicode persistence, bookmarks, two local stores exchanging through a temporary folder, immutable-file collision rejection, retry, and disconnect.

Validated during implementation: TypeScript, ESLint, web build, storage tests, Electron development and packaged-app smoke checks, packaged SQLite helper execution, and unsigned iOS simulator compilation. Browser checks cover desktop and phone resting/editing layouts, title persistence after reload, and overflow/breakpoint checks at 320, 390, 699, 700, 1000, and 1440px. Physical iPhone installation, security-scoped access across device restarts, real iCloud delivery, offline two-device convergence, and native keyboard/safe-area appearance still require testing with your devices and Apple account.

Electron keeps context isolation, sandboxing, disabled renderer Node integration, and a narrow validated IPC storage bridge. The iPhone plugin serializes storage work off the main thread. The shared merge engine lives in `packages/app/src/storage`; platform-specific native persistence and coordinated folder access live in `native/StorageCore.swift`.

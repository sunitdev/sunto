# Sunto

A minimal to-do app for macOS and iPhone, with sync through an iCloud Drive folder.

![Adding to-dos, setting a due date, creating a project with a Kanban board, and planning Today's Goal](docs/demo.gif)

Press **+** to add a to-do, double-click one to add notes and a date, and tick it off to send it to the Logbook. Use **New List** for projects and areas, the **⋯** menu to switch a project to a Kanban board, and **Today's Goal → Plan** to pick what you'll finish today.

- Inbox, Today, Today's Goal, Logbook and Trash
- Projects, areas, sections, epics and a Kanban board
- Due dates and repeating to-dos
- Offline-first local SQLite storage
- Light and dark mode

## Install

Requires macOS with Xcode, Node 22.12+ and pnpm.

```sh
pnpm install
pnpm mac:install   # build and install to /Applications
pnpm ios:install   # build and install on a connected iPhone
```

On first iPhone install, trust the developer in **Settings → General → VPN & Device Management**.

### Keep it running on a free Apple account

Apps signed with a free Apple account stop opening after 7 days, with "Sunto is no longer available". To have this Mac reinstall it before then:

```sh
pnpm ios:auto-install          # set up a daily check
pnpm ios:auto-install:remove   # turn it off
```

A LaunchAgent checks daily at 9:00 and at login. Once the installed build has under 3 days left, it reinstalls over Wi-Fi, so the iPhone needs no cable. It does need to be on the same network as the Mac and paired with it (connect it by cable once and trust this Mac). Reinstalling keeps your data. You get a notification when it reinstalls or fails, and `~/Library/Logs/sunto-ios-reinstall.log` records each run.

It builds whatever is checked out in this folder, using the Node and pnpm it was set up with. Run the setup again after moving the repo or changing Node versions. To reinstall right away, run `node scripts/ios-auto-install.mjs run --force`.

## iPhone widget

On iOS 17 or later, hold the Home Screen, tap **Edit → Add Widget**, find **Sunto**, and add the large **Today's Goal** widget. It lists the to-dos picked for today and ticks them off with a tap on the circle. Tapping anywhere else opens Today's Goal. Open the app once after installing so the widget has a goal to show. To-dos ticked in the widget are saved, and synced to other devices, the next time Sunto opens.

## Sync

Create a **Sunto** folder in iCloud Drive, then choose it when Sunto first opens on each device (or later in **Settings**).

## Use with Claude

`apps/mcp` is an MCP server that lets Claude Code and other agents add, change and complete your to-dos through the sync folder. See [AGENTS.md](AGENTS.md) for setup.

## Develop

```sh
pnpm dev:desktop   # Electron with hot reload
pnpm dev:web       # browser at http://127.0.0.1:5173
pnpm lint && pnpm typecheck && pnpm test:storage
pnpm icons         # re-render app icons from icons/*.svg
```

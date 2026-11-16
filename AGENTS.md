# Agent instructions

## Reading and changing Sunto with the MCP server

`apps/mcp` is an MCP server that lets an agent such as Claude Code read and change the user's to-dos, projects and areas. Use it instead of editing Sunto's database or sync files directly.

It joins the iCloud Drive sync folder as one more device. It merges every device's file, applies its changes with the app's own rules, and writes only its own file in `sunto-devices-v2/`. The Mac app picks changes up within about ten seconds; the iPhone does once iCloud syncs. Sync must be connected in Sunto's Settings first.

### Setup

```sh
pnpm install
pnpm mcp:build    # bundles apps/mcp/dist/server.mjs
claude mcp add --scope user sunto -- node "$PWD/apps/mcp/dist/server.mjs"
```

`--scope user` makes the tools available in every project. Rebuild after changing the server or anything in `packages/app/src/storage`. For other MCP clients, run `node apps/mcp/dist/server.mjs` over stdio.

| Variable         | Default                                                |
| ---------------- | ------------------------------------------------------ |
| `SUNTO_FOLDER`   | `~/Library/Mobile Documents/com~apple~CloudDocs/Sunto` |
| `SUNTO_MCP_HOME` | `~/Library/Application Support/Sunto MCP`              |

`SUNTO_MCP_HOME` holds the server's own copy of the data and its device id. Don't delete it while the server is in use, or it rejoins as a new device.

### Tools

| Tool                   | What it does                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `sunto_overview`       | Today's date, Inbox and Today counts, and every area and project with its sections and epics |
| `sunto_list_todos`     | The to-dos of a view: `inbox`, `today`, `goal`, `logbook`, `trash`, or `list` with a list id |
| `sunto_search`         | To-dos and lists whose title or notes contain some text                                      |
| `sunto_get`            | One to-do, project, area, section or epic by id                                              |
| `sunto_add_todos`      | Adds to-dos, to the Inbox unless a list is given                                             |
| `sunto_update_todo`    | Changes a to-do's title, notes, list, section, epic, date, repeat or plan for Today's Goal   |
| `sunto_complete_todos` | Completes to-dos, or opens them again                                                        |
| `sunto_trash_todos`    | Moves to-dos to Trash, or puts them back                                                     |
| `sunto_delete_todos`   | Permanently deletes to-dos that are already in Trash                                         |
| `sunto_add_list`       | Adds a project, area, or a section or epic of a project                                      |
| `sunto_update_list`    | Renames a list, or changes its notes, icon, area, board layout or epic colour                |
| `sunto_delete_list`    | Permanently deletes a project, area, section or epic                                         |

### Using it well

- **Call `sunto_overview` first.** Other tools take ids, never names, and it lists every list's id along with the user's local date.
- **Look up a to-do's id** with `sunto_search` or `sunto_list_todos` before changing it. Never guess one.
- **Dates are local days** as `YYYY-MM-DD`; `''` clears one. "Today" means the `today` the overview returns.
- **A repeating to-do needs a date.** Completing it adds the next occurrence, as in the app.
- **Batch.** `sunto_add_todos`, `sunto_complete_todos` and `sunto_trash_todos` take many items in one call.
- **Prefer Trash to deletion.** Trashed to-dos can be put back for three months. `sunto_delete_todos` and `sunto_delete_list` cannot be undone, so confirm with the user before calling them. Deleting a project or area moves its to-dos to Trash.
- **When a call fails,** the error says why. "Still downloading from iCloud" clears on its own after a few seconds, so retry.

### Working on the server

- `apps/mcp/src/folder.ts` reads and writes the sync folder, `sunto.ts` checks inputs and builds changes, and `server.ts` defines the tools.
- The edits behind each action live in `packages/app/src/storage/ops.ts`, shared with the app. Change them there so the app and the server never differ.
- `pnpm test:mcp` builds the server and drives it over stdio against a temporary sync folder, using the app's model as the other device.

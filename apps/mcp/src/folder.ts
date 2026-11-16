// The server joins the sync folder as one more device: it merges every other
// device's file, applies its edits, and writes only its own file, exactly as
// the app's sync does. Its state is kept locally as well, like the app's
// database, so a removed folder file loses nothing.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  emptyState,
  mutate,
  reconcile,
  restore,
  type State,
} from '../../../packages/app/src/storage/model';
import type { Changes } from '../../../packages/app/src/storage/ops';

// The folder names StorageCore.swift uses.
const devicesFolder = 'sunto-devices-v2';
const legacyFolder = 'sunto-changes-v1';

export type Paths = { folder: string; home: string };
export const defaultPaths = (env = process.env): Paths => ({
  folder:
    env.SUNTO_FOLDER ||
    join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/Sunto'),
  home:
    env.SUNTO_MCP_HOME ||
    join(homedir(), 'Library/Application Support/Sunto MCP'),
});

// Writes through a hidden temporary file, which the app's sync skips.
async function writeAtomic(
  path: string,
  dir: string,
  name: string,
  text: string,
) {
  const temp = join(dir, `.${name}.${process.pid}.tmp`);
  await writeFile(temp, text);
  await rename(temp, path);
}

// The JSON files in `dir`, other than `except`. Files iCloud has not
// downloaded yet are requested and set `pending`.
async function readJson(
  dir: string,
  except: string,
  folder: { pending: boolean },
) {
  if (!existsSync(dir)) return [];
  const texts: string[] = [];
  for (const name of await readdir(dir)) {
    // iCloud shows a file it has not downloaded as ".<name>.icloud".
    if (name.startsWith('.') && name.endsWith('.json.icloud')) {
      execFile('brctl', ['download', join(dir, name.slice(1, -7))], () => {});
      folder.pending = true;
      continue;
    }
    if (name.startsWith('.') || !name.endsWith('.json') || name === except)
      continue;
    texts.push(await readFile(join(dir, name), 'utf8'));
  }
  return texts;
}

// Holds a lock in `home` so two servers never write the same device's state
// at once. A lock older than 30 seconds was left by a crashed server.
async function lock(home: string) {
  const path = join(home, 'lock');
  for (let tries = 0; ; tries++) {
    try {
      await mkdir(path);
      return () => rm(path, { recursive: true, force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const age =
        Date.now() - (await stat(path).catch(() => ({ mtimeMs: 0 }))).mtimeMs;
      if (age > 30000) await rm(path, { recursive: true, force: true });
      else if (tries > 100) throw Error('Another Sunto MCP server is busy');
      else await new Promise((r) => setTimeout(r, 100));
    }
  }
}

let queue: Promise<unknown> = Promise.resolve();

// Brings this device up to date with the folder, then applies the changes
// `edit` returns for that state. Returns the resulting state and any sync
// files that could not be read. The folder file is written only when
// something changed.
export function transact(paths: Paths, edit: (state: State) => Changes) {
  const job = queue.then(async () => {
    if (!existsSync(paths.folder))
      throw Error(
        `No Sunto sync folder at ${paths.folder}. Connect one in Sunto's Settings, or set SUNTO_FOLDER.`,
      );
    await mkdir(paths.home, { recursive: true });
    const unlock = await lock(paths.home);
    try {
      const local = join(paths.home, 'state.json');
      let state = existsSync(local)
        ? restore(await readFile(local, 'utf8'))
        : emptyState();
      const folder = { pending: false };
      const files = await readJson(
        join(paths.folder, devicesFolder),
        `${state.device}.json`,
        folder,
      );
      const legacy = await readJson(
        join(paths.folder, legacyFolder),
        '',
        folder,
      );
      if (folder.pending)
        throw Error(
          'Some Sunto files are still downloading from iCloud. Try again in a few seconds.',
        );
      const merged = reconcile(state, { files, legacy }, Date.now());
      state = merged.state;
      const changes = edit(state);
      state = changes.reduce(
        (next, [id, patch]) => mutate(next, id, patch),
        state,
      );
      await writeAtomic(local, paths.home, 'state.json', JSON.stringify(state));
      if (changes.length) {
        const dir = join(paths.folder, devicesFolder);
        await mkdir(dir, { recursive: true });
        const name = `${state.device}.json`;
        await writeAtomic(
          join(dir, name),
          dir,
          name,
          JSON.stringify({ ...state, saved: Date.now() }),
        );
      }
      return { state, failures: merged.failures };
    } finally {
      await unlock();
    }
  });
  queue = job.catch(() => {});
  return job;
}

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: '/Applications' },
    'no-open': { type: 'boolean', default: false },
  },
});
/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
/** @param {string} command @param {string[]} args */
function succeeds(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}
run('pnpm', ['build:desktop']);
const release = join(root, 'apps/desktop/release');
const source = readdirSync(release)
  .filter((name) => name.startsWith('mac'))
  .map((name) => join(release, name, 'Sunto.app'))
  .find((path) => existsSync(path));
if (!source) throw new Error(`No Sunto.app found under ${release}`);
const destination = join(values.dir, 'Sunto.app');
// Quit the installed copy gracefully so pending saves are flushed first.
spawnSync('osascript', [
  '-e',
  'if application id "com.sunto.app" is running then tell application id "com.sunto.app" to quit',
]);
for (let attempt = 0; attempt < 50; attempt++) {
  if (!succeeds('pgrep', ['-x', 'Sunto'])) break;
  await setTimeout(200);
}
if (succeeds('pgrep', ['-x', 'Sunto']))
  throw new Error('Sunto is still running; quit it and try again');
rmSync(destination, { recursive: true, force: true });
run('ditto', [source, destination]);
// The build is unsigned; an ad-hoc signature lets it launch on Apple silicon.
if (!succeeds('codesign', ['--verify', '--deep', '--strict', destination]))
  run('codesign', ['--force', '--deep', '--sign', '-', destination]);
console.log(`Installed ${destination}`);
if (!values['no-open']) run('open', [destination]);

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../apps/mobile/', import.meta.url));
/** @param {...string} args */
function cap(...args) {
  const result = spawnSync('pnpm', ['exec', 'cap', ...args], {
    cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (
  !existsSync(new URL('../apps/mobile/ios/App/App.xcodeproj', import.meta.url))
)
  cap('add', 'ios');
cap('sync', 'ios');

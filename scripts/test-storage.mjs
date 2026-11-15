import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = mkdtempSync(join(tmpdir(), 'sunto-test-'));
try {
  copyFileSync('tests/native-main.swift', join(temp, 'main.swift'));
  /** @type {[string, string[]][]} */
  const commands = [
    [
      process.execPath,
      [
        '--test',
        'tests/model.test.mjs',
        'tests/dates.test.mjs',
        'tests/selectors.test.mjs',
        'tests/store.test.mjs',
      ],
    ],
    [
      'xcrun',
      [
        'swiftc',
        'native/StorageCore.swift',
        join(temp, 'main.swift'),
        '-o',
        join(temp, 'test'),
        '-lsqlite3',
      ],
    ],
    [join(temp, 'test'), []],
  ];
  for (const [cmd, args] of commands) {
    const result = spawnSync(cmd, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    if (process.exitCode) break;
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

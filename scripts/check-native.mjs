import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [mode, ...paths] = process.argv.slice(2);
if (mode !== '--check' && mode !== '--write') {
  throw new Error(
    'Usage: node scripts/check-native.mjs --check|--write [files...]',
  );
}

// Without explicit paths, check tracked and untracked source, respecting Git ignores.
const candidates = paths.length
  ? paths.map((path) => resolve(path))
  : execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
      .split('\0')
      .filter(Boolean)
      .map((path) => resolve(root, path))
      .filter((path) => existsSync(path));

// Resolve aliases such as macOS /var -> /private/var before matching exclusions.
const canonical = candidates.map((path) =>
  existsSync(path) ? realpathSync(path) : path,
);
const files = [...new Set(canonical)].filter((path) => {
  const name = relative(root, path).replaceAll('\\', '/');
  return (
    !name
      .split('/')
      .some((part) =>
        ['node_modules', 'dist', 'release', 'DerivedData'].includes(part),
      ) &&
    !name.startsWith('apps/mobile/ios/App/CapApp-SPM/') &&
    !name.startsWith('apps/mobile/ios/App/App/public/') &&
    name !== 'apps/mobile/ios/App/App/config.xml'
  );
});

/**
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(
      `Cannot run ${command}. Native checks require Xcode command-line tools.`,
    );
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const swift = files.filter((path) => extname(path) === '.swift');
const plists = files.filter((path) =>
  ['.plist', '.pbxproj', '.entitlements', '.xcprivacy'].includes(extname(path)),
);
const xml = files.filter((path) =>
  ['.storyboard', '.xib', '.xcworkspacedata', '.xcscheme', '.xml'].includes(
    extname(path),
  ),
);

if (swift.length) {
  const config = ['--configuration', resolve(root, '.swift-format.json')];
  if (mode === '--write') {
    run('xcrun', ['swift-format', 'format', '--in-place', ...config, ...swift]);
  }
  run('xcrun', ['swift-format', 'lint', '--strict', ...config, ...swift]);
}
if (plists.length) run('plutil', ['-lint', '--', ...plists]);
if (xml.length) run('xmllint', ['--nonet', '--noout', ...xml]);

console.log(
  `Native checks passed: ${swift.length} Swift, ${plists.length} plist/project, ${xml.length} XML files.`,
);

import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url));
const derivedData = join(root, 'apps/mobile/DerivedData');
const { values } = parseArgs({
  options: {
    device: { type: 'string', default: process.env.SUNTO_DEVICE },
    team: { type: 'string', default: process.env.SUNTO_TEAM_ID },
    'bundle-id': { type: 'string', default: process.env.SUNTO_BUNDLE_ID },
  },
});
/** @param {string} message @returns {never} */
function fail(message) {
  console.error(message);
  process.exit(1);
}
/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
/** @param {string} command @param {string[]} args */
function output(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(result.stderr || `${command} failed`);
  return result.stdout;
}
/**
 * @typedef {{
 *   identifier: string,
 *   hardwareProperties: { platform?: string, reality?: string, udid: string },
 *   deviceProperties: { name: string },
 *   connectionProperties: { tunnelState?: string },
 * }} Device
 * @returns {Device}
 */
function findDevice() {
  const dir = mkdtempSync(join(tmpdir(), 'sunto-devices-'));
  try {
    const file = join(dir, 'devices.json');
    output('xcrun', ['devicectl', 'list', 'devices', '--json-output', file]);
    /** @type {Device[]} */
    const devices = JSON.parse(readFileSync(file, 'utf8')).result.devices;
    const physical = devices.filter(
      (device) =>
        device.hardwareProperties.platform === 'iOS' &&
        device.hardwareProperties.reality !== 'simulated',
    );
    if (values.device) {
      const match = physical.find((device) =>
        [
          device.identifier,
          device.hardwareProperties.udid,
          device.deviceProperties.name,
        ].includes(/** @type {string} */ (values.device)),
      );
      if (!match) fail(`No iPhone named or identified "${values.device}"`);
      return /** @type {Device} */ (match);
    }
    const available = physical.filter(
      (device) => device.connectionProperties.tunnelState !== 'unavailable',
    );
    if (available.length === 1) return available[0];
    if (available.length === 0)
      fail(
        'No iPhone available. Connect it with a cable, unlock it, and trust this Mac.',
      );
    return fail(
      `Several iPhones are available; choose one with --device:\n${available
        .map((device) => `  ${device.deviceProperties.name}`)
        .join('\n')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** Reads the team ID (the certificate's OU) from Apple Development certificates. */
function findTeam() {
  const pems =
    output('security', [
      'find-certificate',
      '-a',
      '-c',
      'Apple Development',
      '-p',
    ]).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ??
    [];
  const teams = new Set(
    pems
      .map((pem) => new X509Certificate(pem))
      .filter((cert) => new Date(cert.validTo) > new Date())
      .map((cert) => /^OU=(.+)$/m.exec(cert.subject)?.[1])
      .filter(Boolean),
  );
  if (teams.size === 1) return [...teams][0];
  return fail(
    teams.size
      ? `Several development teams found (${[...teams].join(', ')}); choose one with --team`
      : 'No Apple Development certificate found. Sign in to your Apple account in Xcode → Settings → Accounts, or pass --team.',
  );
}
const device = findDevice();
const team = values.team ?? findTeam();
console.log(`Installing on ${device.deviceProperties.name} (team ${team})`);
run('pnpm', ['ios:sync']);
run('xcodebuild', [
  '-project',
  'apps/mobile/ios/App/App.xcodeproj',
  '-scheme',
  'App',
  '-configuration',
  'Release',
  '-destination',
  `id=${device.hardwareProperties.udid}`,
  '-derivedDataPath',
  derivedData,
  '-allowProvisioningUpdates',
  '-allowProvisioningDeviceRegistration',
  'build',
  `DEVELOPMENT_TEAM=${team}`,
  'CODE_SIGN_STYLE=Automatic',
  ...(values['bundle-id']
    ? [`PRODUCT_BUNDLE_IDENTIFIER=${values['bundle-id']}`]
    : []),
]);
const app = join(derivedData, 'Build/Products/Release-iphoneos/App.app');
const bundleId = output('plutil', [
  '-extract',
  'CFBundleIdentifier',
  'raw',
  join(app, 'Info.plist'),
]).trim();
run('xcrun', [
  'devicectl',
  'device',
  'install',
  'app',
  '--device',
  device.identifier,
  app,
]);
const launch = spawnSync(
  'xcrun',
  [
    'devicectl',
    'device',
    'process',
    'launch',
    '--device',
    device.identifier,
    bundleId,
  ],
  { stdio: 'inherit' },
);
if (launch.status !== 0)
  console.warn(
    'Installed, but the app could not be launched. Unlock the iPhone, and on first install trust the developer in Settings → General → VPN & Device Management.',
  );

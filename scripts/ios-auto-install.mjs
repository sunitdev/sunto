// Keeps Sunto running on an iPhone signed with a free Apple account, whose
// provisioning profiles expire after 7 days. A daily LaunchAgent reinstalls the
// app over Wi-Fi once its profile has fewer than THRESHOLD_DAYS left.
//
//   node scripts/ios-auto-install.mjs setup         install and start the LaunchAgent
//   node scripts/ios-auto-install.mjs remove        stop and remove it
//   node scripts/ios-auto-install.mjs run [--force] check, and reinstall if due
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const THRESHOLD_DAYS = 3;
const DAY = 86_400_000;
const LABEL = 'com.sunto.ios-reinstall';
const root = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(import.meta.url);
const home = homedir();
const stateDir = join(home, 'Library/Application Support/Sunto Auto Install');
const stateFile = join(stateDir, 'expires');
const lockDir = join(stateDir, 'lock');
const logFile = join(home, 'Library/Logs/sunto-ios-reinstall.log');
const agentFile = join(home, 'Library/LaunchAgents', `${LABEL}.plist`);
const profilesDir = join(
  home,
  'Library/Developer/Xcode/UserData/Provisioning Profiles',
);
const app = join(
  root,
  'apps/mobile/DerivedData/Build/Products/Release-iphoneos/App.app',
);
const domain = `gui/${userInfo().uid}`;

/** @param {string} message */
function log(message) {
  const time = new Date().toLocaleString('sv').slice(0, 19);
  console.log(`[${time}] ${message}`);
}

/** @param {string} subtitle @param {string} message */
function notify(subtitle, message) {
  const quote = (/** @type {string} */ text) => JSON.stringify(text);
  spawnSync('osascript', [
    '-e',
    `display notification ${quote(message)} with title "Sunto auto-install" subtitle ${quote(subtitle)}`,
  ]);
}

/** @param {number} time */
function formatDate(time) {
  return new Date(time).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Reads a provisioning profile's app identifier and expiry time.
 * @param {string} file
 */
function readProfile(file) {
  const decoded = spawnSync('security', ['cms', '-D', '-i', file]);
  if (decoded.status !== 0) return { appId: '', expires: undefined };
  /** @param {string} key */
  const extract = (key) =>
    spawnSync('plutil', ['-extract', key, 'raw', '-'], {
      input: decoded.stdout,
      encoding: 'utf8',
    }).stdout.trim();
  const expires = Date.parse(extract('ExpirationDate'));
  return {
    appId: extract('Entitlements.application-identifier'),
    expires: Number.isNaN(expires) ? undefined : expires,
  };
}

/**
 * Xcode reuses a cached profile until it expires, so a reinstall alone would
 * not extend anything. Removing the app's and widget's profiles makes Xcode
 * request fresh 7-day ones.
 */
function removeCachedProfiles() {
  if (!existsSync(profilesDir)) return;
  const bundleId = process.env.SUNTO_BUNDLE_ID || 'com.sunto.app';
  const ids = [bundleId, `${bundleId}.widget`];
  for (const name of readdirSync(profilesDir)) {
    if (!name.endsWith('.mobileprovision')) continue;
    const file = join(profilesDir, name);
    const { appId } = readProfile(file);
    if (ids.some((id) => appId.endsWith(`.${id}`))) rmSync(file);
  }
}

function trimLog() {
  if (!existsSync(logFile)) return;
  const lines = readFileSync(logFile, 'utf8').split('\n');
  if (lines.length > 3000)
    writeFileSync(logFile, lines.slice(-1500).join('\n'));
}

/** @param {boolean} force */
function run(force) {
  trimLog();
  mkdirSync(stateDir, { recursive: true });
  try {
    mkdirSync(lockDir);
  } catch {
    log('Another run is in progress; skipping.');
    return;
  }
  try {
    const expires = existsSync(stateFile)
      ? Number(readFileSync(stateFile, 'utf8'))
      : NaN;
    if (!force && expires - Date.now() > THRESHOLD_DAYS * DAY) {
      const left = Math.floor((expires - Date.now()) / DAY);
      log(
        `Installed build is good until ${formatDate(expires)} (${left} days left); nothing to do.`,
      );
      return;
    }

    const git = (/** @type {string[]} */ args) =>
      spawnSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
      }).stdout.trim();
    log(
      `Reinstalling Sunto from ${root} (${git(['rev-parse', '--abbrev-ref', 'HEAD'])} @ ${git(['rev-parse', '--short', 'HEAD'])})`,
    );
    removeCachedProfiles();
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts/install-ios.mjs')],
      { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
    );
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    console.log(output.trimEnd().split('\n').slice(-40).join('\n'));

    if (result.status !== 0) {
      let message = `Reinstall failed (exit ${result.status}). Is the iPhone on the same Wi-Fi? See ${logFile}.`;
      if (!Number.isNaN(expires))
        message += ` The current build stops launching ${formatDate(expires)}.`;
      log(message);
      notify('Reinstall failed', message);
      process.exitCode = 1;
      return;
    }

    const plugins = join(app, 'PlugIns');
    const profiles = [
      join(app, 'embedded.mobileprovision'),
      ...(existsSync(plugins)
        ? readdirSync(plugins).map((name) =>
            join(plugins, name, 'embedded.mobileprovision'),
          )
        : []),
    ].filter((file) => existsSync(file));
    const expiries = profiles
      .map((file) => readProfile(file).expires)
      .filter((time) => time !== undefined);
    if (!expiries.length) {
      rmSync(stateFile, { force: true });
      log(
        "Installed, but couldn't read the new profile's expiry; will retry tomorrow.",
      );
      process.exitCode = 1;
      return;
    }
    const until = Math.min(...expiries);
    writeFileSync(stateFile, String(until));
    log(`Installed. Good until ${formatDate(until)}.`);
    notify('Reinstalled', `Sunto is good until ${formatDate(until)}.`);
  } finally {
    rmdirSync(lockDir);
  }
}

/** @param {string} text */
function xml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function setup() {
  // launchd starts jobs with a bare PATH; give it this Node and pnpm.
  const pnpm = spawnSync('which', ['pnpm'], { encoding: 'utf8' }).stdout.trim();
  const path = [
    ...new Set([
      dirname(process.execPath),
      ...(pnpm ? [dirname(pnpm)] : []),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ]),
  ].join(':');
  /** @type {Record<string, string>} */
  const env = { PATH: path };
  for (const key of ['SUNTO_DEVICE', 'SUNTO_TEAM_ID', 'SUNTO_BUNDLE_ID']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${xml(process.execPath)}</string>
		<string>${xml(script)}</string>
		<string>run</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
${Object.entries(env)
  .map(([key, value]) => `		<key>${key}</key>\n		<string>${xml(value)}</string>`)
  .join('\n')}
	</dict>
	<key>StartCalendarInterval</key>
	<dict>
		<key>Hour</key>
		<integer>9</integer>
		<key>Minute</key>
		<integer>0</integer>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${xml(logFile)}</string>
	<key>StandardErrorPath</key>
	<string>${xml(logFile)}</string>
	<key>ProcessType</key>
	<string>Background</string>
</dict>
</plist>
`;
  mkdirSync(dirname(agentFile), { recursive: true });
  spawnSync('launchctl', ['bootout', `${domain}/${LABEL}`]);
  writeFileSync(agentFile, plist);
  const loaded = spawnSync('launchctl', ['bootstrap', domain, agentFile], {
    stdio: 'inherit',
  });
  if (loaded.status !== 0) process.exit(loaded.status ?? 1);
  console.log(
    `Sunto will be reinstalled on your iPhone whenever its signing has under ${THRESHOLD_DAYS} days left.\nChecks daily at 9:00 and at login. Log: ${logFile}`,
  );
}

function remove() {
  spawnSync('launchctl', ['bootout', `${domain}/${LABEL}`]);
  rmSync(agentFile, { force: true });
  console.log('Removed the Sunto auto-install job.');
}

const [command, flag] = process.argv.slice(2);
if (command === 'setup') setup();
else if (command === 'remove') remove();
else if (command === 'run') run(flag === '--force');
else {
  console.error(
    'Usage: node scripts/ios-auto-install.mjs setup | remove | run [--force]',
  );
  process.exit(1);
}

// Renders icons/*.svg into the iOS app icon set and the macOS .icns.
// Runs itself inside Electron, which supplies the SVG renderer.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url));
/** @param {string} command @param {string[]} args @param {string} [cwd] */
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!process.versions.electron) {
  run(
    'pnpm',
    ['exec', 'electron', fileURLToPath(import.meta.url)],
    join(root, 'apps/desktop'),
  );
  process.exit(0);
}
// A top-level await in an ESM entry holds back Electron's ready event.
const { app, BrowserWindow } = createRequire(import.meta.url)('electron');
/** @type {import('electron').BrowserWindow} */
let win;
/**
 * Draws an SVG at `size` pixels and returns its RGBA bytes. `mac` insets it
 * on Apple's macOS grid: an 824px rounded square with a soft shadow.
 * @param {string} name @param {number} size @param {boolean} [mac]
 */
async function draw(name, size, mac = false) {
  const svg = readFileSync(join(root, 'icons', name)).toString('base64');
  /** @type {number[]} */
  const rgba = await win.webContents
    .executeJavaScript(`new Promise((ok, fail) => {
    const img = new Image();
    img.onerror = fail;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = ${size};
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.scale(${size / 1024}, ${size / 1024});
      if (${mac}) {
        // Shadows ignore the transform, so they are scaled by hand.
        g.save();
        g.fillStyle = '#ff8a40';
        g.shadowColor = 'rgb(0 0 0 / 30%)';
        g.shadowBlur = ${(28 * size) / 1024};
        g.shadowOffsetY = ${(10 * size) / 1024};
        g.beginPath();
        g.roundRect(100, 100, 824, 824, 185);
        g.fill();
        g.restore();
        g.clip();
        g.drawImage(img, 100, 100, 824, 824);
      } else g.drawImage(img, 0, 0, 1024, 1024);
      ok(Array.from(g.getImageData(0, 0, ${size}, ${size}).data));
    };
    img.src = 'data:image/svg+xml;base64,${svg}';
  })`);
  return Buffer.from(rgba);
}
/**
 * Encodes RGBA bytes as a PNG; `opaque` drops the alpha channel, which the
 * App Store requires of the main iOS icon.
 * @param {Buffer} rgba @param {number} size @param {boolean} opaque
 */
function png(rgba, size, opaque) {
  const channels = opaque ? 3 : 4;
  const rows = Buffer.alloc(size * (size * channels + 1));
  for (let y = 0, o = 0; y < size; y++) {
    rows[o++] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      for (let c = 0; c < channels; c++) rows[o++] = rgba[i + c];
    }
  }
  /** @param {string} type @param {Buffer} data */
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  const ios = join(
    root,
    'apps/mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset',
  );
  for (const [svg, file, opaque] of /** @type {const} */ ([
    ['icon.svg', 'AppIcon.png', true],
    ['icon-dark.svg', 'AppIcon-Dark.png', false],
    ['icon-tinted.svg', 'AppIcon-Tinted.png', true],
  ]))
    writeFileSync(join(ios, file), png(await draw(svg, 1024), 1024, opaque));
  const iconset = join(root, 'apps/desktop/build/icon.iconset');
  mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    writeFileSync(
      join(iconset, `icon_${size}x${size}.png`),
      png(await draw('icon.svg', size, true), size, false),
    );
    writeFileSync(
      join(iconset, `icon_${size}x${size}@2x.png`),
      png(await draw('icon.svg', size * 2, true), size * 2, false),
    );
  }
  run('iconutil', [
    '-c',
    'icns',
    iconset,
    '-o',
    join(root, 'apps/desktop/build/icon.icns'),
  ]);
  rmSync(iconset, { recursive: true });
  app.quit();
});

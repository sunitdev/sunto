import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
const appDir = fileURLToPath(new URL('../packages/app/', import.meta.url));
const desktopDir = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const appRequire = createRequire(new URL('../packages/app/package.json', import.meta.url));
const desktopRequire = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electron = desktopRequire('electron');
const vite = spawn(process.execPath, [join(dirname(appRequire.resolve('vite/package.json')), 'bin/vite.js'), '--host', '127.0.0.1'], { cwd: appDir, stdio: 'inherit' });
/** @type {import('node:child_process').ChildProcess | undefined} */
let desktop;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  vite.kill('SIGTERM');
  desktop?.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
vite.on('error', error => { console.error(error); stop(1); });
vite.on('exit', code => { if (!stopping) stop(code || 1); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try { ready = (await fetch('http://127.0.0.1:5173', { signal: AbortSignal.timeout(500) })).ok; } catch { /* server starting */ }
    if (ready) break;
    await setTimeout(200);
  }
  if (!ready || stopping) throw new Error('Vite did not start on port 5173');
  desktop = spawn(electron, [desktopDir], { stdio: 'inherit', env: { ...process.env, SUNTO_DEV_URL: 'http://127.0.0.1:5173' } });
  desktop.on('error', error => { console.error(error); stop(1); });
  desktop.on('exit', code => stop(code ?? 1));
} catch (error) { console.error(error); stop(1); }

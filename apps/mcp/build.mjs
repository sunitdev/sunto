// Bundles the server and its dependencies into one file, so it runs with
// plain `node` from anywhere.
import { build } from 'esbuild';
import { chmodSync } from 'node:fs';
await build({
  entryPoints: [new URL('src/server.ts', import.meta.url).pathname],
  outfile: new URL('dist/server.mjs', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
  // Lets bundled CommonJS dependencies require Node's own modules.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
});
chmodSync(new URL('dist/server.mjs', import.meta.url), 0o755);

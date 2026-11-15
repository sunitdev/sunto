import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(`${root}apps/desktop/bin`, { recursive: true });
const result = spawnSync(
  "xcrun",
  [
    "swiftc",
    `${root}native/StorageCore.swift`,
    `${root}native/main.swift`,
    "-o",
    `${root}apps/desktop/bin/sunto-storage`,
    "-lsqlite3",
    "-framework",
    "AppKit",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

# Sunto

A shared React + TypeScript app with Electron for macOS and Capacitor for iOS.
The starter includes responsive navigation, a welcome screen, and system/light/dark appearance controls. Appearance is session-only. No backend or persistence is configured.

## Prerequisites

- Node.js 22.12+ (the local development baseline is recorded in `.nvmrc`).
- pnpm 12.4.2.
- macOS with Xcode 26+ and an installed iOS simulator for mobile builds.
- Internet access to npm, Electron binary downloads, and Swift package repositories.

## First run

```sh
pnpm install
pnpm dev:desktop
```

For browser-only development, run `pnpm dev:web` and open `http://127.0.0.1:5173`.
The desktop command starts Vite and Electron together and stops both when the desktop process exits or you press Ctrl+C. Port 5173 must be free.

For iOS:

```sh
pnpm ios:sync
pnpm ios:open
```

The first sync generates `apps/mobile/ios` using Capacitor's native template (Swift Package Manager), then copies the production UI into it. Later syncs rebuild the UI and update the existing project. Commit the generated native source files; bundled web assets and user-specific Xcode settings are ignored.

In Xcode, select the **App** scheme and an iPhone simulator, then Run. To use a physical device, select a development team under Signing & Capabilities and replace the provisional `com.sunto.app` identifier with one you own. Update the identifier in the Capacitor config, native Xcode target, and desktop packaging configuration together before distribution.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:web` | Shared UI development in a browser |
| `pnpm dev:desktop` | Shared UI in the Electron shell with hot refresh |
| `pnpm build:web` | Type-check and build the shared UI |
| `pnpm build:desktop` | Build UI and create a local unsigned macOS `.app` |
| `pnpm check:desktop` | Build UI, launch Electron, verify rendering and Node isolation |
| `pnpm ios:sync` | Build UI, initialize iOS if needed, and sync native assets |
| `pnpm ios:open` | Open the generated iOS project in Xcode |
| `pnpm ios:build` | Sync and build an unsigned iOS simulator app |
| `pnpm typecheck` | Check TypeScript and shell JavaScript |
| `pnpm lint` | Lint source and configuration |

The macOS package is written under `apps/desktop/release/mac*/Sunto.app`, for the host architecture. This is a local development package; distribution signing, notarization, custom icons, installers, and automatic updates are future work.
The simulator app is written under `apps/mobile/DerivedData/Build/Products/Debug-iphonesimulator/App.app`.

## Structure

- `packages/app`: the single UI implementation, Vite config, styles, and platform adapter.
- `apps/desktop`: Electron main process, sandboxed preload, and macOS packaging config.
- `apps/mobile`: Capacitor configuration and generated iOS project after first sync.
- `scripts`: development process management and repeatable iOS initialization.

Add platform-dependent capabilities to `packages/app/src/platform.ts` or adjacent adapter modules. Keep Electron/Node dependencies out of React components. For desktop capabilities, expose a narrow typed operation through preload rather than exposing IPC or filesystem access directly. For mobile, call Capacitor plugins through the same adapter boundary.

Electron uses context isolation, renderer sandboxing, disabled Node integration, blocked new windows/navigation, and denied permission requests by default. The preload currently exposes only a platform label. Production HTML restricts scripts to bundled assets; development alone allows the inline React refresh preamble. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

Capacitor's native integration follows its [Swift Package Manager workflow](https://capacitorjs.com/docs/ios/spm).

## Validation and current status

Source scaffolding is present. JavaScript syntax checks passed for the Electron shell, scripts, and ESLint config. Dependency installation could not complete in the agent sandbox because `registry.npmjs.org` could not be resolved. Offline installation also failed because required packages are absent from the cache. Therefore:

- A project dependency lockfile has not yet been generated. The first successful `pnpm install` must generate it; commit it and use `pnpm install --frozen-lockfile` thereafter.
- The iOS native project has not yet been generated.
- Type checks, lint, production builds, application launches, and visual checks have **not** been run.

To finish validation on a network-enabled machine:

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm check:desktop
pnpm build:desktop
pnpm ios:build
```

Launch the packaged macOS app directly to confirm its bundled assets load without Vite. For an automated packaged check, run its `Contents/MacOS/Sunto` executable with `--smoke-test`; exit code 0 confirms the initial heading, platform bridge, and absence of renderer Node globals.

For the simulator, use Xcode Run, or install and launch the built app using `xcrun simctl install booted apps/mobile/DerivedData/Build/Products/Debug-iphonesimulator/App.app` and `xcrun simctl launch booted com.sunto.app`.

Visually check desktop and narrow mobile layouts, no horizontal scrolling, bottom navigation, device safe areas, all three appearance settings, and navigation between Overview, Appearance, and About. Return to System appearance and verify it follows an OS appearance change. Confirm the production apps work with the web development server stopped.

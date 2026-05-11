# tr-pi

Umbrella Pi package that folds these individually published npm extensions into one installable package:

- [`pi-qq`](https://www.npmjs.com/package/pi-qq) — ask side questions in Pi without polluting the main transcript.
- [`pi-chrome`](https://www.npmjs.com/package/pi-chrome) — drive your existing logged-in Chrome from Pi.
- [`pi-linter`](https://www.npmjs.com/package/pi-linter) — inline session linter above the input bar (vague openers, scope creep, unbounded loops, …).
- [`trifecta-footer`](https://www.npmjs.com/package/trifecta-footer) — footer/statusline for model, thinking, and context.

## Operating principles

1. Each extension is its own independently published npm package.
2. Each extension package is tracked in this repo under `packages/` and wired into the umbrella through npm workspaces.
3. `tr-pi` is only an umbrella installer: it lets users install all of the extensions with one command.
4. `tr-pi` must not know or document implementation details of any individual extension. Extension-specific code, docs, skills, versioning, and release notes belong with that extension package.

## Install

Bootstrap the umbrella once:

```bash
pi install npm:tr-pi
```

Or locally while developing:

```bash
npm install
pi install /Users/tianrendong/pi-packages
```

### `/install` — interactive picker inside Pi

After the umbrella is loaded, run `/install` in any Pi session. A toggle dialog lets you pick which of the bundled extensions to install as their own pi packages (so you can later update or remove them individually):

1. Pick scope: **Global** (`~/.pi/agent/settings.json`) or **Project** (`.pi/settings.json`).
2. Toggle each package between `install` / `skip`.
3. Press Enter/Esc to apply. For each `install` entry, pi shells out to `pi install [-l] npm:<name>`.

If you previously installed individual packages and want to drop the duplicates after switching to the umbrella:

```bash
pi remove npm:pi-qq
pi remove npm:pi-chrome
pi remove npm:pi-linter
pi remove npm:trifecta-footer
```

## How this package works

`package.json` declares the three extensions as local workspace dependencies and exposes their Pi extension entrypoints through the `pi.extensions` manifest:

```json
{
  "pi": {
    "extensions": [
      "./node_modules/pi-qq/index.ts",
      "./node_modules/pi-chrome/extensions/chrome-profile-bridge/index.ts",
      "./node_modules/pi-linter/index.ts",
      "./node_modules/trifecta-footer/extensions/status-footer.ts"
    ]
  }
}
```

The dependencies are also listed in `bundledDependencies`, so if this umbrella package is packed/published, the extension packages are included in the tarball.

## Verify package contents

```bash
npm run pack:dry-run
```

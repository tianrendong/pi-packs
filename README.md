# tr-pi

Umbrella Pi package that folds these individually published npm extensions into one installable package:

- [`pi-qq`](https://www.npmjs.com/package/pi-qq) — ask side questions in Pi without polluting the main transcript.
- [`pi-chrome`](https://www.npmjs.com/package/pi-chrome) — drive your existing logged-in Chrome from Pi.
- [`trifecta-footer`](https://www.npmjs.com/package/trifecta-footer) — footer/statusline for model, thinking, and context.

## Operating principles

1. Each extension is its own independently published npm package.
2. Each extension package is tracked in this repo under `packages/` and wired into the umbrella through npm workspaces.
3. `tr-pi` is only an umbrella installer: it lets users install all of the extensions with one command.
4. `tr-pi` must not know or document implementation details of any individual extension. Extension-specific code, docs, skills, versioning, and release notes belong with that extension package.

## Install locally while developing

```bash
npm install
pi install /Users/tianrendong/pi-packages
```

Or, after publishing to npm:

```bash
pi install npm:tr-pi
```

Then remove the individual package entries if you no longer want duplicates:

```bash
pi remove npm:pi-qq
pi remove npm:pi-chrome
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

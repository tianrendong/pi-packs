# pi-packs

Umbrella Pi package that lets users install a curated set of individually published pi extensions through a single `/install` picker:

- [`pi-qq`](https://www.npmjs.com/package/pi-qq) — ask side questions in an overlay.
- [`pi-chrome`](https://www.npmjs.com/package/pi-chrome) — drive your existing Chrome profile.
- [`pi-intercom`](https://www.npmjs.com/package/pi-intercom) — message other local Pi sessions.
- [`pi-linter`](https://www.npmjs.com/package/pi-linter) — lint prompt drafts before sending.
- [`pi-bar`](https://www.npmjs.com/package/pi-bar) — show model, thinking, and context in the footer.
- [`pi-prompt-shelf`](https://www.npmjs.com/package/pi-prompt-shelf) — shelve and restore prompt drafts.
- [`pi-caveman`](https://www.npmjs.com/package/pi-caveman) — make replies terse to save tokens.
- [`pi-graphite`](https://www.npmjs.com/package/pi-graphite) — manage Graphite stacks from Pi.
- [`pi-gh-cli`](https://www.npmjs.com/package/pi-gh-cli) — drive the GitHub CLI from Pi.
- [`pi-loadout`](https://www.npmjs.com/package/pi-loadout) — manage reusable Pi setup loadouts.

## Operating principles

1. Each extension is its own independently published npm package.
2. Each extension package that's developed in-tree lives under `packages/` and is wired into the workspace through npm workspaces.
3. `pi-packs` is only an umbrella installer: it lets users install a curated set of extensions with one `/install` command.
4. `pi-packs` must not know or document implementation details of any individual extension. Extension-specific code, docs, skills, versioning, and release notes belong with that extension package.

## Install

Bootstrap the umbrella once:

```bash
pi install npm:pi-packs
```

Or locally while developing:

```bash
npm install
pi install /Users/tianrendong/pi-packs
```

### `/install` — interactive picker inside Pi

After the umbrella is loaded, run `/install` in any Pi session. A toggle dialog lets you pick which of the listed extensions to install as their own pi packages (so you can later update or remove them individually):

1. Pick scope: **Global** (`~/.pi/agent/settings.json`) or **Project** (`.pi/settings.json`).
2. All packages start selected. Use ↑/↓ to move and Space to toggle any package between `install` / `skip`.
3. Press Enter to install the selected packages, or Esc to cancel. For each `install` entry, pi first removes existing installs that would register conflicting extensions/commands (for example an old local `pi-chrome` checkout), then shells out to `pi install [-l] npm:<name>`.
4. If anything was installed, `/install` automatically reloads Pi so the new extensions are available immediately.

## Extending the picker

The list of installable packages is declared in `package.json` under the `"pi-packs"` key, decoupled from npm `dependencies` so the umbrella can advertise packages it does not bundle:

```json
{
  "pi-packs": {
    "installable": [
      { "name": "pi-qq", "description": "…" },
      { "name": "pi-chrome", "description": "…" }
    ]
  }
}
```

## How this package works

`pi-packs` exposes only its installer command through the `pi.extensions` manifest:

```json
{
  "pi": {
    "extensions": [
      "./extensions/install-command.ts"
    ]
  }
}
```

It intentionally does **not** auto-load the curated extensions. Loading bundled entrypoints here would conflict with users who already installed packages like `pi-chrome` directly. Use `/install` to install selected packages as first-class Pi packages instead.

The picker metadata lives in `package.json` under `pi-packs.installable`; the published umbrella intentionally has no package dependencies, so installing it does not install or auto-load the curated extensions.

## Verify package contents

```bash
npm run pack:dry-run
```

# pi-bar

[![npm version](https://img.shields.io/npm/v/pi-bar.svg)](https://www.npmjs.com/package/pi-bar)
[![npm downloads](https://img.shields.io/npm/dm/pi-bar.svg)](https://www.npmjs.com/package/pi-bar)

**Never accidentally run Opus on a typo again.** pi-bar puts the active model, thinking level, and context usage in pi's footer so you catch wrong-model / wrong-reasoning / context-pressure problems before they cost you.

```text
◈ claude-opus-4.7  ❯  ✦ think:med  ❯  ◷ 2.6% / 1.0M
```

![pi-bar screenshot, three rows showing green, yellow, and red context usage](https://cdn.jsdelivr.net/npm/pi-bar@0.3.0/assets/screenshot.png)

> Renamed from `trifecta-footer` at 0.3.0. If you previously installed `trifecta-footer`, run `pi remove npm:trifecta-footer && pi install npm:pi-bar`.

## Why use it?

- **See the active model at a glance** — catch accidental model switches before an expensive or sensitive task starts.
- **Track thinking level in place** — immediately notice when you are using the wrong reasoning setting.
- **Watch context pressure early** — context usage turns green, yellow, then red as you approach the limit.

pi-bar is intentionally tiny: one small extension, no broad behavior changes, and no commands to learn. It replaces pi's built-in footer with a compact model / thinking / context status line that refreshes when the model changes, thinking level changes, and after assistant turns.

## Install

```bash
pi install npm:pi-bar
```

If pi is already running after install, reload resources:

```text
/reload
```

## Customization

pi-bar works out of the box, but you can tune it with environment variables before launching pi.

### Show or hide segments

```bash
PI_BAR_SHOW=model,thinking,context pi
PI_BAR_SHOW=model,context pi
```

Allowed segments are `model`, `thinking`, and `context`.

### Change context thresholds

```bash
PI_BAR_THRESHOLDS=60,85 pi
```

The first number is the warning/yellow threshold. The second number is the danger/red threshold. Defaults are `70,90`.

### Change icon style

```bash
PI_BAR_ICONS=plain pi
PI_BAR_ICONS=emoji pi
PI_BAR_ICONS=nerdfont pi
```

Supported presets:

- `unicode` — default, e.g. `◈ gpt-5.5  ❯  ✦ think:medium  ❯  ◷ 42.7% / 272k`
- `plain` — maximum compatibility, e.g. `model:gpt-5.5 | think:medium | ctx:42.7% / 272k`
- `emoji` — colorful emoji markers, e.g. `🤖 gpt-5.5  ›  ✨ think:medium  ›  🧭 42.7% / 272k`
- `nerdfont` — icon-font glyphs for terminals configured with a Nerd Font, e.g. `󰊩 gpt-5.5  󰮱  󰉑 think:medium  󰮱  󰍛 42.7% / 272k`

## Compatibility

The default `unicode` preset uses common Unicode symbols that render well in most modern terminals. If your terminal shows boxes or misaligned glyphs, use:

```bash
PI_BAR_ICONS=plain pi
```

## Security note

Pi extensions run with your local user permissions. Review any pi package source before installing it.

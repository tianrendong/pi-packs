# trifecta-footer

[![npm version](https://img.shields.io/npm/v/trifecta-footer.svg)](https://www.npmjs.com/package/trifecta-footer)
[![npm downloads](https://img.shields.io/npm/dm/trifecta-footer.svg)](https://www.npmjs.com/package/trifecta-footer)

**Never accidentally run Opus on a typo again.** Trifecta Footer puts the active model, thinking level, and context usage in pi's footer so you catch wrong-model / wrong-reasoning / context-pressure problems before they cost you.

```text
◈ claude-opus-4.7  ❯  ✦ think:med  ❯  ◷ 2.6% / 1.0M
```

![Trifecta Footer screenshot, three rows showing green, yellow, and red context usage](https://cdn.jsdelivr.net/npm/trifecta-footer@0.2.3/assets/screenshot.png)

## Why use it?

- **See the active model at a glance** — catch accidental model switches before an expensive or sensitive task starts.
- **Track thinking level in place** — immediately notice when you are using the wrong reasoning setting.
- **Watch context pressure early** — context usage turns green, yellow, then red as you approach the limit.

Trifecta Footer is intentionally tiny: one small extension, no broad behavior changes, and no commands to learn. It replaces pi's built-in footer with a compact model / thinking / context status line that refreshes when the model changes, thinking level changes, and after assistant turns.

## Install

```bash
pi install npm:trifecta-footer
```

If pi is already running after install, reload resources:

```text
/reload
```

## Customization

Trifecta Footer works out of the box, but you can tune it with environment variables before launching pi.

### Show or hide segments

```bash
PI_TRIFECTA_SHOW=model,thinking,context pi
PI_TRIFECTA_SHOW=model,context pi
```

Allowed segments are `model`, `thinking`, and `context`.

### Change context thresholds

```bash
PI_TRIFECTA_THRESHOLDS=60,85 pi
```

The first number is the warning/yellow threshold. The second number is the danger/red threshold. Defaults are `70,90`.

### Change icon style

```bash
PI_TRIFECTA_ICONS=plain pi
PI_TRIFECTA_ICONS=emoji pi
PI_TRIFECTA_ICONS=nerdfont pi
```

Supported presets:

- `unicode` — default, e.g. `◈ gpt-5.5  ❯  ✦ think:medium  ❯  ◷ 42.7% / 272k`
- `plain` — maximum compatibility, e.g. `model:gpt-5.5 | think:medium | ctx:42.7% / 272k`
- `emoji` — colorful emoji markers, e.g. `🤖 gpt-5.5  ›  ✨ think:medium  ›  🧭 42.7% / 272k`
- `nerdfont` — icon-font glyphs for terminals configured with a Nerd Font, e.g. `󰊩 gpt-5.5  󰮱  󰉑 think:medium  󰮱  󰍛 42.7% / 272k`

## Compatibility

The default `unicode` preset uses common Unicode symbols that render well in most modern terminals. If your terminal shows boxes or misaligned glyphs, use:

```bash
PI_TRIFECTA_ICONS=plain pi
```

## Security note

Pi extensions run with your local user permissions. Review any pi package source before installing it.

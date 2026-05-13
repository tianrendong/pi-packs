# pi-chrome anti-automation test suite

Static pages that each block a different automated-interaction signal. Drive them
with the `chrome_*` tools to discover where the companion-extension's synthetic
events still look like a bot, and to verify any humanization fixes.

## Run

```bash
cd test-suite
python3 -m http.server 8765
# open http://127.0.0.1:8765/ in the Chrome window pi-chrome controls
```

Each challenge page exposes:

- `window.__challenge` — short id
- `window.__verdict` — `"PENDING" | "PASS" | "FAIL"`
- `window.__reason` — array of strings, why it failed (or how it passed)
- `window.__events` — raw event log for forensics

`PASS` means the page believes a real human did the thing.
`FAIL` means the page caught the automation.

## Aggregate runner

`index.html` lists every challenge, loads each one in an iframe, lets you (or
the agent) drive the interaction, and tallies verdicts.

Recommended agent flow:

1. `chrome_navigate` to `http://127.0.0.1:8765/`.
2. For each challenge link, open it, run the listed interaction with the
   `chrome_*` tools, then read `window.__verdict` / `window.__reason` via
   `chrome_evaluate`.
3. Compare against the manual baseline (do the same interaction by hand and
   confirm `PASS`).

## Challenges

| id | file | what it blocks |
|----|------|----------------|
| `is-trusted-click` | `challenges/01-is-trusted-click.html` | click handler ignores `event.isTrusted === false` |
| `is-trusted-keyboard` | `challenges/02-is-trusted-keyboard.html` | input rejects if `keydown.isTrusted` false |
| `webdriver-flag` | `challenges/03-webdriver-flag.html` | `navigator.webdriver` truthy / Chrome runtime quirks |
| `mouse-entropy` | `challenges/04-mouse-entropy.html` | requires organic mousemove path before click |
| `event-timing` | `challenges/05-event-timing.html` | rejects when pointerdown→pointerup gap < N ms or always-equal |
| `click-coordinates` | `challenges/06-click-coordinates.html` | rejects clicks that land on exact element center |
| `pointer-properties` | `challenges/07-pointer-properties.html` | demands pressure / non-zero movementX/Y / pointerId variety |
| `keyboard-cadence` | `challenges/08-keyboard-cadence.html` | rejects same-tick `keydown`/`keyup` and missing per-char events |
| `composition-input` | `challenges/09-composition-input.html` | listens for native `keydown` + `keypress` + `input` sequence |
| `user-activation` | `challenges/10-user-activation.html` | feature gates: clipboard.writeText, fullscreen |
| `honeypot` | `challenges/11-honeypot.html` | hidden field must stay empty |
| `fingerprint` | `challenges/12-fingerprint.html` | UA-CH, languages, plugins, permissions consistency |
| `focus-order` | `challenges/13-focus-order.html` | requires `pointerdown`-driven focus, not direct `.focus()` |
| `wheel-scroll` | `challenges/14-wheel-scroll.html` | rejects scrollTop jumps without `wheel`/`scroll` events |
| `drag-drop-datatransfer` | `challenges/15-drag-drop-datatransfer.html` | requires full HTML5 drag cycle with populated `DataTransfer` |
| `contenteditable-selection` | `challenges/16-contenteditable-selection.html` | requires `selectionchange` + monotonic caret advance per keystroke |
| `paste-clipboard` | `challenges/17-paste-clipboard.html` | demands real OS paste with `clipboardData` + `inputType=insertFromPaste` |
| `native-select` | `challenges/18-native-select.html` | rejects `<option>` clicks / `.value=` assignment; needs trusted picker change |
| `hover-dwell` | `challenges/19-hover-dwell.html` | reveal gated on ≥600ms hover with pointermove activity, latency after reveal |
| `react-value-tracker` | `challenges/20-react-value-tracker.html` | input must mutate via native `value` setter so React's `_valueTracker` is stale |
| `keyboard-modifiers` | `challenges/21-keyboard-modifiers.html` | Shift+a chord: modifier ordering, `shiftKey`, `code=KeyA`, `getModifierState` |
| `touch-events` | `challenges/22-touch-events.html` | real `TouchEvent`+`Touch` (radius, force) — synthetic pointerType=touch fails |
| `stack-trace-fingerprint` | `challenges/23-stack-trace-fingerprint.html` | inspects handler call stack for extension/eval/Runtime.evaluate frames |
| `viewport-edge-clicks` | `challenges/24-viewport-edge-clicks.html` | rejects pointer events with clientX/Y outside viewport or (0,0) default |
| `pointer-continuity` | `challenges/25-pointer-continuity.html` | two clicks far apart need bridging pointermoves with mid-span samples |
| `mousemove-rate` | `challenges/26-mousemove-rate.html` | mousemove Δt distribution must match ~60–250Hz with jitter |
| `scroll-momentum` | `challenges/27-scroll-momentum.html` | wheel ΔY trace must show peak + decaying momentum tail ≥100ms |
| `intersection-visibility` | `challenges/28-intersection-visibility.html` | IntersectionObserver gradient + rAF scroll frames — no teleport |

## What each `PASS` would require in `service_worker.js`

See `notes/bypass-ideas.md`.

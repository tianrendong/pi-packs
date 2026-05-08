# pi-qq

[![npm version](https://img.shields.io/npm/v/pi-qq.svg)](https://www.npmjs.com/package/pi-qq)
[![npm downloads](https://img.shields.io/npm/dm/pi-qq.svg)](https://www.npmjs.com/package/pi-qq)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

![pi-qq bottom overlay answering a quick question](https://raw.githubusercontent.com/jennyyu212/pi-qq-assets/main/assets/pi-qq-preview.png)

Ask quick side questions about your current [pi](https://pi.dev) session without polluting the main transcript.

```text
You: refactor this auth flow…
agent: [making changes]
You (alt+q): is there a reason we're not using the existing AuthClient?
↳ overlay: Yes — AuthClient does X, but this path needs Y because…
You: [keeps editing, transcript untouched]
```

`pi-qq` adds `/qq <question>` plus an **alt+q** / **Option+Q** shortcut that toggles `/qq ` in the editor. Answers appear in a dismissible bottom overlay, can be reopened from in-memory `/qq-history`, and never enter the main conversation.

## Try these first

```text
/qq is this safe to merge?
/qq why are we doing it this way and not X?
/qq summarize what's happened so far
/qq what's the risk in this plan?
/qq what files have we touched this session?
/qq --recent did the last tool call succeed?
/qq --full what decisions have we made so far?
```

## Why try it?

- **A real side channel:** ask `/qq why are we changing this file?` while the main agent keeps working. The answer shows in a bottom overlay and does not enter the main transcript.
- **Context-aware, intentionally constrained:** `/qq` passes read-only main-session context, treats ambiguous references like “this”, “that”, “we”, and “the plan” as references to the active session, and gives the side call no tools. Previous `/qq` answers are available only through `/qq-history`; they are not fed back into future `/qq` calls.
- **Fast, low-friction UX:** press **alt+q** / **Option+Q** to toggle `/qq `, then use **Esc** to cancel/dismiss or **↑/↓** to scroll longer answers.
- **Smart context modes:** `/qq` uses recent context by default, automatically switches to broader bounded context for retrospective questions, and supports explicit `--recent` / `--full` modes.

## Demo

```text
/qq why are we changing this file?
```

`pi-qq` answers from the active session context in a bottom overlay, without adding either the question or answer to your main conversation.

Another common flow:

1. Press **alt+q** / **Option+Q**.
2. Type `what's the risk with this plan?`.
3. Hit Enter.
4. Read the concise overlay answer; press **Esc** to dismiss. If you close it too soon, run `/qq-history` to reopen recent answers.

## Install

```bash
pi install npm:pi-qq
```

After installing, run `/reload` in pi or restart the session.

## Usage

### Command

```text
/qq <question>
/qq --recent <question>
/qq --full <question>
/qq-history
```

By default, `/qq` chooses a context mode automatically:

| Mode | When to use it | Context sent |
| --- | --- | --- |
| Auto | Default for `/qq <question>` | Recent context for immediate questions, broader bounded context for retrospective questions |
| `--recent` | Fastest answers about the latest work | Latest messages only |
| `--full` | Recaps or questions about earlier decisions | Broader but still bounded session context, not unlimited history |

Use `/qq-history` to reopen recent `/qq` answers from the current session. History is view-only and is not included as context for future `/qq` model calls.

### Shortcut

Press **alt+q** / **Option+Q** to toggle `/qq ` at the front of the editor:

- If the editor does not start with `/qq `, the prefix is prepended.
- If the editor already starts with `/qq `, the prefix is removed.

### Overlay keys

| Key | Action |
| --- | --- |
| `↑` / `↓` | Scroll the panel when content overflows |
| `Esc` | Close the panel; cancel the request if it is still running |

## Design constraints

- The main transcript is never polluted by `/qq` questions or answers.
- The side call receives read-only main-session context.
- Recent mode sends only the latest messages for speed; full mode sends broader but still bounded context, not unlimited history.
- Large text parts are clipped; images, tool calls, and tool results are converted into plain-text background so the side call never uses provider tool protocol.
- The side call has no tools.
- Recent `/qq` answers are kept in memory only so `/qq-history` can reopen them after dismissal.
- `/qq-history` is view-only; it is not used as context for future `/qq` model calls.
- The system prompt biases answers toward concise, direct responses.

## License

MIT

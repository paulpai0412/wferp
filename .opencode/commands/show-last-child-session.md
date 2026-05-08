---
description: Show the latest continuation child session and how to open it
agent: build
subtask: false
---

Read `.opencode/runtime/new-session-result.json`.

Report these fields when present:
- `status`
- `title`
- `reason`
- `parentSessionID`
- `childSessionID`
- `recordedAt`
- `tuiResumeCommand`
- `cliOpenCommand`
- `recommendedAction`
- `error`

If `status` is `success`, tell me exactly how to inspect the child session:
1. In OpenCode TUI, run `/sessions` and switch to `childSessionID`.
2. Or run `cliOpenCommand` from a shell.
3. In this repo's OpenCode TUI, run `/open-last-child-session` to jump directly to `childSessionID`.

If `status` is `error`, explain that no child session is available yet and include the recorded error.

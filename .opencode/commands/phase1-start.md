---
description: Start the Phase 1 orchestrator compact-first flow for a selected AFK issue packet
agent: build
subtask: false
---

Run the Phase 1 orchestrator compact-first runner for issue packet `$ARGUMENTS`.

1. Execute:
!`python3 scripts/phase1_orchestrator_runner.py --issue-packet $ARGUMENTS`
2. Read `docs/agents/runtime/context-checkpoint.yaml` after the runner updates it.
3. Tell me the checkpoint update result and the immediate next action.
4. Remind me to run `/compact` in the current orchestrator session before continuing `per_issue_flow`.

Do not start worker execution yet. Stop after reporting the runner output and the required `/compact` reminder.

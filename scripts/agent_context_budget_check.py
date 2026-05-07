#!/usr/bin/env python3
"""Validate autonomous workflow context-budget artifact caps."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LINE_CAPS = {
    "docs/agents/issue-packet-template.yaml": 80,
    "docs/agents/worker-result-template.yaml": 80,
    "docs/agents/evidence-packet-template.yaml": 60,
    "docs/agents/runtime/context-checkpoint.yaml": 80,
    "docs/agents/issue-packets/issue-16.yaml": 80,
    "docs/agents/issue-packets/issue-20.yaml": 80,
    "docs/agents/evidence/issue-2-pr-8.yaml": 60,
    "docs/agents/worker-results/issue-20.yaml": 80,
    "docs/agents/handoffs/issue-2.yaml": 35,
    "docs/agents/handoffs/issue-16.yaml": 35,
    "docs/agents/handoffs/issue-20.yaml": 35,
}

REQUIRED_TEXT = {
    "docs/agents/autonomous-development-workflow.yaml": [
        "checkpoint_warning_at_percent: 45",
        "stop_and_rotate_at_percent: 50",
        "checkpoint_only_cross_session_resume: true",
        "release_worker_policy:",
        "human_merge_approval_policy_satisfied",
        "main_agent_contract_validation_only:",
        "main_agent_direct_issue_or_phase_qa",
        "script_gate: scripts/agent_context_budget_check.py",
    ],
    "docs/agents/runtime/context-checkpoint.yaml": [
        "kind: context_checkpoint",
        "warning_at_percent: 45",
        "stop_and_rotate_at_percent: 50",
        "checkpoint_only_cross_session_resume: true",
        "do_not_import_full_prior_transcript: true",
        "artifact_bundle:",
    ],
    "docs/agents/issue-tracker.md": [
        "release_worker",
        "verifier-owned evidence packet",
        "human merge approval",
    ],
}


def rel(path: str) -> Path:
    return ROOT / path


def line_count(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def main() -> int:
    failures: list[str] = []

    for artifact, cap in LINE_CAPS.items():
        path = rel(artifact)
        if not path.exists():
            failures.append(f"missing: {artifact}")
            continue
        count = line_count(path)
        if count > cap:
            failures.append(f"over cap: {artifact} has {count} lines > {cap}")

    for artifact, required_strings in REQUIRED_TEXT.items():
        path = rel(artifact)
        if not path.exists():
            failures.append(f"missing: {artifact}")
            continue
        text = path.read_text(encoding="utf-8")
        for required in required_strings:
            if required not in text:
                failures.append(f"missing text in {artifact}: {required}")

    if failures:
        print("context budget gate: fail")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("context budget gate: pass")
    print(f"checked {len(LINE_CAPS)} caps and {len(REQUIRED_TEXT)} policy files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

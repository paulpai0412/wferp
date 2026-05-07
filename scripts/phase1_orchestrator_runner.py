#!/usr/bin/env python3
"""Run the Phase 1 orchestrator compact-first flow for a selected AFK issue."""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from scripts.phase1_compact_payload import (
    DEFAULT_CHECKPOINT_PATH,
    DEFAULT_WORKFLOW_POLICY_PATH,
    derive_compact_payload,
    parse_checkpoint_text,
    write_checkpoint_file,
)


ROOT = Path(__file__).resolve().parents[1]


@dataclass
class IssuePacketRecord:
    issue_number: str
    branch: str
    issue_packet_path: str
    prior_handoff: str


@dataclass
class RunnerResult:
    checkpoint_path: Path
    issue_number: str
    branch: str
    immediate_next_action: str
    compact_command: str | None
    compact_ran: bool


def _parse_scalar(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if value.startswith('"') and value.endswith('"'):
        loaded = cast(object, json.loads(value))
        return loaded if isinstance(loaded, str) else str(loaded)
    return value


def _extract_inline_mapping_value(text: str, prefix: str, key: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            body = stripped.split("{", 1)[1].rsplit("}", 1)[0]
            parts = [part.strip() for part in body.split(",")]
            for part in parts:
                if ":" not in part:
                    continue
                found_key, value = part.split(":", 1)
                if found_key.strip() == key:
                    return _parse_scalar(value)
    raise ValueError(f"missing {key!r} in inline mapping {prefix!r}")


def _extract_nested_scalar(text: str, block_name: str, nested_key: str) -> str:
    in_block = False
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent == 0 and stripped == f"{block_name}:":
            in_block = True
            continue
        if in_block and indent == 0:
            break
        if in_block and indent == 2 and stripped.startswith(f"{nested_key}:"):
            _, value = stripped.split(":", 1)
            return _parse_scalar(value)
    raise ValueError(f"missing nested scalar {nested_key!r} in block {block_name!r}")


def parse_issue_packet_text(text: str, issue_packet_path: str) -> IssuePacketRecord:
    issue_number = _extract_nested_scalar(text, "issue", "number")
    branch = _extract_inline_mapping_value(text, "branch:", "name")
    prior_handoff = _extract_nested_scalar(text, "bootstrap_context", "prior_handoff")
    return IssuePacketRecord(
        issue_number=issue_number,
        branch=branch,
        issue_packet_path=issue_packet_path,
        prior_handoff="" if prior_handoff == "none" else prior_handoff,
    )


def _normalize_issue_packet_ref(issue_packet_path: Path) -> str:
    if not issue_packet_path.is_absolute():
        return str(issue_packet_path)
    try:
        return str(issue_packet_path.relative_to(ROOT))
    except ValueError:
        return str(issue_packet_path)


def run_phase1(
    *,
    issue_packet_path: Path,
    checkpoint_path: Path,
    workflow_policy_path: str = DEFAULT_WORKFLOW_POLICY_PATH,
    compact_command: str | None = None,
    updated_at: str | None = None,
) -> RunnerResult:
    issue_packet = parse_issue_packet_text(
        issue_packet_path.read_text(encoding="utf-8"),
        _normalize_issue_packet_ref(issue_packet_path),
    )

    _ = write_checkpoint_file(
        checkpoint_path,
        issue_number=issue_packet.issue_number,
        branch=issue_packet.branch,
        role="main_orchestrator",
        issue_packet=issue_packet.issue_packet_path,
        handoff=issue_packet.prior_handoff,
        workflow_policy_path=workflow_policy_path,
        updated_at=updated_at,
    )

    checkpoint_record = parse_checkpoint_text(checkpoint_path.read_text(encoding="utf-8"))
    payload = derive_compact_payload(checkpoint_record, workflow_policy_path=workflow_policy_path)

    compact_ran = False
    if compact_command:
        completed = subprocess.run(compact_command, shell=True, cwd=ROOT, check=False, text=True)
        if completed.returncode != 0:
            raise RuntimeError(f"compact command failed with exit code {completed.returncode}: {compact_command}")
        compact_ran = True

    return RunnerResult(
        checkpoint_path=checkpoint_path,
        issue_number=issue_packet.issue_number,
        branch=issue_packet.branch,
        immediate_next_action=payload["immediate_next_action"],
        compact_command=compact_command,
        compact_ran=compact_ran,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    _ = parser.add_argument("--issue-packet", required=True, help="Path to the selected AFK issue packet")
    _ = parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT_PATH), help="Path to context-checkpoint.yaml")
    _ = parser.add_argument(
        "--workflow-policy-path",
        default=DEFAULT_WORKFLOW_POLICY_PATH,
        help="Canonical workflow policy ref for authoritative_refs",
    )
    _ = parser.add_argument(
        "--compact-command",
        help="Optional shell command to invoke the actual compact step after checkpoint update",
    )
    _ = parser.add_argument("--updated-at", help="Fixed timestamp for deterministic updates")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    issue_packet_path = Path(cast(str, args.issue_packet))
    checkpoint_path = Path(cast(str, args.checkpoint))

    try:
        result = run_phase1(
            issue_packet_path=issue_packet_path,
            checkpoint_path=checkpoint_path,
            workflow_policy_path=cast(str, args.workflow_policy_path),
            compact_command=cast(str | None, args.compact_command),
            updated_at=cast(str | None, args.updated_at),
        )
    except (ValueError, RuntimeError) as error:
        print(f"ERROR: {error}")
        return 1

    print(f"phase1 runner: updated checkpoint {result.checkpoint_path}")
    if result.compact_ran:
        print(f"phase1 runner: compact command succeeded for issue #{result.issue_number}")
    else:
        print("phase1 runner: compact command not provided; run /compact manually in the orchestrator session")
    print(f"phase1 runner: next action -> {result.immediate_next_action}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

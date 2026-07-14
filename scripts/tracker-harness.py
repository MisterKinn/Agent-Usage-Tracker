#!/usr/bin/env python3
"""Run an isolated, cross-platform parser harness for the local tracker."""

from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
import tempfile
from argparse import Namespace
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TRACKER_PATH = ROOT / "public" / "tracker" / "track_agent_usage.py"
THREAD_ID = "019f5539-c52a-7053-a021-c9660d389089"
LEGACY_THREAD_ID = "019f5524-abfe-71f0-bd0e-65bb0cd7ff51"


def load_tracker_module():
    spec = importlib.util.spec_from_file_location("tracker_under_test", TRACKER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load tracker module: {TRACKER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def assert_equal(label: str, actual, expected) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")
    print(f"PASS  {label}")


def write_sqlite_fixture(path: Path, timestamp: int) -> None:
    response = {
        "type": "response.completed",
        "response": {
            "id": "resp-legacy-harness",
            "created_at": timestamp,
            "completed_at": timestamp,
            "usage": {
                "input_tokens": 100,
                "input_tokens_details": {"cached_tokens": 20},
                "output_tokens": 25,
                "output_tokens_details": {"reasoning_tokens": 5},
                "total_tokens": 125,
            },
        },
    }
    connection = sqlite3.connect(path)
    try:
        connection.execute(
            "CREATE TABLE logs (id INTEGER, ts INTEGER, target TEXT, feedback_log_body TEXT)"
        )
        connection.execute(
            "INSERT INTO logs VALUES (?, ?, ?, ?)",
            (1, timestamp - 1, "codex_core::stream_events_utils", f"thread.id={LEGACY_THREAD_ID}"),
        )
        connection.execute(
            "INSERT INTO logs VALUES (?, ?, ?, ?)",
            (
                2,
                timestamp,
                "log",
                f"Received message {json.dumps(response, separators=(',', ':'))}",
            ),
        )
        connection.commit()
    finally:
        connection.close()


def write_rollout_fixture(path: Path, start: datetime) -> None:
    def token_row(timestamp: datetime, total: int, cached: int, output: int, reasoning: int):
        return {
            "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
            "type": "event_msg",
            "payload": {
                "type": "token_count",
                "info": {
                    "total_token_usage": {
                        "input_tokens": total - output,
                        "cached_input_tokens": cached,
                        "output_tokens": output,
                        "reasoning_output_tokens": reasoning,
                        "total_tokens": total,
                    }
                },
            },
        }

    rows = [
        token_row(start - timedelta(seconds=40), 1098, 500, 99, 10),
        {"timestamp": start.isoformat().replace("+00:00", "Z"), "type": "turn_context", "payload": {"cwd": "C:\\Users\\tester\\project-a"}},
        token_row(start + timedelta(seconds=1), 1218, 550, 119, 15),
        {"timestamp": (start + timedelta(seconds=2)).isoformat().replace("+00:00", "Z"), "type": "turn_context", "payload": {"cwd": "/Users/tester/project-b"}},
        token_row(start + timedelta(seconds=3), 1438, 650, 139, 20),
    ]
    path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    tracker = load_tracker_module()
    with tempfile.TemporaryDirectory(prefix="agent-tracker-harness-") as temp_dir:
        fixture_root = Path(temp_dir)
        db_path = fixture_root / "logs_2.sqlite"
        session_index = fixture_root / "session_index.jsonl"
        sessions_dir = fixture_root / "sessions" / "2026" / "07" / "14"
        sessions_dir.mkdir(parents=True)

        now = datetime.now(timezone.utc).replace(microsecond=0)
        legacy_timestamp = int((now - timedelta(seconds=30)).timestamp())
        write_sqlite_fixture(db_path, legacy_timestamp)
        session_index.write_text(
            json.dumps({"id": THREAD_ID, "thread_name": "harness project"}) + "\n",
            encoding="utf-8",
        )
        rollout_path = sessions_dir / f"rollout-2026-07-14T12-00-00-{THREAD_ID}.jsonl"
        write_rollout_fixture(rollout_path, now)

        args = Namespace(
            name="Harness User",
            owner_id="owner-harness",
            codex_db=str(db_path),
            codex_session_index=str(session_index),
            codex_sessions_dir=str(fixture_root / "sessions"),
        )

        legacy_events = tracker.parse_codex_events(args)
        assert_equal("legacy SQLite event detected", len(legacy_events), 1)
        cutoff = max(tracker.parse_iso_to_seconds(item["completedAt"]) for item in legacy_events)
        rollout_events = tracker.parse_codex_rollout_events(args, cutoff)
        assert_equal("new Codex rollout events detected", len(rollout_events), 2)
        assert_equal(
            "cumulative rollout usage converted to deltas",
            sum(item["totalTokens"] for item in rollout_events),
            340,
        )
        assert_equal(
            "cached tokens preserved",
            sum(item["cachedTokens"] for item in rollout_events),
            150,
        )
        assert_equal(
            "legacy and rollout totals combine once",
            sum(item["totalTokens"] for item in legacy_events + rollout_events),
            465,
        )

        summaries = tracker.summarize_events(legacy_events + rollout_events)
        assert_equal("daily summary remains one Codex row", len(summaries), 1)
        assert_equal("daily summary event count", summaries[0]["events"], 3)
        assert_equal("daily summary session count", summaries[0]["sessions"], 2)

    print("PASS  isolated fixture cleanup")
    print("\nTracker harness passed: parser, rollout deltas, dedupe boundary, and summaries are healthy.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL  {error}", file=sys.stderr)
        raise SystemExit(1)

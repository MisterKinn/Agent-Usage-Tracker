from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


THREAD_RE = re.compile(r"thread(?:\.id|_id)=([0-9a-f-]{36})")


@dataclass
class UsageEvent:
    event_ts: int
    response_id: str
    thread_id: str
    thread_name: str
    owner: str
    input_tokens: int
    cached_tokens: int
    output_tokens: int
    reasoning_tokens: int
    total_tokens: int
    created_at: int
    completed_at: int

    @property
    def date(self) -> str:
        return datetime.fromtimestamp(self.event_ts, tz=UTC).astimezone().strftime("%Y-%m-%d")

    @property
    def completed_at_iso(self) -> str:
        return datetime.fromtimestamp(self.completed_at, tz=UTC).astimezone().isoformat(
            timespec="seconds"
        )


def parse_args() -> argparse.Namespace:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Extract per-user Codex token usage from local Codex logs."
    )
    parser.add_argument(
        "--logs-db",
        type=Path,
        default=Path.home() / ".codex" / "logs_2.sqlite",
        help="Path to Codex SQLite log database.",
    )
    parser.add_argument(
        "--session-index",
        type=Path,
        default=Path.home() / ".codex" / "session_index.jsonl",
        help="Path to Codex session index JSONL.",
    )
    parser.add_argument(
        "--owners",
        type=Path,
        default=base_dir / "input" / "session_owners.csv",
        help="CSV file mapping thread_id to owner name.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=base_dir / "output",
        help="Directory for generated report files.",
    )
    parser.add_argument(
        "--lookback-seconds",
        type=int,
        default=30,
        help="How far back to search for the nearest thread marker.",
    )
    return parser.parse_args()


def load_session_names(path: Path) -> dict[str, str]:
    names: dict[str, str] = {}
    if not path.exists():
        return names

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        thread_id = item.get("id")
        thread_name = item.get("thread_name", "")
        if thread_id:
            names[thread_id] = thread_name
    return names


def load_owner_map(path: Path) -> dict[str, str]:
    owners: dict[str, str] = {}
    if not path.exists():
        return owners

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            thread_id = (row.get("thread_id") or "").strip()
            owner = (row.get("owner") or "").strip()
            if thread_id and owner:
                owners[thread_id] = owner
    return owners


def read_rows(db_path: Path) -> list[tuple[int, int, str, str | None]]:
    query = """
        SELECT id, ts, target, feedback_log_body
        FROM logs
        WHERE target = 'codex_core::stream_events_utils'
           OR (
                target = 'log'
                AND (
                    feedback_log_body LIKE '%"type":"response.completed"%'
                    OR feedback_log_body LIKE '%thread_id=%'
                    OR feedback_log_body LIKE '%thread.id=%'
                )
           )
        ORDER BY id ASC
    """
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        cursor = connection.execute(query)
        return list(cursor.fetchall())
    finally:
        connection.close()


def nearest_thread_id(
    recent_threads: deque[tuple[int, str]],
    event_ts: int,
    lookback_seconds: int,
) -> str:
    best_match = ""
    for ts, thread_id in reversed(recent_threads):
        if event_ts - ts > lookback_seconds:
            break
        best_match = thread_id
        break
    return best_match


def parse_usage_events(
    rows: list[tuple[int, int, str, str | None]],
    session_names: dict[str, str],
    owners: dict[str, str],
    lookback_seconds: int,
) -> list[UsageEvent]:
    events: list[UsageEvent] = []
    recent_threads: deque[tuple[int, str]] = deque(maxlen=200)

    for _, ts, target, body in rows:
        match = THREAD_RE.search(body or "")
        if match:
            recent_threads.append((ts, match.group(1)))

        if target == "codex_core::stream_events_utils":
            continue

        if not body or '"type":"response.completed"' not in body or '"usage":{' not in body:
            continue

        prefix = "Received message "
        if not body.startswith(prefix):
            continue

        payload = json.loads(body[len(prefix) :])
        response = payload.get("response", {})
        usage = response.get("usage") or {}
        if not usage:
            continue

        thread_id = nearest_thread_id(recent_threads, ts, lookback_seconds)
        thread_name = session_names.get(thread_id, "")
        owner = owners.get(thread_id, "unassigned")

        events.append(
            UsageEvent(
                event_ts=ts,
                response_id=response.get("id", ""),
                thread_id=thread_id,
                thread_name=thread_name,
                owner=owner,
                input_tokens=int(usage.get("input_tokens", 0) or 0),
                cached_tokens=int(
                    (usage.get("input_tokens_details") or {}).get("cached_tokens", 0) or 0
                ),
                output_tokens=int(usage.get("output_tokens", 0) or 0),
                reasoning_tokens=int(
                    (usage.get("output_tokens_details") or {}).get("reasoning_tokens", 0) or 0
                ),
                total_tokens=int(usage.get("total_tokens", 0) or 0),
                created_at=int(response.get("created_at", ts) or ts),
                completed_at=int(response.get("completed_at", ts) or ts),
            )
        )

    return events


def write_usage_events(path: Path, events: list[UsageEvent]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "date",
                "owner",
                "thread_id",
                "thread_name",
                "response_id",
                "input_tokens",
                "cached_tokens",
                "output_tokens",
                "reasoning_tokens",
                "total_tokens",
                "created_at",
                "completed_at",
            ]
        )
        for event in events:
            writer.writerow(
                [
                    event.date,
                    event.owner,
                    event.thread_id,
                    event.thread_name,
                    event.response_id,
                    event.input_tokens,
                    event.cached_tokens,
                    event.output_tokens,
                    event.reasoning_tokens,
                    event.total_tokens,
                    event.created_at,
                    event.completed_at,
                ]
            )


def summarize_events(events: list[UsageEvent]) -> list[dict[str, int | str]]:
    grouped: dict[str, dict[str, int | str]] = defaultdict(
        lambda: {
            "owner": "",
            "events": 0,
            "threads": set(),
            "input_tokens": 0,
            "cached_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
            "total_tokens": 0,
        }
    )

    for event in events:
        item = grouped[event.owner]
        item["owner"] = event.owner
        item["events"] = int(item["events"]) + 1
        cast_threads = item["threads"]
        assert isinstance(cast_threads, set)
        cast_threads.add(event.thread_id or "(missing)")
        item["input_tokens"] = int(item["input_tokens"]) + event.input_tokens
        item["cached_tokens"] = int(item["cached_tokens"]) + event.cached_tokens
        item["output_tokens"] = int(item["output_tokens"]) + event.output_tokens
        item["reasoning_tokens"] = int(item["reasoning_tokens"]) + event.reasoning_tokens
        item["total_tokens"] = int(item["total_tokens"]) + event.total_tokens

    summary_rows: list[dict[str, int | str]] = []
    for item in grouped.values():
        threads = item.pop("threads")
        assert isinstance(threads, set)
        item["threads"] = len(threads)
        summary_rows.append(item)

    summary_rows.sort(key=lambda row: int(row["total_tokens"]), reverse=True)
    return summary_rows


def write_owner_summary(path: Path, rows: list[dict[str, int | str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "owner",
                "events",
                "threads",
                "input_tokens",
                "cached_tokens",
                "output_tokens",
                "reasoning_tokens",
                "total_tokens",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row["owner"],
                    row["events"],
                    row["threads"],
                    row["input_tokens"],
                    row["cached_tokens"],
                    row["output_tokens"],
                    row["reasoning_tokens"],
                    row["total_tokens"],
                ]
            )


def summarize_unassigned_threads(events: list[UsageEvent]) -> list[dict[str, int | str]]:
    grouped: dict[str, dict[str, int | str]] = {}
    for event in events:
        if event.owner != "unassigned":
            continue

        key = event.thread_id or "(missing)"
        item = grouped.setdefault(
            key,
            {
                "thread_id": key,
                "thread_name": event.thread_name or "(unknown)",
                "events": 0,
                "total_tokens": 0,
                "last_completed_at": event.completed_at_iso,
            },
        )
        item["events"] = int(item["events"]) + 1
        item["total_tokens"] = int(item["total_tokens"]) + event.total_tokens
        if event.completed_at_iso > str(item["last_completed_at"]):
            item["last_completed_at"] = event.completed_at_iso
        if event.thread_name and item["thread_name"] == "(unknown)":
            item["thread_name"] = event.thread_name

    rows = list(grouped.values())
    rows.sort(key=lambda row: (str(row["last_completed_at"]), int(row["total_tokens"])), reverse=True)
    return rows


def write_unassigned_threads(path: Path, rows: list[dict[str, int | str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["thread_id", "thread_name", "events", "total_tokens", "last_completed_at"])
        for row in rows:
            writer.writerow(
                [
                    row["thread_id"],
                    row["thread_name"],
                    row["events"],
                    row["total_tokens"],
                    row["last_completed_at"],
                ]
            )


def format_number(value: int) -> str:
    return f"{value:,}"


def write_report(path: Path, summary_rows: list[dict[str, int | str]], events: list[UsageEvent]) -> None:
    total_tokens = sum(event.total_tokens for event in events)
    total_events = len(events)
    recent_unassigned = summarize_unassigned_threads(events)[:10]

    lines = [
        "# Codex Usage Report",
        "",
        f"- generated_at: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- usage_events: {total_events}",
        f"- total_tokens: {format_number(total_tokens)}",
        "",
        "## Owner Summary",
        "",
        "| owner | events | threads | total_tokens | input_tokens | output_tokens | cached_tokens |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]

    if summary_rows:
        for row in summary_rows:
            lines.append(
                "| {owner} | {events} | {threads} | {total_tokens} | {input_tokens} | {output_tokens} | {cached_tokens} |".format(
                    owner=row["owner"],
                    events=row["events"],
                    threads=row["threads"],
                    total_tokens=format_number(int(row["total_tokens"])),
                    input_tokens=format_number(int(row["input_tokens"])),
                    output_tokens=format_number(int(row["output_tokens"])),
                    cached_tokens=format_number(int(row["cached_tokens"])),
                )
            )
    else:
        lines.append("| no-data | 0 | 0 | 0 | 0 | 0 | 0 |")

    lines.extend(
        [
            "",
            "## Recent Unassigned Threads",
            "",
            "| completed_at | thread_id | thread_name | total_tokens |",
            "|---|---|---|---:|",
        ]
    )

    if recent_unassigned:
        for event in recent_unassigned:
            lines.append(
                f"| {event['last_completed_at']} | {event['thread_id']} | {event['thread_name']} | {format_number(int(event['total_tokens']))} |"
            )
    else:
        lines.append("| none | - | - | 0 |")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()

    if not args.logs_db.exists():
        raise SystemExit(f"Codex log DB not found: {args.logs_db}")

    args.output_dir.mkdir(parents=True, exist_ok=True)

    session_names = load_session_names(args.session_index)
    owners = load_owner_map(args.owners)
    rows = read_rows(args.logs_db)
    events = parse_usage_events(rows, session_names, owners, args.lookback_seconds)
    summary_rows = summarize_events(events)
    unassigned_rows = summarize_unassigned_threads(events)

    write_usage_events(args.output_dir / "usage_events.csv", events)
    write_owner_summary(args.output_dir / "owner_summary.csv", summary_rows)
    write_unassigned_threads(args.output_dir / "unassigned_threads.csv", unassigned_rows)
    write_report(args.output_dir / "report.md", summary_rows, events)

    print(f"Generated {len(events)} usage events in {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

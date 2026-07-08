from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="List and assign Codex session owners from local session logs."
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

    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="List sessions from session_index.jsonl.")
    list_parser.add_argument("--limit", type=int, default=20, help="How many recent sessions to show.")
    list_parser.add_argument(
        "--only-unassigned",
        action="store_true",
        help="Show only sessions not mapped in session_owners.csv.",
    )

    assign_parser = subparsers.add_parser("assign", help="Assign one session to one owner.")
    assign_parser.add_argument("--thread-id", required=True, help="Session thread_id to assign.")
    assign_parser.add_argument("--owner", required=True, help="Owner name to save.")
    assign_parser.add_argument("--notes", default="", help="Optional note for session_owners.csv.")

    latest_parser = subparsers.add_parser(
        "assign-latest",
        help="Assign the most recent unassigned sessions to one owner.",
    )
    latest_parser.add_argument("--owner", required=True, help="Owner name to save.")
    latest_parser.add_argument("--count", type=int, default=1, help="How many recent sessions to assign.")
    latest_parser.add_argument("--notes", default="", help="Optional note for session_owners.csv.")

    return parser.parse_args()


def load_session_rows(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not path.exists():
        return rows

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        thread_id = item.get("id")
        if not thread_id:
            continue
        rows.append(
            {
                "thread_id": thread_id,
                "thread_name": item.get("thread_name", ""),
                "updated_at": item.get("updated_at", ""),
            }
        )

    rows.sort(key=lambda row: row["updated_at"], reverse=True)
    return rows


def read_owner_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_owner_rows(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["thread_id", "owner", "notes"])
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "thread_id": row.get("thread_id", ""),
                    "owner": row.get("owner", ""),
                    "notes": row.get("notes", ""),
                }
            )


def owner_lookup(rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    return {row.get("thread_id", "").strip(): row for row in rows if row.get("thread_id", "").strip()}


def list_sessions(
    session_rows: list[dict[str, str]],
    owner_rows: list[dict[str, str]],
    limit: int,
    only_unassigned: bool,
) -> int:
    owners = owner_lookup(owner_rows)
    shown = 0
    print("updated_at\towner\tthread_id\tthread_name")
    for row in session_rows:
        owner = owners.get(row["thread_id"], {}).get("owner", "unassigned")
        if only_unassigned and owner != "unassigned":
            continue
        print(f"{row['updated_at']}\t{owner}\t{row['thread_id']}\t{row['thread_name']}")
        shown += 1
        if shown >= limit:
            break

    if shown == 0:
        print("(표시할 세션 없음)")
    return 0


def upsert_owner_row(
    owner_rows: list[dict[str, str]],
    thread_id: str,
    owner: str,
    notes: str,
) -> tuple[list[dict[str, str]], str]:
    normalized_thread_id = thread_id.strip()
    for row in owner_rows:
        if row.get("thread_id", "").strip() == normalized_thread_id:
            row["owner"] = owner
            if notes:
                row["notes"] = notes
            return owner_rows, "updated"

    owner_rows.append({"thread_id": normalized_thread_id, "owner": owner, "notes": notes})
    return owner_rows, "created"


def assign_session(
    owner_rows: list[dict[str, str]],
    thread_id: str,
    owner: str,
    notes: str,
    owners_path: Path,
) -> int:
    updated_rows, status = upsert_owner_row(owner_rows, thread_id, owner, notes)
    write_owner_rows(owners_path, updated_rows)
    print(f"{status}: {thread_id} -> {owner}")
    return 0


def assign_latest_sessions(
    session_rows: list[dict[str, str]],
    owner_rows: list[dict[str, str]],
    owner: str,
    count: int,
    notes: str,
    owners_path: Path,
) -> int:
    owners = owner_lookup(owner_rows)
    targets = [row for row in session_rows if row["thread_id"] not in owners][:count]
    if not targets:
        print("최근 미매핑 세션이 없습니다.")
        return 0

    for row in targets:
        auto_notes = notes or f"assigned by assign-latest | thread_name={row['thread_name']}"
        owner_rows, _ = upsert_owner_row(owner_rows, row["thread_id"], owner, auto_notes)

    write_owner_rows(owners_path, owner_rows)
    for row in targets:
        print(f"created: {row['thread_id']} -> {owner} ({row['thread_name']})")
    return 0


def main() -> int:
    args = parse_args()
    session_rows = load_session_rows(args.session_index)
    owner_rows = read_owner_rows(args.owners)

    if args.command == "list":
        return list_sessions(session_rows, owner_rows, args.limit, args.only_unassigned)
    if args.command == "assign":
        return assign_session(owner_rows, args.thread_id, args.owner, args.notes, args.owners)
    if args.command == "assign-latest":
        return assign_latest_sessions(
            session_rows,
            owner_rows,
            args.owner,
            args.count,
            args.notes,
            args.owners,
        )

    raise SystemExit(f"Unknown command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())

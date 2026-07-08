from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Launch Codex with a remembered owner name and auto-map new sessions."
    )
    parser.add_argument(
        "--codex-bin",
        default="codex",
        help="Codex executable path. Defaults to auto-detecting `codex`.",
    )
    parser.add_argument(
        "--profile",
        type=Path,
        default=base_dir / "input" / "current_user.json",
        help="Path to the saved current-user profile.",
    )
    parser.add_argument(
        "--owners",
        type=Path,
        default=base_dir / "input" / "session_owners.csv",
        help="CSV file mapping thread_id to owner name.",
    )
    parser.add_argument(
        "--session-index",
        type=Path,
        default=Path.home() / ".codex" / "session_index.jsonl",
        help="Path to Codex session index JSONL.",
    )
    parser.add_argument(
        "--switch-user",
        action="store_true",
        help="Prompt again and replace the saved user name.",
    )
    parser.add_argument(
        "codex_args",
        nargs=argparse.REMAINDER,
        help="Extra arguments passed through to Codex. Prefix with `--` if needed.",
    )
    return parser.parse_args()


def read_json(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def prompt_for_name(existing_name: str = "") -> str:
    prompt = "Codex 사용자 이름"
    if existing_name:
        prompt += f" [{existing_name}]"
    prompt += ": "

    while True:
        entered = input(prompt).strip()
        if entered:
            return entered
        if existing_name:
            return existing_name
        print("이름을 비워둘 수 없습니다. 다시 입력해 주세요.", file=sys.stderr)


def load_or_create_profile(path: Path, switch_user: bool) -> dict[str, str]:
    profile = read_json(path)
    saved_name = profile.get("owner", "").strip()

    if switch_user or not saved_name:
        owner = prompt_for_name(saved_name)
        profile = {"owner": owner}
        write_json(path, profile)
        print(f"현재 사용자로 `{owner}` 저장")
    else:
        print(f"현재 사용자 `{saved_name}` 사용")

    return profile


def load_session_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()

    session_ids: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        session_id = item.get("id")
        if session_id:
            session_ids.add(session_id)
    return session_ids


def load_session_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []

    rows: list[dict[str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        session_id = item.get("id")
        if session_id:
            rows.append(
                {
                    "thread_id": session_id,
                    "thread_name": item.get("thread_name", ""),
                    "updated_at": item.get("updated_at", ""),
                }
            )
    return rows


def read_owner_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_owner_rows(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["thread_id", "owner", "notes"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "thread_id": row.get("thread_id", ""),
                    "owner": row.get("owner", ""),
                    "notes": row.get("notes", ""),
                }
            )


def append_new_sessions(
    owner: str,
    owners_path: Path,
    session_index_path: Path,
    before_ids: set[str],
) -> list[dict[str, str]]:
    existing_rows = read_owner_rows(owners_path)
    known_ids = {row.get("thread_id", "").strip() for row in existing_rows}
    new_rows: list[dict[str, str]] = []

    for item in load_session_rows(session_index_path):
        thread_id = item["thread_id"]
        if thread_id in before_ids or thread_id in known_ids:
            continue

        note_parts = ["auto-added by start_codex.py"]
        if item["thread_name"]:
            note_parts.append(f"thread_name={item['thread_name']}")
        if item["updated_at"]:
            note_parts.append(f"updated_at={item['updated_at']}")

        row = {
            "thread_id": thread_id,
            "owner": owner,
            "notes": " | ".join(note_parts),
        }
        existing_rows.append(row)
        known_ids.add(thread_id)
        new_rows.append(row)

    if new_rows:
        write_owner_rows(owners_path, existing_rows)

    return new_rows


def normalize_codex_args(codex_args: list[str]) -> list[str]:
    if codex_args and codex_args[0] == "--":
        return codex_args[1:]
    return codex_args


def resolve_codex_bin(codex_bin: str) -> str:
    explicit_path = Path(codex_bin).expanduser()
    if explicit_path.is_file():
        return str(explicit_path)

    discovered = shutil.which(codex_bin)
    if discovered:
        return discovered

    candidates = sorted(
        Path.home().glob(".vscode/extensions/openai.chatgpt-*/bin/*/codex"),
        reverse=True,
    )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)

    raise FileNotFoundError(
        "Codex 실행 파일을 찾지 못했습니다. `--codex-bin /실행파일/경로`로 직접 지정해 주세요."
    )


def run_codex(codex_bin: str, codex_args: list[str]) -> int:
    command = [resolve_codex_bin(codex_bin), *normalize_codex_args(codex_args)]
    completed = subprocess.run(command, check=False)
    return completed.returncode


def main() -> int:
    args = parse_args()
    profile = load_or_create_profile(args.profile, args.switch_user)
    owner = profile["owner"]

    before_ids = load_session_ids(args.session_index)
    exit_code = run_codex(args.codex_bin, args.codex_args)
    new_rows = append_new_sessions(owner, args.owners, args.session_index, before_ids)

    if new_rows:
        print(f"새 세션 {len(new_rows)}개를 `{owner}`에 연결")
    else:
        print("추가로 매핑된 새 세션 없음")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

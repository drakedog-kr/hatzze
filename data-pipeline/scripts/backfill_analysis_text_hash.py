"""telegram_message_analysis.text_hash 를 한 번 채운다(migration_065 뒤 딱 한 번).

분류기는 이제 저장할 때 본문 해시를 함께 쓴다(analyze_telegram_messages.analysis_row). 그
전에 쌓인 20만 행은 null 이라 집계가 중복 판정 없이 그대로 센다 — 화면의 센티먼트가
과거까지 같은 규칙으로 다시 계산되게 하려면 이 행들에 해시를 채워야 한다.

    python scripts/backfill_analysis_text_hash.py            # 실제 갱신
    python scripts/backfill_analysis_text_hash.py --dry-run  # 몇 건 채울지만 센다

⚠️ 본문을 전량 읽는다. 파이프라인 안에서 하면 안 되는 일(load_messages_since 주석의
   statement timeout)이라 **로컬에서 한 번만** 돈다. 키셋 페이징이라 페이지마다 비용이
   일정하고, 끊기면 다시 돌려도 이미 채운 행은 건너뛴다(null 인 행만 고른다).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze_telegram_messages import body_key  # noqa: E402
from common.supabase_client import get_client, has_column, load_all_keyset, load_keyset  # noqa: E402

CHUNK = 500


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()
    if not has_column(db, "telegram_message_analysis", "text_hash"):
        print("[중단] text_hash 열이 없습니다. supabase/migration_065_analysis_text_hash.sql 을 먼저 돌리세요.")
        return

    todo = load_keyset(
        db,
        "telegram_message_analysis",
        "id,channel_handle,message_id",
        narrow=lambda q: q.is_("text_hash", "null"),
    )
    print(f"[대상] 해시가 비어 있는 분류 행 {len(todo):,}건")
    if not todo:
        return

    messages = load_all_keyset(db, "telegram_messages", "id,channel_handle,message_id,text")
    hash_of = {
        (m["channel_handle"], m["message_id"]): body_key((m.get("text") or "").strip())
        for m in messages
        if (m.get("text") or "").strip()
    }
    rows = []
    missing = 0
    for r in todo:
        h = hash_of.get((r["channel_handle"], r["message_id"]))
        if not h:
            missing += 1
            continue
        rows.append({"id": r["id"], "text_hash": h})
    print(f"[준비] 채울 수 있는 행 {len(rows):,}건 · 본문이 없어 못 채우는 행 {missing:,}건")
    if dry_run:
        return

    for i in range(0, len(rows), CHUNK):
        chunk = rows[i : i + CHUNK]
        # id 로만 짝을 맞춘 부분 갱신. upsert 는 나머지 not null 열을 요구하므로 한 건씩 update 한다
        # 대신 id 목록으로 묶어 같은 해시끼리 한 번에 친다.
        by_hash: dict[str, list[str]] = {}
        for r in chunk:
            by_hash.setdefault(r["text_hash"], []).append(r["id"])
        for h, ids in by_hash.items():
            db.table("telegram_message_analysis").update({"text_hash": h}).in_("id", ids).execute()
        print(f"  {min(i + CHUNK, len(rows)):,}/{len(rows):,}")
    print("[완료]")


if __name__ == "__main__":
    main()

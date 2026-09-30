"""publish_daily_note.py 가 새 글을 IndexNow 로 알리는 본문.

키가 워크플로(.github/workflows/indexnow.yml)와 다르면 검색엔진이 소유 증명에 실패해 조용히 버린다. 둘을 맞춰 본다.
"""
import re
from pathlib import Path

import publish_daily_note as P

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "indexnow.yml"


def test_body_shape():
    body = P.indexnow_body(["https://hatzze.fun/daily/2026-09-30"])
    assert body["host"] == "hatzze.fun"
    assert body["key"] == P.INDEXNOW_KEY
    assert body["keyLocation"] == f"https://hatzze.fun/{P.INDEXNOW_KEY}.txt"
    assert body["urlList"] == ["https://hatzze.fun/daily/2026-09-30"]


def test_key_matches_workflow():
    m = re.search(r"^\s*KEY:\s*([0-9a-f]{32})\s*$", WORKFLOW.read_text(encoding="utf-8"), flags=re.M)
    assert m, "워크플로에서 KEY 를 못 찾았습니다"
    assert m.group(1) == P.INDEXNOW_KEY


def test_key_file_is_public():
    key_file = Path(__file__).resolve().parents[2] / "public" / f"{P.INDEXNOW_KEY}.txt"
    assert key_file.read_text(encoding="utf-8").strip() == P.INDEXNOW_KEY

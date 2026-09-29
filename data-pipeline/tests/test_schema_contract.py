"""supabase/ 의 스키마 파일과 파이프라인이 쓰는 값이 어긋나지 않는지 — 새 환경을 레포로만 만들 때의 계약.

운영 DB 는 SQL Editor 에서 손으로 고친 것이 있어 잘 돈다. 그런데 레포의 schema.sql + migration 을
차례로 붙여 새 환경을 만들면, 손으로만 고친 자리에서 fetch 스크립트가 첫 DB 호출에 죽는다
(migration_019 가 daily_score.stage 로 같은 일을 겪었다). 여기서는 SQL 을 실행하지 않고 파일을
읽어 **마지막으로 적힌 정의**가 코드가 쓰는 값·컬럼을 받는지만 본다.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUPABASE = ROOT / "supabase"
SCRIPTS = ROOT / "data-pipeline" / "scripts"


def _sql_files() -> list[Path]:
    """새 환경에 붙이는 순서 — schema.sql, 그다음 migration 번호순."""
    return [SUPABASE / "schema.sql", *sorted(SUPABASE.glob("migration_*.sql"))]


def _sql(path: Path) -> str:
    # 주석에 옛 정의가 인용돼 있어도 걸리지 않게 `--` 줄 주석을 걷는다.
    return re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))


def _create_table_body(sql: str, table: str) -> str | None:
    m = re.search(rf"create table if not exists public\.{table}\s*\((.*?)\n\);", sql, re.S | re.I)
    return m.group(1) if m else None


def _quoted(s: str) -> set[str]:
    return set(re.findall(r"'([^']*)'", s))


def _category_check_allows() -> set[str] | None:
    """indicators.category 검사가 마지막으로 허용하는 값. 검사가 없으면 None."""
    allowed: set[str] | None = None
    for path in _sql_files():
        sql = _sql(path)
        body = _create_table_body(sql, "indicators")
        if body:
            m = re.search(r"check\s*\(\s*category\s+in\s*\(([^)]*)\)", body, re.I)
            allowed = _quoted(m.group(1)) if m else None
        events = re.finditer(
            r"drop constraint if exists indicators_category_check"
            r"|add constraint indicators_category_check\s+check\s*\(\s*category\s+in\s*\(([^)]*)\)",
            sql,
            re.I,
        )
        for e in events:
            allowed = _quoted(e.group(1)) if e.group(1) is not None else None
    return allowed


def _has_column(table: str, column: str) -> bool:
    """schema.sql 의 create table 이나 migration 의 add/drop column 을 차례로 따라간 마지막 상태."""
    has = False
    for path in _sql_files():
        sql = _sql(path)
        body = _create_table_body(sql, table)
        if body and re.search(rf"^\s*{column}\s", body, re.M):
            has = True
        pattern = rf"alter table public\.{table}\s+(add|drop) column (?:if (?:not )?exists )?{column}\b"
        for e in re.finditer(pattern, sql, re.I):
            has = e.group(1).lower() == "add"
    return has


def _meta_categories() -> set[str]:
    """ensure_indicator 로 indicators 행을 쓰는 스크립트들의 META category 값."""
    cats: set[str] = set()
    for path in SCRIPTS.glob("*.py"):
        src = path.read_text(encoding="utf-8")
        if "ensure_indicator" in src:
            cats |= set(re.findall(r'"category":\s*"([^"]+)"', src))
    return cats


def test_indicators_category_check_accepts_every_meta_category():
    # 검사가 옛 라벨(정통·밈)만 받으면 fetch 스크립트 25개가 ensure_indicator 에서 전부
    # 23514(check_violation)로 죽고, 점수·요약·저녁 발송까지 줄줄이 선다.
    cats = _meta_categories()
    assert cats, "META category 를 하나도 못 찾았다 — 정규식이 낡았다"
    allowed = _category_check_allows()
    assert allowed is None or cats <= allowed, f"허용 {sorted(allowed)} 에 없는 값: {sorted(cats - allowed)}"


def test_indicator_values_has_details_column():
    # fetch 스크립트 대부분이 details 를 upsert 하고, calculate_score·check_freshness·common/details
    # 가 details 를 함께 읽는다. 컬럼이 없으면 PostgREST 가 행을 거절해 지표가 안
    # 쌓이고 점수·신선도 게이트가 죽어 발송도 선다(화면은 lib/data.ts 가 details 없이 다시 읽어
    # 버티므로 그전까지 안 보인다).
    assert _has_column("indicator_values", "details")

"""데일리 노트(/daily) 원고를 표 `daily_note` 에 올린다.

    python data-pipeline/scripts/publish_daily_note.py <post.md> [--short <short.md>] [--date YYYY-MM-DD] [--dry-run] [--force]

## 원고 형식 (세션이 매일 쓰는 hatzze_MMDD_post.md 그대로)

    # 제목
    ## 2026년 9월 5일 토요일
    주식 텔레그램 채널에서 오간 말을 매일 모아 정리합니다.
    (본문 …)

첫 `#` 줄이 제목, 첫 `##` 줄이 날짜다. 둘을 떼어 낸 나머지가 body_md 로 들어간다 — 화면이
제목·날짜를 자기 자리(머리)에 그리므로 본문에 남기면 두 번 나온다. `--date` 를 주면 그 값이
날짜 줄을 이긴다(날짜 줄이 없는 원고에 쓴다).

**도입의 고정 문장("주식 텔레그램 채널에서 오간 말을 매일 모아 정리합니다.")도 뗀다**(2026-09-06
지시 — 화면에는 없어도 된다). 그 문장 뒤에 그날의 조건(휴장 등)이 붙어 있으면 그건 남긴다.
문장을 떼고 문단이 비면 문단째 지우고, 바로 따라오는 구분선(---)도 같이 지운다 — 안 그러면
글이 선 하나로 시작한다. 커뮤니티에 올리는 원고 파일은 그대로다(이 스크립트는 읽기만 한다).

⚠️ **맨 끝의 `출처: hatzze.fun/kadera` 줄은 남긴다.** 2026-09-06 에 한 번 떼었다가 같은 날
되살렸다 — 다시 떼지 말 것. 화면은 그 줄을 본문과 다른 결로 그린다(`.hz-note-source`).

`--short` 를 안 주면 같은 폴더의 `*_short.md`(원고 이름의 `_post` 를 `_short` 로 바꾼 것)가
있을 때 그걸 쓴다. 짧은 판은 아직 화면에 안 나가지만 같은 줄에 넣어 둔다.

## 언급된 종목 (마이그레이션 068)

본문에 이름이 나온 종목을 뽑아 `stocks` 열에 넣는다 — `{"kr": [코드…], "us": [티커…]}`, 본문에
처음 나온 차례. 화면 오른쪽 칸의 '언급된 종목' 카드가 이걸 읽는다.

⭐ **카더라 종목 추출기와 같은 사전·같은 경계 규칙**을 쓴다(extract_telegram_stocks.py ·
extract_telegram_us_stocks.py 의 함수를 그대로 부른다). 잣대가 다르면 같은 글이 카더라
화면과 다른 종목 목록을 갖는다. 국내 사전은 `stocks` 표 2,700여 종목이라 한 번 읽는 데 몇 초
걸리는데, 하루 한 번 도는 스크립트라 그 값이면 된다.

⚠️ 열이 아직 없으면(068 전) 그 열만 빼고 올린다 — has_column 로 본다. 나중에 다시 올리면 채워진다.

## 올리기 전 검사

원고 규칙이 매번 돌리는 검사를 여기서도 돌린다. 걸리면 **올리지 않는다** — 화면에 나간 뒤
고치는 것보다 여기서 멈추는 게 싸다. 정말 예외면 `--force`.
  · 금지어(common.broadcast_content.banned_hits, INDICATOR_EXEMPT 예외)
  · 물결표(~) — 올리는 곳에 따라 사라져 "10~15%" 가 "1015%" 가 된다. 화면에도 안 쓴다
  · em대시(—)
경고만 낸다: 해요체로 끝나는 줄, '### 그 밖에' · '### 이 글 한 편에 들어간 데이터' 누락
(일요일 주간 정리는 뼈대가 달라 경고로 둔다).

## 같은 날 다시 올리면 덮어쓴다

date 가 기본 키라 upsert 다. 고친 원고를 반영하는 길이 이것뿐이다(로그인이 없다).
`updated_at` 에 지금 시각을 넣어 언제 다시 올렸는지 남긴다.

## LLM 을 안 부른다

이 스크립트는 파일을 읽어 표에 넣을 뿐이다. 글은 세션에서 사람이 쓴다(자동 생성은
2026-09-06 에 비용을 보고 접었다).
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.supabase_client import get_client, has_column  # noqa: E402

try:
    from common.broadcast_content import INDICATOR_EXEMPT, banned_hits  # noqa: E402
except Exception as exc:  # noqa: BLE001 — 검사 모듈이 못 뜨면 그 검사만 건너뛴다
    INDICATOR_EXEMPT = ()
    banned_hits = None
    IMPORT_WARNING: str | None = f"금지어 검사를 못 불러왔습니다({type(exc).__name__}: {exc}). 그 검사만 건너뜁니다"
else:
    IMPORT_WARNING = None

import extract_telegram_stocks as KR  # noqa: E402
import extract_telegram_us_stocks as US  # noqa: E402

TABLE = "daily_note"
DATE_RE = re.compile(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일")
INTRO_SENTENCE = "주식 텔레그램 채널에서 오간 말을 매일 모아 정리합니다."
REQUIRED_SECTIONS = ("그 밖에", "이 글 한 편에 들어간 데이터")
# 문장 끝 검사에서 빼는 줄 — 소제목·표·구분선·고지·출처는 문장이 아니다.
NOT_A_SENTENCE = ("#", "|", "-", "※", "출처")


def split_front(text: str) -> tuple[str | None, str | None, str]:
    """(제목, 날짜 ISO, 본문). 맨 앞의 `# ` 한 줄과 `## ` 한 줄만 뗀다."""
    lines = text.replace("\r\n", "\n").split("\n")
    title: str | None = None
    date_iso: str | None = None
    body_start = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue
        if title is None and s.startswith("# "):
            title = s[2:].strip()
            body_start = i + 1
            continue
        if date_iso is None and s.startswith("## "):
            m = DATE_RE.search(s)
            if m:
                y, mo, d = (int(g) for g in m.groups())
                date_iso = f"{y:04d}-{mo:02d}-{d:02d}"
                body_start = i + 1
                continue
        break
    body = "\n".join(lines[body_start:]).strip("\n") + "\n"
    return title, date_iso, body


def strip_intro(body: str) -> str:
    """도입의 고정 문장을 뗀다. 문단이 비면 문단째, 바로 따라오는 구분선도 같이."""
    lines = body.split("\n")
    first = next((i for i, line in enumerate(lines) if line.strip()), None)
    if first is None or INTRO_SENTENCE not in lines[first]:
        return body
    rest = lines[first].replace(INTRO_SENTENCE, "", 1).strip()
    if rest:
        lines[first] = rest
        return "\n".join(lines)
    del lines[first]
    nxt = next((i for i, line in enumerate(lines) if line.strip()), None)
    if nxt is not None and re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", lines[nxt].strip()):
        del lines[nxt]
    return "\n".join(lines).strip("\n") + "\n"


def check(title: str, body: str) -> tuple[list[str], list[str]]:
    """(막는 것, 경고). 막는 것이 하나라도 있으면 올리지 않는다."""
    errors: list[str] = []
    warnings: list[str] = []
    for n, line in enumerate([title, *body.split("\n")]):
        where = "제목" if n == 0 else f"{n}행"
        s = line.strip()
        if not s:
            continue
        snippet = s[:40]
        if "~" in s:
            errors.append(f"{where}: 물결표 — {snippet}")
        if "—" in s:
            errors.append(f"{where}: em대시 — {snippet}")
        if banned_hits is not None:
            hits = banned_hits(s, INDICATOR_EXEMPT)
            if hits:
                errors.append(f"{where}: 금지어 {hits} — {snippet}")
        if not s.startswith(NOT_A_SENTENCE) and re.search(r"(?:어요|아요|해요|네요|죠|요)[.!?]?$", s):
            warnings.append(f"{where}: 해요체로 끝납니다 — …{s[-30:]}")
    headings = [h.strip() for h in re.findall(r"^###\s+(.*)$", body, flags=re.M)]
    for sec in REQUIRED_SECTIONS:
        if sec not in headings:
            warnings.append(f"'### {sec}' 가 없습니다(일요일 주간 정리면 정상)")
    return errors, warnings


def mentioned_stocks(db, text: str) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """(국내 [(코드, 본문 표기)…], 미국 [(티커, 본문 표기)…]) — 본문에 처음 나온 차례."""
    match_to_code, method, ambiguous = KR.load_dictionary(db)
    kr_pattern, kr_caseless = KR.build_pattern(list(match_to_code))
    kr = [(code, matched) for code, (matched, _m) in KR.extract(text, kr_pattern, match_to_code, method, ambiguous, kr_caseless).items()]
    match_to_ticker = US.build_dictionary()
    us_pattern, us_caseless = KR.build_pattern(list(match_to_ticker))
    us = list(US.extract(text, us_pattern, match_to_ticker, us_caseless).items())
    return kr, us


def guess_short(post: Path) -> Path | None:
    if "_post" not in post.stem:
        return None
    cand = post.with_name(post.name.replace("_post", "_short", 1))
    return cand if cand.exists() else None


def main() -> None:
    ap = argparse.ArgumentParser(description="데일리 노트 원고를 daily_note 표에 올린다")
    ap.add_argument("post", help="긴 글 원고(.md). 첫 줄 '# 제목', 둘째 줄 '## YYYY년 M월 D일'")
    ap.add_argument("--short", help="짧은 판(.md). 없으면 같은 폴더의 *_short.md 를 찾는다")
    ap.add_argument("--date", help="YYYY-MM-DD. 원고의 날짜 줄을 이긴다")
    ap.add_argument("--dry-run", action="store_true", help="검사와 요약만 하고 올리지 않는다")
    ap.add_argument("--force", action="store_true", help="검사에 걸려도 올린다")
    args = ap.parse_args()

    post = Path(args.post)
    title, date_iso, body = split_front(post.read_text(encoding="utf-8"))
    body = strip_intro(body)
    if args.date:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
            sys.exit(f"--date 는 YYYY-MM-DD 꼴이어야 합니다: {args.date}")
        date_iso = args.date
    if not title:
        sys.exit("첫 줄에 '# 제목' 이 없습니다.")
    if not date_iso:
        sys.exit("둘째 줄에 '## YYYY년 M월 D일' 이 없습니다. --date 로 주십시오.")
    if len(body.strip()) < 200:
        sys.exit(f"본문이 너무 짧습니다({len(body.strip())}자). 원고 파일이 맞는지 보십시오.")

    short_path = Path(args.short) if args.short else guess_short(post)
    short = short_path.read_text(encoding="utf-8").strip() + "\n" if short_path else None

    if IMPORT_WARNING:
        print(f"[warning] {IMPORT_WARNING}")
    errors, warnings = check(title, body)
    if short:
        short_errors, _ = check(title, short)
        errors += [f"(짧은 판) {e}" for e in short_errors]

    db = get_client()
    kr, us = mentioned_stocks(db, f"{title}\n{body}")

    headings = re.findall(r"^###\s+(.*)$", body, flags=re.M)
    print("─" * 60)
    print(f"날짜   {date_iso}")
    print(f"제목   {title} ({len(title)}자)")
    print(f"본문   {len(body):,}자 · 꼭지 {len(headings)}개")
    for h in headings:
        print(f"       ### {h}")
    print(f"짧은 판 {len(short):,}자 ({short_path.name})" if short else "짧은 판 없음")
    print(f"국내   {len(kr)}종목 · " + " · ".join(f"{m}({c})" for c, m in kr))
    print(f"미국   {len(us)}종목 · " + " · ".join(f"{m}({t})" for t, m in us))
    print("─" * 60)
    for w in warnings:
        print(f"[warning] {w}")
    for e in errors:
        print(f"[ERROR] {e}")
    if errors and not args.force:
        sys.exit(f"검사에 {len(errors)}건 걸려 올리지 않았습니다. 원고를 고치거나 --force 를 주십시오.")

    if args.dry_run:
        print("[dry-run] 올리지 않습니다.")
        return

    row = {
        "date": date_iso,
        "title": title,
        "body_md": body,
        "short_md": short,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if has_column(db, TABLE, "stocks"):
        row["stocks"] = {"kr": [c for c, _ in kr], "us": [t for t, _ in us]}
    else:
        print("[warning] daily_note.stocks 열이 없어 종목 없이 올립니다(마이그레이션 068). 돌린 뒤 다시 올리면 채워집니다.")
    db.table(TABLE).upsert(row, on_conflict="date").execute()
    print(f"[Supabase] {TABLE} {date_iso} 저장 — /daily/{date_iso}")


if __name__ == "__main__":
    main()

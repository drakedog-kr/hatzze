"""TIC SHL 연례 조사에서 나라별 **주식 종류** 구성을 seohak_equity_type 에 upsert.

이 화면이 못 하던 질문 하나를 이 원천이 답한다: **무엇을 들고 있나.**
13F 는 기관 9곳뿐이고 예탁원 종목별은 법인 전용이라 막혀 있지만, 종류 단위라면
미 재무부가 나라별로 그대로 준다.

원천: `Report on Foreign Portfolio Holdings of U.S. Securities` 부록
      Table A8(옛 A4) `Foreign Holdings of U.S. Equities, by Country and Equity Type`
      매년 6월 말 기준 · 이듬해 4월경 공표 · 미국 정부 저작물

## ⚠️⚠️ 파일 이름도 표 번호도 해마다 바뀐다

  2014      appendix_tab04.csv        (Table A4)
  2015~2019 shl_app04_YYYY.csv        (Table A4)
  2020~2022 shl_app08_YYYY.csv        (Table A8 로 번호 이동)
  2023~2025 shl_app08_data_YYYY.csv   (기계용 판이 따로 생김)

zip 이름은 더 제각각이다 — `shl2014r-appx` · `shla2016r-appx` · `shla2018r_appx` ·
`shl2024r_appx` · `shl_appendix_2025`. 규칙이 없다.

그래서 **이름을 짐작하지 않는다.** 목록 페이지에서 zip 링크를 긁고, 각 zip 안에서
`Common Stock` + `Funds` + `Preferred` 가 같이 있는 csv 를 찾는다. 이름 규칙이 또
바뀌어도 표만 그대로면 계속 돈다.

⚠️ `www.treasury.gov` 경로는 **302 로 `ticdata.treasury.gov` 에 넘긴다.** 리다이렉트를
안 따라가면 0바이트 파일이 조용히 떨어진다(실제로 12개를 그렇게 받았다).

## 왜 전 세계와 이웃 나라도 담나

한국 값만 담으면 2021년 '우선주·기타' 급증(10.4→19.2%)을 **분류 기준이 바뀐 걸로**
읽게 된다. 같은 해 전 세계가 6.8→6.7% 로 가만히 있었다는 대조가 있어야 그게
한국만의 실제 변화라고 말할 수 있다. 담는 건 화면이 이미 쓰는 비교국들뿐이다.

열한 해를 통틀어 **움직인 건 한국뿐이다**: 보통주 −9.2%p / 펀드 +0.5 / 기타 +8.7.
같은 기간 전 세계는 +0.3 / +0.1 / −0.4, 일본은 +3.2 / −2.3 / −0.9 로 제자리다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_seohak_equity_type.py --dry-run   # 조회만(전 판)
    python scripts/fetch_seohak_equity_type.py             # 새 판만
    python scripts/fetch_seohak_equity_type.py --all       # 전 판 다시
"""

from __future__ import annotations

import csv
import io
import re
import sys
import time
import zipfile
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

TABLE = "seohak_equity_type"

INDEX_URL = (
    "https://home.treasury.gov/data/treasury-international-capital-tic-system"
    "/us-liabilities-to-foreigners-from-holdings-of-us-securities"
)
# SEC 만큼 까다롭진 않지만 재무부도 빈 UA 를 가끔 막는다.
UA = "hatzze research admin@hatzze.fun"
TIMEOUT_SEC = 90
MAX_ATTEMPTS = 3

# 담을 나라. 표는 이름 문자열만 주므로 접두 매칭으로 잡는다.
# ⚠️ "Total" 은 표 맨 아래 합계 행이다 — 나라가 아니라 전 세계다.
WANTED = {
    "KR": ("korea, south", "대한민국"),
    "WORLD": ("total", "전 세계"),
    "JP": ("japan", "일본"),
    "CN": ("china, mainland", "중국"),
    "GB": ("united kingdom", "영국"),
    "SG": ("singapore", "싱가포르"),
    "HK": ("hong kong", "홍콩"),
    "TW": ("taiwan", "대만"),
}


def get(url: str) -> bytes:
    last: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            # allow_redirects 기본값이 True 지만 명시한다 — 이 원천은 도메인을 넘긴다.
            resp = requests.get(
                url, headers={"User-Agent": UA}, timeout=TIMEOUT_SEC, allow_redirects=True
            )
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as exc:
            last = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(backoff_delay(attempt))
    raise RuntimeError(f"{url} 조회 실패: {last}")


def survey_archives() -> list[tuple[int, str]]:
    """목록 페이지에서 (조사연도, zip 주소) 를 긁는다. 이름 규칙이 없어 연도는 숫자로 뽑는다."""
    html = get(INDEX_URL).decode("utf-8", "ignore")
    found: dict[int, str] = {}
    for m in re.finditer(r'href="([^"]*(?:shl|shla)[^"]*\.zip)"', html):
        url = m.group(1)
        year = re.search(r"(20\d{2})", url)
        if not year:
            continue
        # 같은 해가 여러 번 나오면 뒤엣것(개정판)을 쓴다.
        found[int(year.group(1))] = url
    return sorted(found.items())


def equity_type_rows(blob: bytes, year: int) -> list[list[str]] | None:
    """zip 안에서 종류별 표를 찾아 행을 돌려준다. 파일 이름이 아니라 **내용**으로 찾는다.

    ⚠️ `Common Stock` 을 통째 문자열로 찾으면 안 된다. 옛 판은 머리말이 여러 행·여러
    칸으로 쪼개져 있어 `Common` 과 `Stock` 이 다른 행에 있다(2014판 실측). 낱말이
    따로 있어도 잡히게 **머리말을 한 덩어리로 눌러** 낱말 단위로 본다.
    """
    z = zipfile.ZipFile(io.BytesIO(blob))
    best: tuple[int, list[list[str]]] | None = None
    for name in z.namelist():
        if not name.lower().endswith(".csv"):
            continue
        text = z.read(name).decode("utf-8", "ignore")
        head = re.sub(r"[\s\",]+", " ", text[:1600]).lower()
        # 'equit' 를 같이 본다 — 이걸 빼면 같은 낱말이 도는 채권 표가 걸린다.
        if not all(w in head for w in ("common", "funds", "preferred", "equit")):
            continue
        rows = list(csv.reader(io.StringIO(text)))
        # ⚠️ **연도가 이름에 든 것을 먼저 쓴다.** 어떤 판은 zip 안에 전년도 파일을 같이
        # 담는다(2016판에 shl_app04_2015.csv 가 들어 있어 2016 이 2015 값으로 찍혔다).
        # 그다음이 `_data_` 판 — 머리말이 한 줄뿐이라 더 깨끗하다.
        score = (2 if str(year) in name else 0) + (1 if "_data_" in name else 0)
        if best is None or score > best[0]:
            best = (score, rows)
    return best[1] if best else None


def num(cell: str) -> float | None:
    text = (cell or "").strip().strip('"').replace(",", "")
    if text in ("", "*", "(*)", "-", "n.a."):
        # '*' 는 "0 초과 $5억 미만" 이다. 비중 계산에서 0 으로 접어도 자릿수에 안 걸린다.
        return 0.0
    try:
        return float(text)
    except ValueError:
        return None


def pick_country(rows: list[list[str]], prefix: str) -> list[float] | None:
    """라벨로 한 행을 집는다. **정확히 일치하는 행이 있으면 그게 이긴다.**

    ⚠️ 접두 매칭만 쓰면 전 세계 합계(`Total`)를 찾다가 `Total Africa` 를 집는다.
    옛 판은 `Total` 이 지역 합계보다 **위**에 있어 우연히 맞았는데, 2025판은 아래로
    내려가면서 아프리카($37.6B)가 전 세계로 저장됐다. 자릿수가 500배 틀린 값이
    에러 없이 들어갔다.
    """
    def values_of(row: list[str]) -> list[float] | None:
        got = [v for v in (num(c) for c in row[1:]) if v is not None][:4]
        return got if len(got) == 4 and got[0] > 0 else None

    fallback: list[float] | None = None
    for row in rows:
        if not row:
            continue
        label = row[0].strip().strip('"').lower()
        if label == prefix:
            got = values_of(row)
            if got:
                return got
        elif fallback is None and label.startswith(prefix):
            fallback = values_of(row)
    return fallback


def stored_years(db) -> set[int]:
    """이미 저장된 조사연도. 연 1회 원천이라 이게 없으면 매일 12개 zip 을 다시 받는다."""
    page = db.table(TABLE).select("survey_year").execute()
    return {int(r["survey_year"]) for r in (page.data or [])}


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    refetch_all = "--all" in sys.argv
    db = None if dry_run else get_client()

    archives = survey_archives()
    if not archives:
        raise SystemExit("목록 페이지에서 zip 링크를 못 찾았습니다 — 페이지 구조가 바뀌었을 수 있습니다.")
    print(f"조사 {len(archives)}판: {archives[0][0]}~{archives[-1][0]}")

    # 연 1회 갱신이라 이미 받은 해는 건너뛴다. 매일 실행에서는 목록 페이지 한 번만
    # 두드리고 끝난다 — 새 판이 올라온 날에만 zip 을 받는다.
    have = set() if (dry_run or refetch_all) else stored_years(db)
    todo = [(y, u) for y, u in archives if y not in have]
    if not todo:
        print("새 조사판이 없습니다.")
        return
    print(f"받을 판 {len(todo)}개: {', '.join(str(y) for y, _ in todo)}\n")

    out: list[dict] = []
    for year, url in todo:
        try:
            rows = equity_type_rows(get(url), year)
        except (RuntimeError, zipfile.BadZipFile) as exc:
            print(f"  ! {year} 건너뜀: {exc}")
            continue
        if rows is None:
            print(f"  ! {year} 종류별 표를 못 찾았습니다")
            continue

        line = []
        for code, (prefix, name) in WANTED.items():
            v = pick_country(rows, prefix)
            if not v:
                continue
            total, common, funds, other = (int(round(x)) for x in v)
            out.append(
                {
                    "survey_year": year,
                    "country_code": code,
                    "country_name": name,
                    "total_usd_mn": total,
                    "common_usd_mn": common,
                    "funds_usd_mn": funds,
                    "other_usd_mn": other,
                }
            )
            if code in ("KR", "WORLD"):
                line.append(
                    f"{name} {common/total*100:4.1f}/{funds/total*100:4.1f}/{other/total*100:4.1f}"
                )
        print(f"  {year}-06-30  " + "   ".join(line))

    if dry_run:
        print(f"\n--dry-run · {len(out)}행을 저장하지 않았습니다.")
        return
    db.table(TABLE).upsert(out, on_conflict="survey_year,country_code").execute()
    print(f"\n완료 · 저장 {len(out)}행")


if __name__ == "__main__":
    main()

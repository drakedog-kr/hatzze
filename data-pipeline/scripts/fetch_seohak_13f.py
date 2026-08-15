"""한국 소재 기관이 SEC 에 신고한 미국 주식 보유(13F-HR)를 seohak_institution_13f 에 upsert.

TIC(fetch_seohak_flows.py)이 "한국 돈이 얼마나 들어가 있나"를 국가 단위로 답한다면,
이건 "그중 무엇을 샀나"를 **종목 단위로** 답하는 유일한 공개 원천이다.

## 제출자 목록을 코드에 안 박는 이유

EDGAR 전문검색은 `locationCodes` 로 제출자의 소재 국가를 걸 수 있다(한국은 M5).
매 실행 다시 뽑는다 — 13F 의무는 운용자산 $1억 기준이라 기관이 오르내리는데, 목록을
상수로 두면 새 기관이 들어와도 사람이 눈치채야만 반영된다. 2026-08-10 실측으로 9곳이
잡혔다: 국민연금 · 한국투자공사 · 한국은행 · 미래에셋 · 한화자산운용 · 현대인베스트먼트
· 삼성물산 · 아주IB · 머스트자산운용.

## ⚠️ 이건 기관이지 개인이 아니다

화면에 그릴 때 반드시 기관 이름과 함께 보여야 한다. "한국인이 엔비디아를 6.8% 담았다"
로 읽히면 거짓이 된다 — 그건 국민연금 포트폴리오 안에서의 비중이다. 특정 미국 종목의
**개인** 보유 비중은 어떤 공개 원천으로도 나오지 않는다.

## 원천의 함정 다섯

1. **UA 에 이메일이 없으면 403.** SEC 는 User-Agent 에 연락 가능한 이메일을 요구한다.
   `www.sec.gov` 가 특히 깐깐하고(파일 경로는 그냥 막힌다) `data.sec.gov` 는 덜하다.
2. **정보표 XML 의 파일명이 제출마다 다르다**(`53310.xml` · `20253q.xml` ·
   `informationtable.xml` 을 전부 봤다). 이름으로 찾지 말고 primary_doc 이 아닌 xml 을
   고른 뒤 내용으로 확인한다.
3. **XML 네임스페이스가 제출자마다 다르다.** 대행사를 낀 제출은 `<infoTable>` 인데
   자체 제출은 `<ns1:infoTable>` 이다. 접두사를 빼고 태그를 찾지 않으면 **같은 기관의
   과거 분기만 통째로 비는데, 에러 없이 '0건'으로 조용히 지나간다**(국민연금 8분기 중
   7분기가 이렇게 빠졌었다). 그래서 모든 태그 매칭에 `(?:\w+:)?` 를 붙인다.
4. **한 종목이 여러 줄로 나뉜다**(투자재량 구분). 국민연금 2026-03-31 은 562행 /
   고유 557종목이었다. 화면은 종목 단위라 CUSIP 으로 합산해 저장한다.
5. ⭐ **원문 자체가 틀린 제출이 있다.** 미래에셋 2026-03-31 은 버크셔 **Class A**
   368,452주(주당 $718,140 → $264.6B)를 신고했는데, 그건 Class A 총 발행주식의 3분의
   2 규모다. 직전 분기 총액이 $36.0B 였으니 명백한 오류이고, 그 한 줄이 제출 총액의
   **89.9%** 를 차지한다.
   **제출자가 신고한 합계(`tableValueTotal`)도 $299.33B 로 똑같이 틀려서, 신고 합계와
   대조하는 방식으로는 못 잡는다.** 잡히는 건 "분산된 포트폴리오에서 한 종목이 절반을
   넘을 수 없다"는 구조적 사실뿐이라 그걸 규칙으로 쓴다(SUSPECT_* 참고).

   ⚠️⚠️ **판정은 신고서 단위로 하되 표시는 행 단위로 한다.** 처음엔 의심스러운 신고서
   전체에 깃발을 꽂았는데, 미래에셋 2026-03-31 은 1,568행 중 **버크셔 한 줄만** 틀렸다.
   신고서를 통째로 빼니 멀쩡한 1,567행($34.7B)까지 사라져 그 분기만 기관 몫이
   34.6%→27.1% 로 꺼졌고, 기관을 뺀 '나머지'가 +14.4% 를 번 것처럼 보였다.
   **데이터 오류를 지우려던 장치가 새 거짓말을 만든 것이다.** 지금은 큰 줄부터 빼면서
   총액이 직전 분기 수준으로 돌아오는지 보고, **되돌아오게 만든 줄에만** 깃발을 꽂는다.
   한 줄로 설명이 안 되면(빼도 여전히 3배 이상) 그때는 신고서 전체를 의심한다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_seohak_13f.py --dry-run   # 조회만, DB 안 씀
    python scripts/fetch_seohak_13f.py
"""

from __future__ import annotations

import html
import re
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

TABLE = "seohak_institution_13f"
UPSERT_CHUNK = 500

# SEC 는 User-Agent 에 연락 가능한 이메일을 요구한다. 없으면 403 이고, 흔한 브라우저
# UA 로 위장하면 오히려 차단당한다(SEC 접근 정책 문서에 명시돼 있다).
USER_AGENT = "hatzze (admin@hatzze.fun)"
# SEC 권고 상한이 초당 10회다. 여유를 두고 절반 아래로 간다 — 이 스크립트는 분기에
# 한 번만 값이 바뀌므로 빨리 끝낼 이유가 없다.
REQUEST_INTERVAL_SEC = 0.2
TIMEOUT_SEC = 45
MAX_ATTEMPTS = 4

LOCATION_CODE_KOREA = "M5"
QUARTERS_TO_KEEP = 8  # 최근 8개 분기 = 2년. 증감을 그리려면 최소 2개가 필요하다

# 원문 오류 탐지(위 함정 5). 세 조건을 **모두** 만족할 때만 의심한다.
#
# 처음엔 집중도만 봤는데 오탐이 났다: 현대인베스트먼트 2025-12-31 은 72종목에 최대
# 종목이 61.2% 인데, 총액이 직전 분기 $0.07B → $0.10B 로 정상 변화다. 그냥 집중된
# 소형 포트폴리오지 오류가 아니다. **집중도 하나로는 '몰빵'과 '오타'를 못 가른다.**
#
# 미래에셋 건을 오류로 확신하게 한 건 집중도가 아니라 **총액이 직전 분기의 8.3배로
# 튀었다**는 쪽이었다. 한 종목이 포트폴리오를 삼키면서 동시에 총액이 몇 배가 되는 건
# 실제 매수로는 설명이 안 된다. 그래서 셋을 함께 본다.
#
# 종목 수 조건이 없으면 삼성물산처럼 1종목만 신고하는 정상 제출이 전부 걸린다
# (1종목이면 집중도는 당연히 100%다).
SUSPECT_MIN_POSITIONS = 50
SUSPECT_TOP_SHARE = 0.5
SUSPECT_TOTAL_JUMP = 3.0  # 직전 분기 총액 대비

FTS_URL = "https://efts.sec.gov/LATEST/search-index"


def sec_get(url: str, **kwargs) -> requests.Response:
    """SEC 요청 하나. 429/5xx 는 백오프하며 재시도한다."""
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        time.sleep(REQUEST_INTERVAL_SEC)
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"},
                timeout=TIMEOUT_SEC,
                **kwargs,
            )
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
            resp.raise_for_status()
            return resp
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(backoff_delay(attempt))
    raise RuntimeError(f"SEC 조회 실패({url}): {last_error}")


def korean_filers() -> dict[str, str]:
    """한국 소재 13F 제출자 {CIK: 이름}.

    전문검색은 한 번에 10건씩 주므로 페이지를 넘긴다. 같은 기관이 분기마다 나오니
    CIK 로 접는다. 목록이 짧아(현재 9곳) 페이지를 넉넉히 돌아도 비용이 작다.
    """
    filers: dict[str, str] = {}
    for start in range(0, 300, 10):
        payload = sec_get(
            FTS_URL,
            params={
                "q": "",
                "forms": "13F-HR",
                "locationCodes": LOCATION_CODE_KOREA,
                "from": start,
            },
        ).json()
        hits = payload.get("hits", {}).get("hits", [])
        if not hits:
            break
        for hit in hits:
            source = hit["_source"]
            display = source["display_names"][0]
            # "Mirae Asset Global Investments Co., Ltd.  (CIK 0001569395)"
            match = re.search(r"\(CIK (\d{10})\)", display)
            if match:
                filers[match.group(1)] = display[: match.start()].strip()
    return filers


def recent_13f(cik: str) -> list[tuple[str, str]]:
    """(접수번호, 분기말) 목록을 최신순으로. 정정본(13F-HR/A)은 원본과 같은 분기를
    덮으므로 **더 나중에 제출된 것이 이긴다** — 최신순 목록에서 분기별 첫 항목만 쓴다."""
    payload = sec_get(f"https://data.sec.gov/submissions/CIK{cik}.json").json()
    recent = payload["filings"]["recent"]
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for form, accession, report_date in zip(
        recent["form"], recent["accessionNumber"], recent["reportDate"]
    ):
        if not form.startswith("13F-HR") or not report_date or report_date in seen:
            continue
        seen.add(report_date)
        out.append((accession, report_date))
        if len(out) >= QUARTERS_TO_KEEP:
            break
    return out


def info_table_xml(cik: str, accession: str) -> str | None:
    """제출물에서 정보표 XML 본문. 파일명이 제출마다 달라 목록에서 골라낸다."""
    bare = accession.replace("-", "")
    base = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{bare}"
    index = sec_get(f"{base}/index.json").json()
    names = [item["name"] for item in index["directory"]["item"]]
    for name in names:
        if not name.endswith(".xml") or "primary_doc" in name:
            continue
        body = sec_get(f"{base}/{name}").text
        # 네임스페이스 접두사가 붙는 제출이 있다(<ns1:infoTable>).
        if re.search(r"<(?:\w+:)?infoTable[\s>]", body):
            return body
    return None


def parse_holdings(xml: str) -> dict[str, dict]:
    """정보표 XML → {CUSIP: {issuer, value_usd, shares}}.

    옵션(putCall 이 있는 줄)은 뺀다. 같은 CUSIP 의 주식 포지션이면서 콜옵션인 줄이
    섞여 있으면 보유 주식 수가 부풀려지기 때문이다.

    값 단위는 2023년 제출분부터 **달러**다(그 전은 천 달러). 최근 8분기만 담으므로
    지금은 달러로 봐도 되지만, 소급 수집을 붙일 땐 여기서 배율을 갈라야 한다.
    """
    aggregated: dict[str, dict] = {}
    blocks = re.findall(
        r"<(?:\w+:)?infoTable[^>]*>(.*?)</(?:\w+:)?infoTable>", xml, re.S
    )
    for block in blocks:
        if re.search(r"<(?:\w+:)?putCall>", block):
            continue

        def field(tag: str) -> str | None:
            match = re.search(rf"<(?:\w+:)?{tag}>(.*?)</(?:\w+:)?{tag}>", block, re.S)
            if not match:
                return None
            # XML 이라 & 가 &amp; 로 escape 돼 온다. 안 풀면 발행사명이 화면에
            # "MARSH &amp; MCLENNAN" 으로 그대로 찍힌다(실측 이름 중 여럿이 & 를 쓴다).
            return html.unescape(match.group(1).strip())

        cusip = (field("cusip") or "").upper()
        issuer = field("nameOfIssuer")
        value = field("value")
        if not cusip or not issuer or value is None:
            continue

        shares = field("sshPrnamt")
        entry = aggregated.setdefault(
            cusip, {"issuer": issuer, "value_usd": 0, "shares": 0}
        )
        entry["value_usd"] += int(float(value))
        if shares is not None:
            entry["shares"] += int(float(shares))
    return aggregated


def find_bad_rows(
    holdings: dict[str, dict], total_value: int, prev_total: int | None
) -> set[str]:
    """원문 오류로 의심되는 **줄**을 고른다.

    신호는 신고서 단위로 잡는다("분산된 포트폴리오에서 한 종목이 절반을 넘을 수 없다"
    + "총액이 직전 분기의 3배를 넘었다"). 하지만 **깃발은 줄에 꽂는다.** 큰 것부터
    빼면서 총액이 직전 분기 수준으로 돌아오는지 보고, 돌아오게 만든 줄만 돌려준다.

    한 줄로 설명이 안 되면 — 지배적인 줄을 다 빼도 여전히 3배 이상이면 — 그건 특정
    종목의 오타가 아니라 신고서 전체가 이상한 것이라 전부 돌려준다.

    직전 분기가 없으면(그 기관의 첫 분기) 비교 기준이 없으므로 아무것도 안 뺀다.
    첫 분기가 통째로 틀렸을 가능성은 남지만, 기준 없이 지우면 정상 신고를 지운다.
    """
    if prev_total is None or len(holdings) < SUSPECT_MIN_POSITIONS:
        return set()

    ceiling = prev_total * SUSPECT_TOTAL_JUMP
    if total_value < ceiling:
        return set()

    flagged: set[str] = set()
    running = total_value
    for cusip, entry in sorted(
        holdings.items(), key=lambda kv: -kv[1]["value_usd"]
    ):
        if running < ceiling:
            break
        # 남은 것 중 가장 큰 줄이 신고서를 지배하지 못하면, 총액이 큰 건 한 줄 탓이
        # 아니다. 거기서 멈춰야 멀쩡한 대형 보유를 안 지운다.
        if not running or entry["value_usd"] / running <= SUSPECT_TOP_SHARE:
            break
        flagged.add(cusip)
        running -= entry["value_usd"]

    return flagged if running < ceiling else set(holdings)


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    db = None if dry_run else get_client()

    filers = korean_filers()
    print(f"한국(M5) 소재 13F 제출자 {len(filers)}곳")

    total = 0
    for cik, name in sorted(filers.items(), key=lambda kv: kv[1]):
        try:
            filings = recent_13f(cik)
        except RuntimeError as exc:
            # 한 기관이 안 되는 걸로 나머지를 데려가지 않는다. 카더라 수집에서
            # 저장이 try 밖에 있어 한 채널 실패가 113채널을 데려간 적이 있다.
            print(f"  ! {name} 제출 목록 실패: {exc}")
            continue

        # 의심 판정이 **직전 분기 총액**을 보므로, 분기를 하나씩 저장하지 않고
        # 이 기관 것을 먼저 다 모은 뒤 오래된 순으로 판정한다.
        quarters: list[tuple[str, dict[str, dict]]] = []
        for accession, report_date in filings:
            try:
                xml = info_table_xml(cik, accession)
            except RuntimeError as exc:
                print(f"  ! {name} {report_date} 정보표 실패: {exc}")
                continue
            if xml is None:
                print(f"  ! {name} {report_date} 정보표 XML 을 못 찾았습니다")
                continue

            holdings = parse_holdings(xml)
            if not holdings:
                print(f"  ! {name} {report_date} 보유 종목 0건")
                continue
            quarters.append((report_date, holdings))

        prev_total: int | None = None
        for report_date, holdings in sorted(quarters):
            total_value = sum(e["value_usd"] for e in holdings.values())
            suspect_cusips = find_bad_rows(holdings, total_value, prev_total)
            clean_total = total_value - sum(
                holdings[c]["value_usd"] for c in suspect_cusips
            )
            # 의심 줄을 뺀 총액만 다음 분기 판정의 기준으로 쓴다. 틀린 값을 기준선에
            # 넣으면 그다음 정상 분기가 '급감'으로 보인다.
            if suspect_cusips != set(holdings):
                prev_total = clean_total

            rows = [
                {
                    "filer_cik": cik,
                    "filer_name": name,
                    "report_date": report_date,
                    "cusip": cusip,
                    "issuer": entry["issuer"],
                    "value_usd": entry["value_usd"],
                    "shares": entry["shares"] or None,
                    "suspect": cusip in suspect_cusips,
                }
                for cusip, entry in holdings.items()
            ]
            flag = ""
            if suspect_cusips:
                worst = max(suspect_cusips, key=lambda c: holdings[c]["value_usd"])
                flag = (
                    f"  ⚠ {len(suspect_cusips)}줄 제외 → ${clean_total/1e9:.2f}B "
                    f"(최대: {holdings[worst]['issuer'][:24]})"
                )
            print(
                f"  {name[:34]:<34} {report_date}  {len(rows):>4}종목  "
                f"${total_value/1e9:>7.2f}B{flag}"
            )

            if dry_run:
                continue
            for i in range(0, len(rows), UPSERT_CHUNK):
                db.table(TABLE).upsert(
                    rows[i : i + UPSERT_CHUNK],
                    on_conflict="filer_cik,report_date,cusip",
                ).execute()
            total += len(rows)

    print(f"{'[dry-run] ' if dry_run else ''}완료 · 저장 {total}행")


if __name__ == "__main__":
    main()

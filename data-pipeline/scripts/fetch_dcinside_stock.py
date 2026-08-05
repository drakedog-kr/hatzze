"""디시인사이드 한국/미국 주식 마이너 갤러리의 최근 게시글 제목으로 커뮤니티 감성 지수를 계산해 Supabase에 upsert.

**표본은 "오늘 하루치"가 아니라 "실행 직전 최신 N건"이다.** 갤러리마다 30페이지
(SAMPLE_PAGES)까지만 긁고 멈추므로 매 실행 2,987건 안팎으로 고정된다. 이건 사고가
아니라 지금 설계의 실제 동작이고, 아래 "표본의 정체"에 적은 이유로 그대로 둔다.

애초에 사용하던 "주식 갤러리"(neostock, 정갤)는 실제로는 성별 갈등/연애 잡담이
점령한 상태라(2026-07-09 기준 게시글 47건 중 주식 관련 1~2건) 감성 분석 대상으로
부적절하다고 판단해, 실제로 주식 논의가 활발한 마이너 갤러리 2곳으로 교체했다:
- 한국 주식 마이너 갤러리 (id=krstock)
- 미국 주식 마이너 갤러리 (id=stockus)

두 갤러리 모두 /mgallery/board/lists/ 경로를 쓰고, robots.txt(gall.dcinside.com)의
`User-agent: * / Allow: /`에 해당하며 개별 차단 목록(stock_new, stock_new2, rezero
등)에도 포함되어 있지 않아 스크래핑 가능하다.

감성 스코어 = (긍정 게시글 수 - 부정 게시글 수) / 전체 게시글 수 * 100 (-100~100).
두 갤러리의 게시글을 합산한 뒤 계산한다. 분류는 LLM(common/llm_sentiment)이 맡는다 —
예전 키워드 매칭은 제목 2,987건 중 95%가 어느 단어에도 안 걸려 중립 처리됐고("양닉 음전",
"롱숭이 계좌 정밀타격" 같은 갤러리 은어가 사전에 없었다), 지표가 사실상 5% 표본으로
계산되고 있었다. LLM 전환 후 분류율은 6% → 72%다.

## 표본의 정체 (2026-08-06 실측)

지표를 지탱하는 표본이 무엇인지 헷갈리기 쉬워 실측값을 남긴다. 두 갤러리는 현재
**하루 3만 건 넘게** 쏟아진다(2026-08-05 실측: krstock 292페이지 ≈ 14,600건,
stockus 336페이지 ≈ 16,800건). 반면 이 스크립트는 갤러리당 30페이지에서 멈춘다.

- 매 실행 수집량: krstock 1,495건 + stockus 1,492건 = **2,987건 (하루치의 약 9.5%)**
- 날짜 경계(post_date != today)로 끝나는 일은 없다. **항상 30페이지에서 끊긴다.**
  2026-07-21 ~ 08-05 저장된 16일 전부 2,986~2,988건으로 사실상 상수다.
- 실제로 덮는 시간대: 실행 직전 **1~2시간 반**. 2026-08-05 실측 —
  아침 실행(10:30 KST) krstock 09:05~, stockus 08:04~ /
  저녁 실행(20:00 KST) krstock 17:47~, stockus 17:43~.
- 같은 날짜에 두 번 upsert 하므로 **최종 저장값은 저녁 실행분**이다. 즉 이 지표가
  재는 것은 "그날 하루의 여론"이 아니라 **장 마감 후 ~ 미장 개장 전(대략 17:45~20:00
  KST) 두 시간의 여론**이다.

### 왜 그대로 두는가

지표는 (긍정-부정)/전체 **비율**이라 표본 크기가 값을 좌우하지 않는다. 오히려
건수 고정 표집은 갤러리가 뜨거워질수록 창이 저절로 좁아져 매일 같은 크기(n≈3,000,
표준오차 1%p 미만)의 표본을 준다. 게다가 하루 전체를 긁으면 LLM 분류 대상이 10배로
늘어 비용도 10배다. 다만 **"하루치 전수"가 아니라는 사실이 코드·화면 어디에도 없어서
16일간 상수가 눈에 띄지 않았다** — 그래서 값을 바꾸는 대신 이 문서와 아래 로그·details
기록을 넣었다.

⚠️ SAMPLE_PAGES 를 올리면 표본 시간대가 넓어져 지표 분포 자체가 이동한다. 눈금
(indicator_thresholds 의 floor/ceiling)은 2026-08-06 이 표본 기준으로 재보정한
직후라(PR #305), 페이지 수를 건드리면 눈금도 같이 다시 잡아야 한다.

--backfill(최근 30일)은 krstock만 대상으로 한다. stockus는 활동량이 너무 많아
(오늘자 게시글만 1,500건을 넘겨도 전날로 못 넘어감) 30일 전체 백필이 비현실적이라,
오늘부터의 값만 매일 누적한다.

⚠️ 지금은 **krstock 조차 30일 백필이 불가능하다.** MAX_BACKFILL_PAGES=300 인데
krstock 하루가 292페이지라, 300페이지는 하루치밖에 못 거슬러 올라간다. 30일을 실제로
긁으려면 8,700페이지(약 3.6시간 + 44만 건 LLM 분류)가 필요하다. --backfill 은 어느
워크플로우에서도 호출하지 않으니 당장 문제는 없지만, 손으로 돌리면 "백필 완료"라고
찍으면서 1~2일치만 채운다. 그래서 cap 에 걸리면 경고를 찍는다.
"""

from __future__ import annotations

import sys
import time
from datetime import timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.details import (  # noqa: E402
    merge_details,
    pooled_sentiment_details,
    sentiment_details,
    store_abs_scale_details,
)
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402
from common.llm_sentiment import LlmUnavailableError, classify_titles  # noqa: E402

GALLERY_IDS = ["krstock", "stockus"]
MGALLERY_LIST_URL = "https://gall.dcinside.com/mgallery/board/lists/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}
REQUEST_DELAY_SEC = 1.5

# 갤러리당 긁는 페이지 수 = **표본 크기를 정하는 값**이다(50건/페이지 → 약 1,500건).
# 원래는 neostock(하루 47건) 시절 "무한 순회 방지용 안전장치"로 넣은 값이라 걸릴 일이
# 없었는데, 하루 1만 5천 건짜리 갤러리로 갈아탄 뒤로는 **매 실행 반드시 여기서 끊긴다**.
# 이름과 주석이 계속 '안전장치'라고 말하는 바람에 상수가 되어버린 건수를 16일 동안
# 아무도 이상하게 보지 않았다. 지금은 표집 손잡이로 취급한다(모듈 docstring 참고).
SAMPLE_PAGES = 30

# stockus(미국 주식 갤러리)는 활동량이 너무 많아(오늘자 1,500건을 넘겨도 전날로
# 못 넘어감) 30일 전체 백필이 비현실적이다. krstock만 30일 백필하고, stockus는
# 오늘부터의 값만 매일 누적해 나간다.
BACKFILL_GALLERY_IDS = ["krstock"]

BACKFILL_DAYS = 30
DAY_BOUNDARY_DELAY_SEC = 4.0  # 하루치 수집이 끝나고 다음 날짜로 넘어갈 때 추가로 쉬는 시간
MAX_BACKFILL_PAGES = 300  # 무한 순회 방지용 안전장치 (갤러리별, 30일치라 페이지 수가 더 많이 필요)
# 갤러리 목록에는 간혹 "개념글"처럼 원래 날짜의 오래된 글이 최신 글 사이에 끼어
# 나오는 경우가 있다(정상적인 시간순 정렬을 깨뜨림). 이런 행 하나만 보고 바로
# 종료하면 실제로는 더 있는 데이터를 놓칠 수 있으므로, 목표 범위보다 오래된 행이
# 연속으로 여러 개 나올 때만 완전히 지난 것으로 판단한다.
OLD_ROW_STREAK_THRESHOLD = 5

# slug는 과거 neostock "게시글 수" 시절과 동일하게 유지해 기존 히스토리와 연결을
# 끊지 않는다. name/description/unit만 감성 지수에 맞게 바꾼다.
INDICATOR_SLUG = "dcinside_post_count"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "디씨 주갤 감성 지수",
    "headline": "주식 갤러리 글에 드러난 낙관·비관",
    "category": "감성",
    "description_beginner": "낙관만 쏟아지면 개인 심리가 과열됐다는 신호입니다",
    "unit": "pt",
}


def fetch_page(gallery_id: str, page: int) -> BeautifulSoup:
    resp = requests.get(
        MGALLERY_LIST_URL,
        params={"id": gallery_id, "page": page},
        headers=HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def collect_recent_titles_for_gallery(gallery_id: str) -> tuple[list[str], dict]:
    """오늘자 게시글 중 **최신 SAMPLE_PAGES 페이지분**의 제목을 모은다.

    이름 그대로 '오늘 전부'가 아니다. 날짜 경계까지 거슬러 올라가는 종료 조건이
    함께 있지만, 지금 두 갤러리는 SAMPLE_PAGES(30) 가 자정에 닿기 한참 전에
    소진돼서 실제로는 늘 페이지 수로 끊긴다(모듈 docstring 참고). 날짜 조건은
    갤러리가 조용해진 날을 위한 예비 경로로만 남아 있다.

    갤러리 목록에는 간혹 "개념글"처럼 다른 날짜의 글이 최신 글 사이에 끼어
    나온다(정상적인 시간순 정렬을 깨뜨림). 이런 행 하나만 보고 바로 종료하면
    실제로는 오늘 글이 훨씬 많이 남아있어도 거기서 멈춰버리므로(krstock에서
    45건 만에 조기 종료된 원인이었다), 오늘이 아닌 행이 연속으로 여러 개
    나올 때만 오늘자 수집이 끝난 것으로 판단한다.

    돌려주는 meta 는 표본이 어디서 잘렸는지 남기기 위한 것이다:
    capped(페이지 수로 끊겼나) / newest·oldest(표본이 덮은 시각 범위).
    """
    today_str = today_kst().isoformat()
    titles: list[str] = []
    stamps: list[str] = []
    page = 1
    done = False
    consecutive_old_rows = 0

    while page <= SAMPLE_PAGES and not done:
        soup = fetch_page(gallery_id, page)
        rows = soup.select("table.gall_list tbody tr")
        if not rows:
            break

        for row in rows:
            if row.get("data-type") == "icon_notice":
                continue  # 상단 고정 공지

            date_td = row.select_one("td.gall_date")
            title_attr = date_td.get("title") if date_td else None
            if not title_attr:
                continue  # 설문/광고 등 실제 게시글이 아닌 행 (title 속성 없음)

            post_date = title_attr[:10]  # "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"

            if post_date != today_str:
                consecutive_old_rows += 1
                if consecutive_old_rows >= OLD_ROW_STREAK_THRESHOLD:
                    done = True
                    break
                continue
            consecutive_old_rows = 0

            title_link = row.select_one("td.gall_tit a:not(.reply_numbox)")
            titles.append(title_link.get_text(strip=True) if title_link else "")
            stamps.append(title_attr)

        print(f"[DCInside:{gallery_id}] {page}페이지 조회 완료 (누적 {len(titles)}건)")

        page += 1
        if not done:
            time.sleep(REQUEST_DELAY_SEC)

    # 페이지 예산을 다 쓰고도 날짜 경계에 못 닿았으면 표본이 잘린 것이다.
    capped = not done and page > SAMPLE_PAGES
    meta = {
        "count": len(titles),
        "capped": capped,
        "newest": max(stamps) if stamps else None,
        "oldest": min(stamps) if stamps else None,
    }
    span = f" ({meta['oldest']} ~ {meta['newest']})" if stamps else ""
    if capped:
        # 조용히 잘리던 것이 16일짜리 상수를 만들었다. 로그에서 바로 보이게 찍는다.
        print(
            f"[DCInside:{gallery_id}] ⚠️ {SAMPLE_PAGES}페이지 한도에서 끊김 — "
            f"오늘치 전수가 아니라 최신 {len(titles)}건 표본입니다{span}"
        )
    else:
        print(
            f"[DCInside:{gallery_id}] 날짜 경계까지 수집 완료 — "
            f"오늘치 전수 {len(titles)}건{span}"
        )
    return titles, meta


def collect_recent_titles() -> tuple[list[str], dict]:
    """두 갤러리 표본을 합치고, 표본이 어디서 잘렸는지를 함께 돌려준다."""
    all_titles: list[str] = []
    per_gallery: dict[str, dict] = {}
    for gallery_id in GALLERY_IDS:
        titles, meta = collect_recent_titles_for_gallery(gallery_id)
        all_titles.extend(titles)
        per_gallery[gallery_id] = meta
        time.sleep(REQUEST_DELAY_SEC)

    oldest = [m["oldest"] for m in per_gallery.values() if m["oldest"]]
    newest = [m["newest"] for m in per_gallery.values() if m["newest"]]
    sample = {
        # 표본이 하루치 전수가 아니라는 사실을 저장 행에도 남긴다. 화면은 아직 안 읽지만,
        # 이 값이 있어야 나중에 "그날 표본이 잘렸나"를 로그 없이 되짚을 수 있다.
        "sample_capped_1d": any(m["capped"] for m in per_gallery.values()),
        "sample_oldest_1d": min(oldest) if oldest else None,
        "sample_newest_1d": max(newest) if newest else None,
        "sample_by_gallery_1d": {g: m["count"] for g, m in per_gallery.items()},
    }
    return all_titles, sample


def compute_sentiment(titles: list[str]) -> dict:
    labels = classify_titles(titles, source="커뮤니티 갤러리", slang=True)
    positive = labels.count("positive")
    negative = labels.count("negative")
    neutral = labels.count("neutral")

    total = len(titles)
    score = (positive - negative) / total * 100 if total else 0.0
    return {
        "positive": positive,
        "negative": negative,
        "neutral": neutral,
        "total": total,
        "score": score,
    }


def collect_daily_titles_for_gallery(
    gallery_id: str, oldest_missing: str
) -> dict[str, list[str]]:
    day_titles: dict[str, list[str]] = {}
    current_day: str | None = None
    page = 1
    done = False
    consecutive_old_rows = 0

    while page <= MAX_BACKFILL_PAGES and not done:
        soup = fetch_page(gallery_id, page)
        rows = soup.select("table.gall_list tbody tr")
        if not rows:
            break

        for row in rows:
            if row.get("data-type") == "icon_notice":
                continue

            date_td = row.select_one("td.gall_date")
            title_attr = date_td.get("title") if date_td else None
            if not title_attr:
                continue

            post_date = title_attr[:10]

            if post_date < oldest_missing:
                consecutive_old_rows += 1
                if consecutive_old_rows >= OLD_ROW_STREAK_THRESHOLD:
                    done = True
                    break
                continue
            consecutive_old_rows = 0

            if post_date != current_day:
                if current_day is not None:
                    print(
                        f"[DCInside:{gallery_id}] {current_day} 수집 완료: "
                        f"{len(day_titles.get(current_day, []))}건"
                    )
                    time.sleep(DAY_BOUNDARY_DELAY_SEC)
                current_day = post_date

            title_link = row.select_one("td.gall_tit a:not(.reply_numbox)")
            title_text = title_link.get_text(strip=True) if title_link else ""
            day_titles.setdefault(post_date, []).append(title_text)

        print(f"[DCInside:{gallery_id}] {page}페이지 조회 완료")
        page += 1
        if not done:
            time.sleep(REQUEST_DELAY_SEC)

    if current_day is not None:
        print(
            f"[DCInside:{gallery_id}] {current_day} 수집 완료: "
            f"{len(day_titles.get(current_day, []))}건"
        )

    if not done and page > MAX_BACKFILL_PAGES:
        # krstock 하루가 292페이지라 300페이지 예산은 하루치밖에 못 거슬러 간다.
        # 여기 안 걸리고 조용히 끝나면 "백필 완료"가 거짓말이 된다(모듈 docstring 참고).
        print(
            f"[WARNING] [DCInside:{gallery_id}] {MAX_BACKFILL_PAGES}페이지 한도에서 끊겨 "
            f"{oldest_missing} 까지 못 갔습니다. 수집된 날짜: "
            f"{min(day_titles) if day_titles else '-'} ~ {max(day_titles) if day_titles else '-'}. "
            "요청한 기간 전체가 채워지지 않습니다."
        )

    return day_titles


def backfill_daily_sentiment(client, indicator_id: str) -> None:
    """최근 BACKFILL_DAYS일치 감성 스코어를 두 갤러리 합산 기준으로 백필한다.

    이미 저장된 날짜라도 그 날짜의 게시글이 흩어져 있는 페이지 자체는 순서상
    반드시 거쳐가야 하지만(페이지네이션에 날짜 점프 기능이 없음), 이미 저장된
    날짜는 최종 저장 단계에서 제외해 중복 upsert를 하지 않는다.
    """
    today = today_kst()
    target_dates = {
        (today - timedelta(days=offset)).isoformat() for offset in range(BACKFILL_DAYS)
    }

    existing = (
        client.table("indicator_values")
        .select("date")
        .eq("indicator_id", indicator_id)
        .in_("date", list(target_dates))
        .execute()
    )
    existing_dates = {row["date"] for row in existing.data}
    missing_dates = target_dates - existing_dates

    if not missing_dates:
        print(f"[DCInside] 백필할 신규 날짜 없음 (최근 {BACKFILL_DAYS}일 모두 저장됨)")
        return

    oldest_missing = min(missing_dates)
    print(f"[DCInside] 백필 대상 {len(missing_dates)}일 (가장 오래된 날짜: {oldest_missing})")

    combined_titles: dict[str, list[str]] = {}
    for gallery_id in BACKFILL_GALLERY_IDS:
        gallery_titles = collect_daily_titles_for_gallery(gallery_id, oldest_missing)
        for d, titles in gallery_titles.items():
            combined_titles.setdefault(d, []).extend(titles)

    rows_to_save = []
    for d, titles in combined_titles.items():
        if d not in missing_dates:
            continue
        result = compute_sentiment(titles)
        score = round(result["score"], 2)
        rows_to_save.append(
            {"indicator_id": indicator_id, "date": d, "raw_value": score, "details": sentiment_details(result)}
        )
        print(
            f"[DCInside] {d}: 긍정 {result['positive']} / 부정 {result['negative']} / "
            f"중립 {result['neutral']} (전체 {result['total']}) -> {score}pt"
        )

    if rows_to_save:
        client.table("indicator_values").upsert(
            rows_to_save, on_conflict="indicator_id,date"
        ).execute()
    print(f"[DCInside] 백필 완료: {len(rows_to_save)}일치 저장")


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    if "--backfill" in sys.argv:
        backfill_daily_sentiment(client, indicator_id)
        # 감성 게이지가 '자기 최근 범위 대비'로 마커를 배치할 수 있게 스케일 저장.
        store_abs_scale_details(client, indicator_id)
        return

    titles, sample = collect_recent_titles()
    result = compute_sentiment(titles)
    today = today_kst().isoformat()

    print(
        f"[DCInside] 오늘({today}) 감성 분류 — 긍정 {result['positive']}건 / "
        f"부정 {result['negative']}건 / 중립 {result['neutral']}건 "
        f"(전체 {result['total']}건, 갤러리: {', '.join(GALLERY_IDS)})"
    )
    if sample["sample_capped_1d"]:
        print(
            f"[DCInside] ↑ 하루치 전수가 아니라 {sample['sample_oldest_1d']} ~ "
            f"{sample['sample_newest_1d']} 구간 표본입니다 "
            f"(갤러리별 {sample['sample_by_gallery_1d']})"
        )

    if result["total"]:
        neutral_ratio = result["neutral"] / result["total"] * 100
        if neutral_ratio >= 80:
            print(
                f"[WARNING] 중립 비율이 {neutral_ratio:.1f}%로 매우 높습니다. "
                "config/sentiment_keywords.py의 키워드를 보강하는 걸 권장합니다."
            )

    # 뉴스와 같은 이유로 풀링한다 — 하루치 순감성이 LLM 재분류 변동에 출렁이므로
    # 여러 날 원자를 합산해 그 노이즈를 눌러 준다(common.details).
    #
    # (옛 주석은 "같은 ~2,987건을 매일 다시 분류해"라고 적혀 있었는데 사실이 아니다.
    #  건수가 매일 2,987로 같은 건 같은 글을 다시 보기 때문이 아니라 SAMPLE_PAGES 에서
    #  잘리기 때문이고, 실제 내용은 매일 다른 두 시간짜리 표본이다. 모듈 docstring 참고.)
    score, pooled = pooled_sentiment_details(client, indicator_id, today, result)
    print(
        f"[DCInside] 오늘 순감성 {round(result['score'], 2)}pt → "
        f"{pooled['pool_days']}일 풀링 {score}pt (분석 {pooled['total_count']}건)"
    )

    # 같은 날 재실행이면 이미 details가 있을 수 있어 병합해서 쓴다(공유 칸).
    client.table("indicator_values").upsert(
        {
            "indicator_id": indicator_id,
            "date": today,
            "raw_value": score,
            "details": merge_details(client, indicator_id, today, {**pooled, **sample}),
        },
        on_conflict="indicator_id,date",
    ).execute()
    print(f"[Supabase] indicator_values upsert 완료: date={today}, raw_value={score}")

    # 감성 게이지가 '자기 최근 범위 대비'로 마커를 배치할 수 있게 스케일 저장.
    updated = store_abs_scale_details(client, indicator_id)
    print(f"[Supabase] 감성 스케일 details 저장 완료: {updated}건")


if __name__ == "__main__":
    try:
        main()
    except LlmUnavailableError as e:
        # 분류가 안 되면 그날 값을 쓰지 않는다 — 옛 키워드 방식으로 몰래 되돌아가면
        # 스케일이 다른 값이 시계열에 섞여 더 나쁘다. 워크플로우는 continue-on-error 다.
        print(f"[WARNING] [DCInside] LLM 분류 불가로 오늘 계산을 건너뜁니다: {e}")

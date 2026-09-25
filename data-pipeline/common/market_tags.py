"""국장 카더라가 '미장 글'을 가려내는 규칙 — 메시지에 붙은 종목 태그 수로 가른다.

국장·미장 카더라는 **같은 채널**을 읽는다. 미장은 같은 메시지를 미국 종목 사전으로 한 번
더 읽을 뿐이라(extract_telegram_us_stocks.py), 국장이 보는 글에도 미장 이야기가 원래 섞여
있다. 2026-09-12~09-25 분류된 글 40,636건 중 미국 종목만 붙은 글이 4,408건(10.8%)이었다.

국장 쪽에서 쓰는 판정은 둘이다.

  is_us_only  미국 종목이 붙었고 국내 종목은 하나도 없다 → **뺀다**
  is_kr_led   국내 종목이 붙었고 그 수가 미국 종목 수 이상이다 → **먼저 싣는다**

빼는 기준은 트렌딩 카드(calculate_telegram_trending.us_only_keys)와 같다. 국내 종목이
하나라도 붙어 있으면 빼지 않는다 — 'SK하이닉스·AMD 에 베팅' 같은 글은 국장 이야기이기도
하다. 태그가 아무것도 없는 시황·금리 글도 남긴다.

⚠️ **비율로 빼면 국장 글이 같이 빠진다.** '미국 태그가 국내의 N배 이상이면 미장 글'을
   재 봤다(같은 14일, 도달 상위). N=3 이면 '아셴브레너, SK하이닉스·AMD 에 베팅'(미국 3 ·
   국내 1)이, N=4 면 '프리마켓 메모리주 일제히 하락, SK하이닉스 6% 이상 하락'(4 · 1)과
   SK증권 반도체 뉴스 묶음(9 · 2)이 미장 글이 된다. 미국 시황 정리 글('*특징 종목' 은
   미국 32~52 · 국내 1~2)을 잡으려던 것인데 그 사이에 국장 글이 너무 많다.
   그래서 빼는 건 위 규칙 하나로 두고, 시황 정리 글은 '먼저 싣기'(is_kr_led)에서만
   밀어낸다. 먼저 싣는 자리를 놓쳐도 뒤에서 도달 순으로 다시 다툰다.

⚠️ 태그 표 둘은 매 실행 **전량 삭제 후 삽입**이다. 조회가 실패하면 호출부는 거르지 않고
   예전처럼 지나간다 — 요약이 통째로 비는 것보다 미장 글이 몇 건 섞이는 쪽이 낫다.
"""

from __future__ import annotations

from collections import defaultdict

from common.supabase_client import PAGE_SIZE

KR_TAGS = ("telegram_message_stocks", "stock_code")
US_TAGS = ("telegram_message_us_stocks", "ticker")

# `.in_()` 목록이 길면 URL 이 커져 요청 자체가 안 나간다(generate_telegram_narratives.TEXT_CHUNK).
ID_CHUNK = 50


def is_us_only(kr_n: int, us_n: int) -> bool:
    """미국 종목만 붙은 글. 국장 쪽 재료·집계에서 뺀다."""
    return us_n > 0 and kr_n == 0


def is_kr_led(kr_n: int, us_n: int) -> bool:
    """국내 종목이 앞선 글. 국장 총평 발췌가 먼저 싣는다."""
    return kr_n > 0 and kr_n >= us_n


def tag_counts(db, tags: tuple[str, str], keys) -> dict[tuple[str, int], int]:
    """(채널, 번호) 마다 붙은 **서로 다른** 종목 수. 태그가 없는 짝은 결과에 없다.

    ⚠️ message_id 는 채널 안에서만 유일하다. 번호로 좁혀 받은 뒤 (채널, 번호)로 짝짓는다
    (calculate_telegram_trending.tagged_keys 와 같은 함정). 한 번호가 여러 채널에 있어
    행이 1,000행 상한에 걸릴 수 있으므로 페이징한다.
    """
    table, col = tags
    want = set(keys)
    ids = sorted({mid for _, mid in want})
    seen: dict[tuple[str, int], set[str]] = defaultdict(set)
    for i in range(0, len(ids), ID_CHUNK):
        chunk = ids[i : i + ID_CHUNK]
        start = 0
        while True:
            page = (
                db.table(table)
                .select(f"channel_handle,message_id,{col}")
                .in_("message_id", chunk)
                .order("id")
                .range(start, start + PAGE_SIZE - 1)
                .execute()
                .data
            ) or []
            for r in page:
                key = (r["channel_handle"], r["message_id"])
                if key in want:
                    seen[key].add(r[col])
            if len(page) < PAGE_SIZE:
                break
            start += PAGE_SIZE
    return {k: len(v) for k, v in seen.items()}


def market_counts(db, keys) -> tuple[dict, dict] | None:
    """국내·미국 태그 수. 조회가 실패하면 None — 호출부는 거르지 않고 지나간다."""
    try:
        return tag_counts(db, KR_TAGS, keys), tag_counts(db, US_TAGS, keys)
    except Exception as exc:  # noqa: BLE001 — 무엇이 터지든 재료는 남긴다
        print(f"[경고] 종목 태그를 못 읽어 미장 글을 가르지 않습니다: {exc}")
        return None

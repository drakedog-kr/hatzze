"""지표 행 보장 — 모든 fetch 스크립트가 공유한다. 전 기록 병합 upsert·dev 미리보기 JSON 도 여기 있다(아래).

예전엔 이 함수가 25개 스크립트에 복붙돼 있었고, 구현이 6종으로 갈라져 있었다.
그중 5개만 이미 있는 행의 메타데이터를 UPDATE했고 **나머지 20개는 삽입만** 했다.
그래서 그 20개는 스크립트의 INDICATOR_META(이름·설명·단위)를 고쳐도 DB에 영영
반영되지 않았다 — 실제로 put_call_ratio의 unit이 코드 "배" / DB "" 로 어긋나
있었다(옵션 API 승인 전 손으로 넣은 행이 남아 있었기 때문).

그래서 여기 하나로 두고 **코드를 소스 오브 트루스로** 만든다: 행이 있으면
메타데이터를 덮어쓰고, 없으면 넣는다.
"""

from __future__ import annotations

import json
from pathlib import Path


def ensure_indicator(client, meta: dict) -> str:
    """slug 로 지표 행을 찾아 없으면 만들고, 있으면 메타데이터를 코드 기준으로 맞춘다.

    **meta 에 담긴 키만 덮어쓴다.** 그래서 무엇을 META 에 넣느냐가 곧 "코드가 관리하는
    필드"의 정의가 된다. 지금 기준은 이렇다:

    - name·headline·description_beginner·unit·category — 항상 META 에 둔다(코드가 관리)
    - is_public — 내부용 원본(kospi_close_raw 등)처럼 **코드가 성격상 확정하는** 지표만
      META 에 넣는다. 나머지는 운영자가 DB 에서 정하므로 넣지 않는다.
    - direction — 점수 계산은 config/indicator_thresholds.py 를 보지만, 카드의 "이하/이상"
      표기는 DB 컬럼을 보므로 둘을 맞춰야 하는 지표만 META 에 넣는다(put_call_ratio).
    - weight — **META 에 넣지 않는다.** 가중치의 소스 오브 트루스는
      config/indicator_weights.py 이고, calculate_score 가 실행마다 DB 를 그 값으로
      동기화한다. META 에도 두면 두 곳이 서로 덮어써 낡은 값이 되살아난다
      (2026-07-23 이전에 4개 스크립트가 그러고 있었다).

    반환: indicators.id
    """
    slug = meta["slug"]
    existing = client.table("indicators").select("id").eq("slug", slug).execute()
    if existing.data:
        indicator_id = existing.data[0]["id"]
        updates = {k: v for k, v in meta.items() if k != "slug"}
        if updates:
            client.table("indicators").update(updates).eq("id", indicator_id).execute()
        return indicator_id
    return client.table("indicators").insert(meta).execute().data[0]["id"]


def upsert_merged(client, indicator_id: str, rows: list[dict], series_keys: tuple[str, ...]) -> int:
    """전 기록을 다시 쓰되 details 는 기존 키와 병합한다.

    details 는 calculate_score 와 나눠 쓰는 칸이다(hot_threshold 를 얹는다). 통째로 대입하면 그 키가 날아가므로
    기존 값을 읽어 내 키만 얹는다. 차트 점(series_keys)만은 지난 행에서 걷는다 — 어제의 최신 행에 실렸던 배열이
    오늘부터는 아무도 안 보는 짐이 된다. 500행씩 끊어 보낸다.
    """
    from common.supabase_client import load_keyset

    existing = {
        r["date"]: (r.get("details") or {})
        for r in load_keyset(
            client, "indicator_values", "id,date,details", narrow=lambda q: q.eq("indicator_id", indicator_id)
        )
    }
    payload = []
    for r in rows:
        kept = {k: v for k, v in existing.get(r["date"], {}).items() if k not in series_keys}
        payload.append({"indicator_id": indicator_id, **r, "details": {**kept, **r["details"]}})
    for i in range(0, len(payload), 500):
        client.table("indicator_values").upsert(payload[i : i + 500], on_conflict="indicator_id,date").execute()
    return len(payload)


def write_preview(meta: dict, rows: list[dict], path: str) -> dict:
    """DB 를 안 건드리고, 로컬 dev 오버레이(dev-overrides.json 의 indicators)에 넣을 한 항목을 쓴다.

    과열도(normalized_score)·기준선(threshold)은 calculate_score 와 같은 함수로 낸다 — 운영에선 calculate_score 가
    쓰는 값이라, 미리보기도 그 값과 같아야 카드 색·배지가 같다.
    """
    from config.indicator_thresholds import INDICATOR_THRESHOLDS
    from config.indicator_weights import INDICATOR_WEIGHTS
    from scripts.calculate_score import HOT_ZONE, compute_progress, raw_at_progress

    slug = meta["slug"]
    cfg = INDICATOR_THRESHOLDS[slug]
    last = rows[-1]
    recent = rows[-30:]
    entry = {
        **meta,
        "direction": "high",
        "weight": INDICATOR_WEIGHTS.get(slug, 1.0),
        "latest": {
            "date": last["date"],
            "raw_value": last["raw_value"],
            "normalized_score": round(compute_progress(slug, last["raw_value"], cfg["threshold"], cfg), 2),
            "threshold": round(raw_at_progress(slug, HOT_ZONE, cfg["threshold"], cfg) or 0, 2),
            "details": last["details"],
        },
        "history": [r["raw_value"] for r in recent],
        "historyPoints": [{"date": r["date"], "value": r["raw_value"]} for r in recent],
    }
    Path(path).write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[미리보기] {path} — {last['date']} {last['raw_value']:+.1f}{meta.get('unit', '')} · 과열도 {entry['latest']['normalized_score']}")
    return entry

"""지난 daily_score 를 지금의 계산 코드로 다시 낸다 — 홈 '과열도 추이' 그래프가 이어지게.

**왜 필요한가.** daily_score 는 매일 **그날의 눈금**으로 한 줄씩 쌓인다. 가중치·눈금·표시 앵커를 바꾸면
그 앞뒤 행이 다른 잣대로 잰 값이 돼, 그래프에 시장에 없던 급락·반등이 그려진다(2026-08 검사: 07-30 36 →
07-31 28 → 41 의 V자는 전부 눈금 유물이었다). 눈금을 바꿨으면 이 스크립트로 지난 행을 다시 쓴다.

**어떻게 재나.** calculate_score.main() 의 계산을 날짜 d 마다 '그날까지의 최신 행'으로 그대로 재현한다.
- 지표별 값: date <= d 인 행 중 가장 최근 것(라이브와 같은 규칙)
- cumulative_average 기준선: date <= d 인 값만의 평균(그날 알 수 있던 것만 — 미래 값을 끌어오지 않는다)
- relative_surge: 그 행 details 의 surge_pct · level_pct
- 실물–증시 괴리: date <= d 인 CCSI · 코스피 신고가 괴리율
- 가중치 · 표시 앵커(SCORE_DISPLAY_ANCHORS) · 구간: 지금 코드 값
⚠️ backfill_scores.py 의 --daily-score 는 쓰지 말 것 — 표시 앵커를 안 거친 가중평균을 쓴다(2026-09-25 발견).

**저장값과 다른 까닭 둘.** 눈금이 바뀐 날(08-06 이전) 말고도 최근 행이 조금씩 다르다. 저녁 실행은 그날 KRX 값이
다음 날 아침에야 올라와 **전날 값으로** 점수를 냈고, 재계산은 그 날짜의 최종 자료를 쓴다. 그래프로는
재계산 값이 그날 시장에 더 가깝다.

**안전장치.** 가장 최근 날짜(오늘 행)는 calculate_score 가 방금 쓴 값이라 재계산과 같아야 한다. 0.01 넘게
어긋나면 계산이 라이브와 갈라진 것이니 아무것도 안 쓰고 멈춘다. 오늘 행은 쓰지 않는다(calculate_score 몫).
쓰는 칸은 score · stage 둘뿐이다(updated_at · ai_summary 는 그대로 둔다).

⚠️ 쓰면 이 표를 읽는 곳이 모두 새 값을 본다: 히어로 '전일 대비'(최근 2행) · 히어로 추세 문장(8행,
generate_daily_summary) · 채널 발송 요약(broadcast_digest). 셋 다 '같은 잣대의 과거'를 보게 되는 쪽이다.

실행:
    python scripts/recompute_score_history.py                      # 미리보기(표만 찍는다)
    python scripts/recompute_score_history.py --json out.json      # 로컬 미리보기용(dev-overrides.json 의 scoreHistory)
    python scripts/recompute_score_history.py --apply              # 어제까지 전부 다시 쓴다
    python scripts/recompute_score_history.py --from 2026-07-09 --apply
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from config.indicator_thresholds import INDICATOR_THRESHOLDS  # noqa: E402
from config.indicator_weights import INDICATOR_WEIGHTS  # noqa: E402
import calculate_score as cs  # noqa: E402

# calculate_score.main() 안의 괴리 눈금과 같아야 한다(거기 지역 상수라 가져올 수 없다).
LEAD_FLOOR, LEAD_CEIL = -75.0, 45.0


def load_series(db, indicator_id: str) -> list[dict]:
    """(date, raw_value, details) 전부, 날짜 오름차순. 1,000행 상한을 넘길 수 있어 이어 받는다."""
    out, start = [], 0
    while True:
        page = (
            db.table("indicator_values")
            .select("date,raw_value,details")
            .eq("indicator_id", indicator_id)
            .order("date")
            .range(start, start + 999)
            .execute()
            .data
        )
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def latest(rows: list[dict], d: str) -> dict | None:
    best = None
    for r in rows:
        if r["date"] > d:
            break
        best = r
    return best


def score_on(d: str, series: dict[str, list[dict]], weights_db: dict[str, float]) -> dict | None:
    items = []
    for slug in cs.INDICATOR_ORDER:
        rows = series.get(slug) or []
        row = latest(rows, d)
        if row is None:
            continue
        cfg = INDICATOR_THRESHOLDS[slug]
        cur = float(row["raw_value"])
        det = row.get("details") or {}
        if cfg["kind"] == "fixed":
            thr = cfg["threshold"]
        else:
            thr = statistics.mean(float(r["raw_value"]) for r in rows if r["date"] <= d)
        prog = cs.compute_progress(slug, cur, thr, cfg)
        capped = cs.cap_progress(prog)
        rs = cfg.get("relative_surge")
        if rs is not None:
            surge = det.get("surge_pct")
            if surge is not None:
                prog = (surge - rs["floor"]) / (rs["ceil"] - rs["floor"]) * 100
                lw = cfg.get("level_weight")
                level = det.get("level_pct")
                if lw and level is not None:
                    prog = cs.cap_progress(prog) * (1 - lw) + float(level) * lw
                capped = cs.cap_progress(prog)
        weight = INDICATOR_WEIGHTS.get(slug, weights_db.get(slug, 1.0))
        items.append({"slug": slug, "capped": capped, "weight": weight})

    by = {i["slug"]: i for i in items}
    sb = by.get("small_business_crisis_index")
    c = latest(series.get(cs.CCSI_SLUG) or [], d)
    g = latest(series.get("kospi_high_gap") or [], d)
    if sb and by.get("kospi_high_gap") and c is not None and g is not None:
        real = cs.percentile_from_anchors(float(c["raw_value"]), cs.CCSI_PCTILE_ANCHORS)
        mkt = cs.percentile_from_anchors(float(g["raw_value"]), cs.KOSPI_DD_PCTILE_ANCHORS)
        lead = mkt - real  # +면 증시 앞섬, −면 실물 앞섬
        sb["capped"] = cs.cap_progress((lead - LEAD_FLOOR) / (LEAD_CEIL - LEAD_FLOOR) * 100)

    wsum = sum(i["weight"] for i in items)
    if not wsum:
        return None
    raw = sum(i["weight"] * i["capped"] for i in items) / wsum
    disp = cs.percentile_from_anchors(raw, cs.SCORE_DISPLAY_ANCHORS)
    return {"score": round(disp, 2), "stage": cs.stage_for_score(disp), "raw": round(raw, 2), "n": len(items)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="since", help="이 날짜부터(YYYY-MM-DD). 없으면 daily_score 첫 행부터")
    ap.add_argument("--apply", action="store_true", help="daily_score 에 쓴다(없으면 미리보기)")
    ap.add_argument("--json", help="날짜·재계산 점수를 이 파일로 낸다(dev-overrides.json 의 scoreHistory 꼴)")
    args = ap.parse_args()

    db = get_client()
    meta = db.table("indicators").select("id,slug,weight").execute().data
    ids = {r["slug"]: r["id"] for r in meta}
    weights_db = {r["slug"]: float(r["weight"]) for r in meta if r.get("weight") is not None}
    wanted = set(cs.INDICATOR_ORDER) | {cs.CCSI_SLUG, "kospi_high_gap"}
    series = {slug: load_series(db, ids[slug]) for slug in wanted if slug in ids}

    stored = {r["date"]: r for r in db.table("daily_score").select("date,score,stage").order("date").execute().data}
    if not stored:
        print("daily_score 가 비어 있습니다.")
        return
    today = today_kst().isoformat()
    newest = max(stored)
    first = date.fromisoformat(args.since or min(stored))

    # 안전장치: 가장 최근 행은 라이브 계산 그대로여야 한다.
    check = score_on(newest, series, weights_db)
    if check is None or abs(check["score"] - float(stored[newest]["score"])) > 0.01:
        print(f"[중단] {newest} 재계산 {check and check['score']} ≠ 저장 {stored[newest]['score']} — 계산이 calculate_score 와 갈라졌습니다.")
        sys.exit(1)
    print(f"[확인] {newest} 재계산 {check['score']} = 저장 {stored[newest]['score']}")

    rows, d = [], first
    until = min(date.fromisoformat(newest), date.fromisoformat(today) - timedelta(days=1))
    while d <= until:
        k = d.isoformat()
        r = score_on(k, series, weights_db)
        if r is not None and k in stored:
            rows.append({"date": k, "old": float(stored[k]["score"]), **r})
        d += timedelta(days=1)

    changed = [r for r in rows if abs(r["score"] - r["old"]) >= 0.005]
    print(f"{'날짜':12}{'저장':>8}{'재계산':>8}{'차이':>8}{'구간':>6}{'지표':>5}")
    for r in rows:
        print(f"{r['date']:12}{r['old']:>8.2f}{r['score']:>8.2f}{r['score'] - r['old']:>+8.2f}{r['stage']:>6}{r['n']:>5}")
    print(f"\n{len(rows)}일 중 {len(changed)}일이 달라집니다(오늘 {today} 행은 안 쓴다).")

    if args.json:
        Path(args.json).write_text(json.dumps([{"date": r["date"], "score": r["score"]} for r in rows], ensure_ascii=False, indent=1))
        print(f"[json] {args.json} 에 {len(rows)}행")

    if not args.apply:
        print("[미리보기] --apply 를 붙이면 daily_score 의 score · stage 를 고칩니다.")
        return
    for r in changed:
        db.table("daily_score").update({"score": r["score"], "stage": r["stage"]}).eq("date", r["date"]).execute()
    print(f"[Supabase] daily_score {len(changed)}행을 지금 눈금으로 고쳤습니다.")


if __name__ == "__main__":
    main()

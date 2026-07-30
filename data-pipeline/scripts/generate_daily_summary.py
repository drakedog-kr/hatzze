"""오늘의 과열도 지수와 지표들을 LLM(Claude Haiku)으로 2~3문장 요약해
daily_score.ai_summary에 저장한다. 프론트 히어로 카드가 이 문장을 읽어 렌더한다.

calculate_score.py가 daily_score/indicator_values를 채운 뒤 실행하는 후속 단계다.
LLM 호출이 실패하거나 키가 없어도 파이프라인 본체(점수 계산)엔 영향이 없도록,
워크플로에선 continue-on-error로 돌리고 실패 알림 집계에서도 제외한다.

⚠️ 공개 저장소 + 법적 이유로, 이 요약은 시장의 "과열도"만 서술한다. 매수·매도·투자
권유, 목표가, 상승/하락 전망은 시스템 프롬프트에서 강하게 금지한다(아래 SYSTEM).
숫자는 지표가 준 값만 쓰고 지어내지 않는다. 면책 문구는 프론트가 따로 보여주므로
요약엔 넣지 않는다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from anthropic import Anthropic  # noqa: E402

from common.config import ANTHROPIC_API_KEY  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.text_check import is_clean, problems  # noqa: E402

# Haiku 4.5 — 2~3문장 짧은 요약엔 충분히 빠르고 저렴하다. 하루 2회 실행이라 비용은
# 사실상 무시 가능. (thinking/effort 파라미터는 Haiku 4.5에서 불필요/미지원이라 안 쓴다.)
MODEL = "claude-haiku-4-5"

# 초고온 진입선 = 진행률 ≥ 75. calculate_score.py의 HOT_ZONE과 동일하게 맞춘다.
# 이 지점이 곧 카드에 "기준선"으로 적히는 값이라, 화면·요약·배지가 한 지점을 가리킨다.
HOT_ZONE = 75.0


def cap_progress(progress: float) -> float:
    """진행률을 0~100으로 클램핑. calculate_score.cap_progress와 동일."""
    return min(max(progress, 0.0), 100.0)


# 문장 검수(깨진 글자·오타)는 common/text_check.py 가 맡는다. 예전엔 여기서 대체문자
# (U+FFFD) 하나만 봤는데, 그 그물은 "잦아들기"→"낙아들기" 같은 오타를 통과시킨다 —
# 음절이 전부 정상 한글이라 문자 검사로는 못 잡는다. **원문(digest)을 함께 넘겨야**
# 어절 검사까지 돈다. 자세한 규칙과 실측 근거는 그 파일 주석 참고.


def stage_for_score(score: float) -> str:
    """종합 점수 → 구간. calculate_score.stage_for_score와 동일(밴드 25/50/75)."""
    if score < 25:
        return "저온"
    if score < 50:
        return "상온"
    if score < 75:
        return "고온"
    return "초고온"


# 요약 포맷은 항상 오프너(프론트 고정) + 주인공 지표 뜻풀이 + 최근 추세 = 3문단이다.
# 한 번의 호출로 '2문장'을 강제하면 모델이 종종 3문장을 뱉어 문단 수가 흔들려서,
# 주인공 문장과 추세 문장을 '따로' 생성한다(각 호출은 딱 한 문장). 이렇게 하면 문단
# 수가 항상 정확히 2로 고정된다. 두 문장은 개행으로 이어 저장하고 프론트가 개행으로
# 나눠 각각 한 문단으로 렌더한다.
COMMON = """\
당신은 한국 주식시장의 "과열도(온도)"를 보여주는 대시보드 '햇쩨(hatzze)'의 오늘의 요약을 쓰는 작성자입니다.
아래 데이터를 보고, 지시된 '한 문장'만 씁니다.

[말투]
- **모든 문장을 '~습니다'/'~ㅂ니다'로 끝맺습니다**(예: "~한 흐름입니다", "~로 보입니다", "~가 눈에 띕니다").
  "~이에요", "~예요", "~네요", "~어요", "~죠" 같은 해요체는 절대 쓰지 마세요. 과장 없이 데이터만큼만.
- 대시(—, –)를 문장 부호로 쓰지 마세요. 절을 이을 땐 마침표로 문장을 끊습니다.

[데이터 읽는 법]
- 각 지표의 '과열도'(0=저온 ~ 100=초고온)가 그 지표가 얼마나 뜨거운지의 유일한 값입니다.
  높을수록 뜨겁고 낮을수록 식은 것입니다. 방향을 절대 뒤집지 마세요.
- 헤드라인 '햇쩨 지수'는 ℃로, 개별 지표는 과열도 %로 말합니다.

[강조 형식]
- 중요한 부분(지표 이름, 핵심 수치)은 **별표 두 개로 감싸** 굵게. 예: **깃헙 트레이딩봇 저장소 생성 수**.
- 온도 단어(저온/상온/고온/초고온)는 별표로 감싸지 마세요(색 자동). 그 외 마크다운·목록·제목 금지.

[절대 하지 말 것]
- **'← 이 지표는 문장에 쓰지 마세요' 표시가 붙은 지표를 언급하는 것.** 이름조차 꺼내지
  마세요. 아무리 뜨거워도, 어떤 문장에서도 안 됩니다(그 지표는 화면 카드로 따로 보입니다).
- 매수/매도/투자 권유·신호, 목표가, 상승/하락 예측('오를 것/내릴 것/앞으로').
- 데이터에 없는 숫자, 카테고리(시장/감성) 평균 비교 같은 근거 없는 일반화, 특정 종목·인물·정치 언급.
- 면책 문구(화면에 따로 있음).

[출력] 설명·머리말 없이, 지시된 딱 '한 문장'만 출력하세요."""

# 문단 2: 주인공 지표 + 뜻풀이 (A)
#
# 주인공은 '시장' 카테고리에서만 고른다. 감성 지표(검색량·커뮤니티 말투·유튜브 조회수)는
# 하루치 잡음이 크고 대체로 시장 지표보다 과열도가 높게 튄다 — 그냥 '가장 뜨거운 하나'를
# 고르게 두면 요약 문단이 며칠씩 감성 지표만 물고 늘어졌다. 지수의 무게중심은 시장 쪽이니
# 주인공도 거기서 고른다(감성은 3문단의 추세와 카드들이 계속 보여준다).
SPOTLIGHT_SYSTEM = COMMON + """

[이번 문장 — 주인공 지표 뜻풀이]
**카테고리가 '시장'인 지표 중에서만** 과열도가 가장 높은(가장 뜨거운) 지표 '하나'를 골라,
이름과 함께 그 지표가 무엇을 재는지·왜 뜨거운 게 의미 있는지를 쉬운 말로 한 문장에 담으세요.
'감성' 지표가 더 뜨겁더라도 고르지 마세요(시장 지표가 하나도 없을 때만 감성에서 고릅니다).
지표 밑 '뜻:' 설명을 근거로 삼되 그대로 베끼진 마세요. 지표는 하나만 씁니다. 여러 개를
나열하지 마세요."""

# 문단 3: 최근 추세 (②)
TREND_SYSTEM = COMMON + """

[이번 문장 — 최근 추세]
[최근 추세] 수치를 근거로, 최근 며칠간 '햇쩨 지수'가 어떻게 움직였는지 흐름을 한 문장에
담으세요. (예: "지난주 50℃대에서 며칠째 내려와 오늘 25℃까지 식은 흐름입니다.") 과거
궤적만 서술하고 앞으로의 방향은 예측하지 마세요."""


# 첫 문장(주인공 뜻풀이)에 근거를 주기 위해, 상위 몇 개 지표엔 설명문(뜻)을 함께 붙인다.
DESC_TOP_N = 5

# 주인공 문장이 고르는 카테고리. '뜻:' 설명도 이 카테고리 상위 N개에 붙여야 한다 —
# 전체 상위 5개에만 붙이면, 시장 지표가 전체 8위쯤에 있는 날엔 주인공으로 뽑힌 지표에
# 근거가 하나도 안 딸려 가서 모델이 뜻을 지어내야 한다(프롬프트가 금지한 바로 그 일).
SPOTLIGHT_CATEGORY = "시장"

# 히어로 요약 한 문장의 길이. 길이 규칙이 아예 없어서 문장이 들쭉날쭉했다 —
# 실측(2026-07-25~26): 111자 · 95자 · 108자 · 57자. 57자짜리는 앞뒤 문단과 나란히 놓였을 때
# 혼자 말이 없어 보인다. 하한을 두는 게 핵심이고(짧은 쪽이 문제였다), 상한은 문단이
# 지나치게 길어지지 않게 두는 안전장치다.
#
# **두 문장의 범위를 다르게 잡는다.** 주인공 문장은 지표가 무엇을 재는지 풀어야 해서 자리가
# 필요하지만, 추세 문장은 햇쩨 지수 궤적 하나라 늘릴 내용이 없다. 같은 하한(75)을 걸었더니
# 추세가 두 번 다시 써도 62자에 머물렀고, 억지로 늘린 것들은 "내려온 후 반등과 다시 하락을
# 반복하는"처럼 말이 겉돌았다. 문장마다 할 말의 양이 다르니 자리도 다르게 준다.
SPOTLIGHT_LEN = (75, 115)
TREND_LEN = (55, 90)
HERO_RETRIES = 2

# 요약에서 **아예 언급하지 않을** 지표 — slug → 다시 풀리는 raw_value 하한.
#
# 버핏지수는 시장 지표 중 과열도가 늘 높은 편이라(2026-07-26 raw 196.75% · 과열도 71)
# '시장 지표에서 고르라'고 바꾸자마자 주인공을 독차지했다. 그런데 이건 시가총액/GDP 라
# 분기 GDP 를 따라 아주 천천히 움직인다 — 어제와 오늘이 사실상 같은 값이라, 매일 바뀌는
# '오늘의 요약'에서 할 말이 없다("너무 매크로한 지표"라는 판단).
#
# 다만 임계를 넘으면 그 자체가 사건이라 다시 풀어 준다. 230% 는 운영 판단으로 정한 선이다.
# 값은 표시 단위 그대로다(indicator_values.raw_value, 버핏지수는 % 단위).
#
# ⚠️ **여기는 요약 문장에만 걸린다. 지표 카드와는 무관하다** — 카드는 프론트가
# indicators/indicator_values 를 직접 읽어 그린다(app/page.tsx CardBuffett). 버핏지수
# 카드는 값과 상관없이 늘 그대로 뜬다.
MENTION_RAW_GATES: dict[str, float] = {"buffett_index": 230.0}


def mentionable(row: dict) -> bool:
    """이 지표를 요약 문장에 올려도 되나(주인공이든 곁다리든).

    문턱이 걸린 지표는 raw 가 그 값을 넘을 때만 통과. raw 가 없으면(아직 안 채워짐)
    보수적으로 제외한다 — 문턱을 확인 못 한 채 올리는 것보다 낫다.
    """
    gate = MENTION_RAW_GATES.get(row.get("slug") or "")
    if gate is None:
        return True
    raw = row.get("raw")
    return raw is not None and float(raw) >= gate


def normalize_category(raw: str | None) -> str:
    """레거시 category 값(정통/밈)을 현재 명칭(시장/감성)으로 정규화.

    lib/data.ts 의 normalizeCategory 와 같은 규칙이다. 프론트는 이미 이 보정을 하고
    있어서, 여기서 안 하면 프롬프트의 '시장'과 DB 의 '정통'이 안 맞을 수 있다.
    """
    return "시장" if raw in ("정통", "시장") else "감성"


def build_digest(
    score: float,
    stage: str,
    hot_count: int,
    rows: list[dict],
    recent_scores: list[float],
) -> str:
    """LLM에 넘길 지표 요약(사람이 읽는 한글 텍스트). 과열도 높은 순으로 정렬해
    모델이 '눈여겨볼 지표'를 고르기 쉽게 한다.

    과열도(capped progress)에는 이미 지표별 방향(high/low)이 반영돼 있어, 이 값 하나가
    '얼마나 뜨거운지'의 단일 척도다. raw 현재값/기준값을 같이 주면 모델이 '현재<기준=식음'
    처럼 방향을 거꾸로 읽는 일이 생겨(예: 상대강도 지표) 일부러 뺀다.

    헤드라인 '햇쩨 지수'는 온도(℃)로, 개별 지표는 기준선까지의 진행률(과열도 %)로
    표기해 화면 표기와 맞춘다.

    - [최근 추세]: 3번째 문단(추세)용. 최근 며칠 햇쩨 지수를 오래된→오늘 순으로 준다.
    - [지표별]의 '뜻:' : 1번째 문단(주인공 뜻풀이)용. 주인공 카테고리(시장) 상위
      DESC_TOP_N개에만 설명문을 붙여, 모델이 지표 의미를 지어내지 않고 근거 있게 풀도록
      한다. 시장 지표가 아예 없는 날을 대비해, 그때는 순서대로 앞 N개에 붙인다."""
    lines = [
        f"[전체] 햇쩨 지수 {score:.0f}℃ · {stage} 구간 · 초고온 구간에 든 지표 {hot_count}개",
    ]
    if recent_scores:
        trend = " → ".join(f"{s:.0f}" for s in recent_scores)
        lines.append(f"[최근 추세] 최근 {len(recent_scores)}일 햇쩨 지수(℃, 오래된→오늘): {trend}")
    lines += [
        "",
        "[지표별] 과열도 높은 순 (0=저온 ~ 100=초고온, '초고온'=과열도 75 이상)",
    ]
    # 문턱에 걸린 지표(MENTION_RAW_GATES)는 후보에서 빼고, 목록에는 남기되 표시를 단다 —
    # 지워 버리면 모델이 보는 '가장 뜨거운 지표'가 실제와 달라져 다른 문장까지 어긋난다.
    eligible = [r for r in rows if mentionable(r)]
    spotlight_pool = [r for r in eligible if r["category"] == SPOTLIGHT_CATEGORY] or eligible or rows
    desc_names = {r["name"] for r in spotlight_pool[:DESC_TOP_N]}
    for r in rows:
        hot_mark = " · 초고온" if r["hot"] else ""
        gate_mark = "" if mentionable(r) else "  ← 이 지표는 문장에 쓰지 마세요"
        lines.append(f"- {r['name']} ({r['category']}): 과열도 {r['capped']:.0f}%{hot_mark}{gate_mark}")
        if r["name"] in desc_names and r.get("desc"):
            lines.append(f"    뜻: {r['desc']}")
    return "\n".join(lines)


def main() -> None:
    if not ANTHROPIC_API_KEY:
        # 키가 없으면 조용히 건너뛴다(설정 전 로컬/CI에서도 파이프라인이 안 깨지게).
        print("[skip] ANTHROPIC_API_KEY가 없어 요약 생성을 건너뜁니다.")
        return

    client = get_client()

    # 프론트가 보여주는 '최신' daily_score 행에 요약을 붙인다(오늘 계산이 안 돌았어도
    # 최신 날짜 기준으로 맞춘다). 최근 8일을 받아 3번째 문단(추세)용 궤적을 만든다.
    ds = (
        client.table("daily_score")
        .select("date, score, stage")
        .order("date", desc=True)
        .limit(8)
        .execute()
    )
    if not ds.data:
        print("[skip] daily_score 행이 없어 요약할 대상이 없습니다.")
        return
    target_date = ds.data[0]["date"]
    score = float(ds.data[0]["score"])
    # 최신순으로 받았으니 뒤집어 오래된→오늘 순으로. 추세 서술용.
    recent_scores = [float(r["score"]) for r in reversed(ds.data)]
    stage = stage_for_score(score)  # 저장된 라벨 대신 점수에서 재계산(프론트와 동일 규칙)

    # 공개 지표 + 각 지표의 최신 값. normalized_score는 calculate_score가 저장한 원본
    # 진행률(캡핑 전)이라, 여기서 캡핑/Hit을 다시 계산한다. description_beginner는
    # 1번째 문단(주인공 뜻풀이)의 근거로 상위 지표에 붙인다.
    indicators = (
        client.table("indicators")
        .select("id, slug, name, category, description_beginner")
        .eq("is_public", True)
        .order("created_at", desc=False)
        .execute()
    )

    rows: list[dict] = []
    for ind in indicators.data:
        iv = (
            client.table("indicator_values")
            .select("normalized_score, raw_value")
            .eq("indicator_id", ind["id"])
            .order("date", desc=True)
            .limit(1)
            .execute()
        )
        if not iv.data:
            continue
        progress = iv.data[0].get("normalized_score")
        if progress is None:
            continue  # 아직 진행률이 안 채워진 지표는 제외
        capped = cap_progress(float(progress))
        rows.append(
            {
                "name": ind["name"],
                "category": normalize_category(ind.get("category")),
                "desc": ind.get("description_beginner"),
                "capped": capped,
                "hot": capped >= HOT_ZONE,
                # 주인공 자격 심사에만 쓴다. digest 에는 넣지 않는다 — raw 를 보여주면
                # 모델이 방향을 거꾸로 읽는다(build_digest 주석 참고).
                "slug": ind.get("slug"),
                "raw": iv.data[0].get("raw_value"),
            }
        )

    if not rows:
        print("[skip] 요약할 지표 값이 없습니다.")
        return

    rows.sort(key=lambda r: r["capped"], reverse=True)
    hot_count = sum(1 for r in rows if r["hot"])
    digest = build_digest(score, stage, hot_count, rows, recent_scores)

    print("─" * 60)
    print(digest)
    print("─" * 60)

    anthropic = Anthropic(api_key=ANTHROPIC_API_KEY)

    def one_sentence(system: str) -> str:
        resp = anthropic.messages.create(
            model=MODEL,
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": digest}],
        )
        # 별표(**...**)는 굵게 표시용이라 유지한다 — 프론트가 파싱해 <b>로 렌더한다.
        return "".join(b.text for b in resp.content if b.type == "text").strip()

    def sized_sentence(system: str, length: tuple[int, int]) -> str:
        """한 문장 — 길이가 목표를 벗어나면 다시 쓰게 한다.

        카더라 총평의 ask_brief_sentence 와 같은 방식이다. 후보를 모아 두고 목표 범위
        안의 첫 번째를, 없으면 한가운데에 가장 가까운 걸 고른다. **빈 문장은 절대 안 낸다** —
        요약이 통째로 저장되지 않는 것보다 길이가 몇 자 어긋나는 게 낫다.
        """
        lo, hi = length
        candidates = [one_sentence(system)]
        for _ in range(HERO_RETRIES):
            cur = candidates[-1]
            # 길이가 맞아도 글자가 깨졌거나 오타가 있으면 다시 쓴다(common/text_check.py).
            found = problems(cur, digest)
            if lo <= len(cur) <= hi and not found:
                break
            if found:
                print(f"[WARNING] 문장을 버리고 다시 씁니다({' · '.join(found)}): {cur[:40]}…")
                retry = system + "\n\n[다시 쓰기] 방금 쓴 문장에 깨진 글자나 오타가 있습니다. 같은 뜻으로 다시 쓰세요."
            else:
                need = "늘려" if len(cur) < lo else "줄여"
                retry = (
                    system
                    + f"\n\n[다시 쓰기] 방금 쓴 문장은 {len(cur)}자입니다. 뜻은 유지하면서 "
                    f"{need} {lo}~{hi}자로 **한 문장**만 다시 쓰세요.\n"
                    f"[방금 쓴 문장]\n{cur}"
                )
            candidates.append(one_sentence(retry))
        # 깨진 후보는 길이가 맞아도 안 쓴다 — 길이는 어긋나도 읽히지만 깨진 글자는 못 읽는다.
        usable = [t for t in candidates if t.strip() and is_clean(t, digest)] or [
            t for t in candidates if t.strip()
        ]
        if not usable:
            return ""
        in_goal = [t for t in usable if lo <= len(t) <= hi]
        if in_goal:
            return in_goal[0]
        return min(usable, key=lambda t: abs(len(t) - (lo + hi) / 2))

    # 주인공 문장과 추세 문장을 따로 생성해 문단 수를 항상 정확히 2로 고정한다.
    spotlight = sized_sentence(SPOTLIGHT_SYSTEM, SPOTLIGHT_LEN)
    trend = sized_sentence(TREND_SYSTEM, TREND_LEN)
    if not spotlight or not trend:
        print("[WARNING] LLM 응답이 비어 요약을 저장하지 않습니다.")
        return

    # 개행으로 이어 저장 → 프론트가 개행으로 나눠 각각 한 문단으로 렌더(오프너 포함 3문단).
    summary = f"{spotlight}\n{trend}"
    print(f"[요약]\n  ① {spotlight}\n  ② {trend}")

    client.table("daily_score").update({"ai_summary": summary}).eq(
        "date", target_date
    ).execute()
    print(f"[Supabase] daily_score.ai_summary 저장 완료: date={target_date}")


if __name__ == "__main__":
    main()

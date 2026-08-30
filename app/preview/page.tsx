import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPreview, type PreviewLink, type PreviewMover } from "@/lib/kr-preview";

import { SectionHead } from "../kadera/SectionHead";
import { pageMetadata } from "../seo";
import { StockLogo } from "../StockLogo";
import { C, MONO } from "../ui";

/**
 * 국장 미리보기 — 간밤 미장에서 크게 움직인 종목이 오늘 아침 국내 어디와 엮이는지.
 *
 * 재료는 `data-pipeline/config/us_kr_pairs.py`(관계 153쌍 · 5년 실측)이고, 계산은 전부
 * 파이프라인이 개장 전에 끝내 표에 넣는다. 여기서는 그리기만 한다.
 *
 * ## 이 화면이 파는 것은 예보가 아니라 해설이다
 *
 * ⚠️⚠️ **효과는 개장 갭에서 끝난다.** 워크포워드 실측으로 장중(시가→종가) 기여가 46.1%
 * 대 평소 46.2% 로 정확히 0 이었다. 사용자가 09:00 에 무엇을 하려는 순간 이미 지나간
 * 일이다. 숨기면 며칠 안에 들통나고, 먼저 밝히면 카드가 정직해진다. 히어로 브리핑 끝의
 * 그 한 줄과 맨 아래 각주를 빼지 말 것.
 *
 * ⚠️ **적중률로 말하지 않는다.** 2026 년에 세 분기 연속 적중률이 55%·52%·60% 로 떨어진
 * 적이 있는데, 신호 크기는 오히려 커졌고(+2.15% → +3.38%) 코스피 개장 폭이 0.9% → 2.3%
 * 로 뛴 게 원인이었다. 잡음이 오르면 적중률만 무너진다. 크기와 횟수로 말하면 그 국면에서도
 * 안 깨진다.
 *
 * ⚠️ **"코스피보다" 를 지우지 말 것.** 원본 상관은 51,626쌍 중 98.3% 가 양수다 — 지수 몫을
 * 안 빼면 모든 카드가 같은 날 다 맞고 같은 날 다 틀린다. 그건 종목 카드가 아니라 지수 카드다.
 *
 * ## 배치는 시장 브리핑과 같은 뼈대다
 *
 * 히어로 판(`.hz-hero-panel`) + 구간 배지 + 섹터 카드 벽. 히어로는 시장 브리핑이 쓰는
 * 그 판을 그대로 쓴다 — 1fr·1fr·2fr 격자라 넓은 화면은 한 줄, 1399 아래에서는 브리핑이
 * 아랫줄을 통째로 쓰는 **두 줄**이 된다.
 *
 * ⚠️ 카더라식 `hz-kd-hero`(q·q·h)로 되돌리지 말 것. 그건 셋이 늘 한 줄에 서서 오늘의
 * 브리핑이 25%~50% 폭에 갇힌다. 이 화면의 요지는 문장 쪽이라 아랫줄을 다 줘야 한다.
 *
 * ⚠️ 섹터 카드에 설명을 달지 말 것. 처음엔 머리마다 "국내 종목을 짚으면…" 을 넣었는데,
 * 섹터가 열한 개라 **같은 문장이 열한 번** 나왔다. 그 안내는 카드 벽 위에 한 번만 둔다.
 */

/**
 * ⛔ **아직 안 연 화면이다.** true 로 바꾸는 것이 곧 **화면을 여는 것**이다.
 *
 * 열 때는 두 곳을 같이 푼다 — 여기와 `app/AppShell.tsx` 의 COMING_SOON 항목(그걸 NAV 로
 * 옮겨야 사이드바에서 눌린다). 한쪽만 풀면 눌리는데 404 이거나, 안 눌리는데 주소로는
 * 열린다.
 *
 * ⚠️ **'준비 중' 배지로는 못 막는다.** 2026-08-30 에 배지를 단 채 NAV 에 href 를 뒀더니
 * 프로덕션 사이드바에서 그냥 눌려 들어가졌다. 배지는 표시일 뿐이다.
 */
const PUBLIC = false;

/** 배포된 곳인가. Vercel 에서만 `VERCEL_ENV` 가 있고 로컬에는 없다 — 그래서 로컬에서는
 *  PUBLIC 이 false 여도 그대로 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export async function generateMetadata(): Promise<Metadata> {
  const meta = pageMetadata({
    title: "국장 미리보기",
    description:
      "간밤 미국에서 크게 움직인 종목과 사업으로 엮인 국내 종목을 개장 전에 잇습니다. 과거에 그런 날 개장이 어땠는지를 함께 봅니다.",
    path: "/preview",
  });
  // 안 연 동안은 색인도 막는다. 아래에서 404 를 내므로 사실상 덤이지만, 사이드바에
  // 링크가 있던 동안 크롤러가 주소를 이미 봤을 수 있다.
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

const SIGN = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
const HOT = "var(--c-hot-ink)";
const COLD = "var(--c-cold-ink)";

/** 국내 종목이 따라간 방향. 미국이 내렸으면 과거 초과갭도 반대편으로 읽는다. */
const signed = (l: PreviewLink, up: boolean) => (up ? l.gap : -l.gap);

/**
 * 종목 이름 뒤에 붙일 **조사만** 돌려준다(이름 자체는 <strong> 안에 따로 그린다).
 *
 * 브리핑 문장이 이름을 그대로 끼워 넣는데, 이름은 매일 바뀐다. 고정 문구로 두면
 * "엔비디아은" 같은 게 나온다. 한글이 아닌 이름(ASML·KT&G)은 받침 있는 쪽으로 보낸다 —
 * 자음으로 끝나는 약어가 대부분이라 그편이 덜 틀린다.
 */
function josa(word: string, withJong: string, withoutJong: string): string {
  const last = word.trim().slice(-1).charCodeAt(0);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  const hasJong = !hangul || (last - 0xac00) % 28 !== 0;
  return hasJong ? withJong : withoutJong;
}

/* ── 히어로 조각 ─────────────────────────────────────────────────────────── */

/** 히어로 셀의 머리. 시장 브리핑의 셀 머리와 같은 크기·굵기다. */
function CellHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>{title}</h2>
      {note && <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>{note}</span>}
    </div>
  );
}

/* ── 섹터 카드 ───────────────────────────────────────────────────────────── */

/**
 * 미국 종목 한 줄 + 그 밑에 이어진 국내 종목들.
 *
 * ⚠️ 오른쪽은 등락률 밑에 "평소의 N배"를 **쌓는다**. 예전엔 배수가 등락률 옆의 알약이라
 * 알약 폭이 종목마다 달라 숫자 기둥이 들쭉날쭉했다 — 두 줄로 쌓으면 오른끝이 맞는다.
 */
function MoverBlock({ m }: { m: PreviewMover }) {
  const up = m.dp > 0;
  const ink = up ? HOT : COLD;
  return (
    <div className="hz-trow" style={{ gridTemplateColumns: "1fr", gap: 9 }}>
      {/* 윗줄 — 간밤 무엇이 얼마나 움직였나 */}
      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <StockLogo code={m.ticker} name={m.usName} market="US" size={26} />
        <span style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
          <strong style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, color: C.ink }}>{m.ticker}</strong>
          <span className="hz-cellname" style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2 }}>{m.usName}</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
          <strong style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: ink, whiteSpace: "nowrap" }}>
            {SIGN(m.dp)}%
          </strong>
          {/* ⭐ 등락률만으로는 큰 움직임인지 알 수 없다 — 종목마다 평소 폭이 다르다.
              "평소의 몇 배" 가 있어야 4%가 큰지 작은지 읽힌다.
              ⚠️ 말풍선을 달지 말 것. 글자 자체가 이미 설명이라, 짚어야 나오는 한 줄을
              더 붙이면 짚을 것이 있다는 신호만 늘고 새로 아는 건 없다. */}
          <span style={{ fontSize: 11, fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>
            평소의 {m.z.toFixed(1)}배
          </span>
        </span>
      </span>
      {/* 아랫줄 — 이어진 국내 종목.
          ⚠️ 알약(pill)으로 늘어놓지 말 것. 알약은 폭이 이름 길이만큼이라 오른끝이 안 맞고,
          무엇보다 **어떤 관계인지를 적을 자리가 없어** 말풍선에 숨게 된다. 이 화면이 파는
          건 "왜 엮이는가"라서 그게 보여야 한다. 줄로 세우면 관계와 수치가 같이 선다.

          ⚠️⚠️ 여기에 말풍선을 되살리지 말 것. 한때 관계와 표본 수를 data-tip 에 숨겼는데,
          짚어야 나오는 것은 **없는 것과 같다**. 관계는 줄에 적고, 표본 수는 쌍마다 다르지만
          같은 미국 종목 안에서는 늘 같은 값이라(69·69·69) 줄마다 되풀이할 값이 아니다 —
          맨 아래 각주가 "쌍마다 44~74건" 으로 한 번 말한다.

          왼쪽 세로선은 위 미국 종목에서 갈라져 나온다는 표시다. 13px 은 위 로고(26px)의
          한가운데라 선이 로고 중심에서 내려온다 — 카드 머리의 call_split 아이콘과 같은 말이다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginLeft: 13, paddingLeft: 15, borderLeft: "1px solid var(--c-line)" }}>
        {m.links.map((l) => (
          <div key={l.stock} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <StockLogo code={l.code} name={l.stock} market={l.market} size={16} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>{l.stock}</span>
            {/* 관계는 한 낱말짜리 꼬리표다(HBM 최대 고객 · 후공정 동종). 자리가 모자라면
                이것만 줄어든다 — 이름과 수치는 줄면 안 된다. */}
            <span style={{ fontSize: 11.5, color: C.sub2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.why}
            </span>
            <span style={{ flex: 1 }} />
            {/* ⚠️⚠️ "평균" 을 떼지 말 것. 이 숫자는 오늘 이 종목이 이만큼 오른다는 말이
                아니라 **과거에 이런 날 개장이 이랬다**는 값이다. 맨 숫자로 두면 바로 위
                미국 줄의 실제 등락률과 같은 종류로 읽혀서 예보가 된다.
                ⚠️ 단위도 떼지 말 것. 위가 "%" 라 이건 코스피 대비 초과분이라 %p 다. */}
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>평균</span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: ink, whiteSpace: "nowrap" }}>
                {SIGN(signed(l, up))}%p
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 화면 ────────────────────────────────────────────────────────────────── */

export default async function PreviewPage() {
  // ⛔ 안 연 화면이라 배포된 곳에서는 없는 페이지다. 사이드바 링크를 지우는 것만으로는
  // 부족하다 — 주소를 알면 그대로 열린다.
  if (!PUBLIC && DEPLOYED) notFound();

  const { date, sectors, moverCount, pairCount } = await getPreview();
  const stamp = date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} 아침 기준` : undefined;

  const movers = sectors.flatMap((s) => s.movers);
  const upCount = movers.filter((m) => m.dp > 0).length;
  const downCount = moverCount - upCount;

  // 평소 대비 가장 크게 움직인 셋. z 로 세운다 — 등락률로 세우면 늘 변동성 큰 종목만
  // 올라와서 "평소와 달랐던 밤"이라는 이 칸의 뜻이 사라진다.
  const loudest = [...movers].sort((a, b) => b.z - a.z).slice(0, 3);

  // 브리핑 문장의 재료.
  const biggest = movers.reduce<PreviewMover | null>((a, m) => (!a || Math.abs(m.dp) > Math.abs(a.dp) ? m : a), null);
  const strongest = movers
    .flatMap((m) => m.links.map((l) => ({ m, l })))
    .reduce<{ m: PreviewMover; l: PreviewLink } | null>((a, x) => (!a || Math.abs(x.l.gap) > Math.abs(a.l.gap) ? x : a), null);
  // ⭐ 여러 미국 종목에 동시에 걸린 국내 종목. 오늘 대한항공이 부킹홀딩스·사우스웨스트·
  // 보잉 세 곳에서 같이 밀렸는데, 섹터 카드를 따로 읽으면 셋으로 흩어져 안 보인다.
  // 이 문장이 그 화면에서 유일하게 그걸 말한다.
  const linkCount = new Map<string, number>();
  for (const m of movers) for (const l of m.links) linkCount.set(l.stock, (linkCount.get(l.stock) ?? 0) + 1);
  const crowded = [...linkCount.entries()].sort((a, b) => b[1] - a[1])[0];

  /**
   * 카드 벽에 세울 차례. **종목 수가 많은 순**이고 같은 수끼리는 lib 이 준 차례
   * (그날 신호가 센 순)를 그대로 둔다.
   *
   * ⚠️ 신호 센 순으로만 세우지 말 것. 2열 격자는 한 줄의 두 카드를 같은 키로 늘리는데,
   * 신호 순으로 두면 5곳짜리 옆에 1곳짜리가 서서 짧은 카드 밑에 빈 판이 150px 넘게
   * 생겼다. 종목 수로 세우면 키가 비슷한 것끼리 짝이 된다.
   *
   * ⭐ 순위를 잃는 게 아니다. 그날 가장 센 것은 히어로의 '평소와 가장 달랐던 곳'과
   *    브리핑 첫 문단이 이미 이름으로 짚는다. 벽은 훑는 자리라 읽히는 차례가 낫다.
   */
  const wall = [...sectors].sort((a, b) => b.movers.length - a.movers.length);

  return (
    <>
      {/* ── 히어로 — 간밤 뉴욕 · 평소와 달랐던 곳 · 오늘의 브리핑(아랫줄 전체) ── */}
      <section className="hz-hero-panel">
        {/* ① 간밤 뉴욕 — 이 밤이 얼마나 시끄러웠나 */}
        <div className="hz-hero-cell">
          <CellHead title="간밤 뉴욕" note={stamp} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <strong style={{ fontFamily: MONO, fontSize: 40, fontWeight: 800, letterSpacing: "-.04em", color: C.ink, lineHeight: 1 }}>
                {moverCount}
              </strong>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.sub }}>곳</span>
            </div>
            <span style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>평소 폭을 넘어선 미국 종목</span>
            {moverCount > 0 && (
              <>
                {/* 오른 곳과 내린 곳의 비율. 지표 분포 막대와 같은 어법이다 — 숫자 둘을
                    나란히 적는 것보다 어느 쪽으로 기운 밤인지가 먼저 읽힌다. */}
                <div className="hz-dist-bar">
                  <div style={{ flex: upCount || 0.0001, background: "var(--c-hot)" }} />
                  <div style={{ flex: downCount || 0.0001, background: "var(--c-cold)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, fontWeight: 700 }}>
                  <span style={{ color: HOT }}>오른 곳 {upCount}</span>
                  <span style={{ color: COLD }}>내린 곳 {downCount}</span>
                </div>
              </>
            )}
            <span style={{ marginTop: "auto", paddingTop: 4, fontSize: 11.5, color: C.sub2, lineHeight: 1.6 }}>
              국내 {pairCount}자리 · 섹터 {sectors.length}개와 이어집니다
            </span>
          </div>
        </div>

        {/* ② 평소와 가장 달랐던 곳 */}
        <div className="hz-hero-cell hz-hero-divide">
          <CellHead title="평소와 가장 달랐던 곳" />
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {loudest.length === 0 ? (
              <span style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.7 }}>아직 채울 자료가 없습니다.</span>
            ) : (
              loudest.map((m) => (
                <div key={m.ticker} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <StockLogo code={m.ticker} name={m.usName} market="US" size={24} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <strong style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.ink }}>{m.ticker}</strong>
                    <span className="hz-cellname" style={{ fontSize: 11, color: C.sub2 }}>{m.usName}</span>
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                    <strong style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", color: m.dp > 0 ? HOT : COLD }}>
                      {SIGN(m.dp)}%
                    </strong>
                    <span style={{ fontSize: 11, color: C.sub2, whiteSpace: "nowrap" }}>평소의 {m.z.toFixed(1)}배</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ③ 오늘의 브리핑 — 아랫줄을 통째로 쓴다.
            ⚠️ 문장을 LLM 에 맡기지 않는다. 재료가 숫자 넷뿐이라 틀이 고정이고, 매일 두 번
            도는 화면에 모델 값을 태울 이유가 없다. 이름 뒤 조사만 josa() 로 받침에 맞춘다. */}
        <div className="hz-hero-cell hz-hero-divide hz-hero-wide">
          <CellHead title="오늘의 브리핑" />
          {moverCount === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
              간밤 크게 움직인 종목이 없습니다. 눈여겨보는 미국 종목 가운데 평소 폭을 크게 넘어선 곳이 없었다는
              뜻이고, 고장이 아니라 조용한 밤이었습니다. 한 해에 여드레쯤 이런 날이 옵니다.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {biggest && (
                <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
                  간밤 뉴욕에서 눈여겨보는 미국 종목 가운데 {moverCount}곳이 평소 폭을 넘어섰습니다. 가장 크게
                  움직인 곳은 <strong style={{ color: C.ink, fontWeight: 700 }}>{biggest.usName}</strong>
                  {josa(biggest.usName, "으로", "로")} 평소의 {biggest.z.toFixed(1)}배인{" "}
                  <strong style={{ color: biggest.dp > 0 ? HOT : COLD, fontWeight: 700 }}>{SIGN(biggest.dp)}%</strong>
                  였습니다.
                </p>
              )}
              {strongest && (
                <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
                  국내와 가장 세게 엮인 자리는{" "}
                  <strong style={{ color: C.ink, fontWeight: 700 }}>{strongest.l.stock}</strong>
                  입니다. {strongest.m.usName}의 {strongest.l.why} 쪽이고,
                  과거에 이런 날 개장에 코스피보다 평균{" "}
                  {/* ⚠️ 음수를 부호째 적으면 "코스피보다 −1.45%p 더 움직였습니다" 가 되어
                      덜 움직였다는 말로 읽힌다. 문장에서는 크기만 적고 방향은 서술어가 진다. */}
                  <strong style={{ color: signed(strongest.l, strongest.m.dp > 0) > 0 ? HOT : COLD, fontWeight: 700 }}>
                    {Math.abs(signed(strongest.l, strongest.m.dp > 0)).toFixed(2)}%p
                  </strong>{" "}
                  더 {signed(strongest.l, strongest.m.dp > 0) > 0 ? "올랐습니다" : "내렸습니다"}.
                </p>
              )}
              {crowded && crowded[1] > 1 && (
                <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
                  <strong style={{ color: C.ink, fontWeight: 700 }}>{crowded[0]}</strong>
                  {josa(crowded[0], "은", "는")} 오늘 {crowded[1]}곳에서 한꺼번에 걸립니다. 섹터가 갈려 있어 카드를
                  따로 보면 흩어져 보이는 자리입니다.
                </p>
              )}
              {/* ⚠️⚠️ 이 한 줄이 화면의 성격을 정한다. 장중 기여가 실측 0 이라, 브리핑 끝에
                  없으면 위 문장들이 예보처럼 읽힌다. */}
              <p style={{ margin: 0, fontSize: 11.5, color: C.sub2, lineHeight: 1.7, wordBreak: "keep-all" }}>
                이 움직임은 개장에 거의 다 반영되고 개장 뒤로는 남는 것이 없었습니다. 오늘을 맞히는 것이 아니며
                매수·매도 신호가 아닙니다.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 섹터별 연결 ───────────────────────────────────────────────────── */}
      {sectors.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "0 12px" }}>
            <div className="hz-section-badge">
              <h2>섹터별 연결</h2>
              <span className="hz-section-badge-n">{sectors.length}</span>
            </div>
            {/* 카드 열한 장에 같은 문장을 붙이지 않으려고 여기 한 번만 둔다.
                ⚠️ 예전 문구("짚으면 관계가 나옵니다")로 되돌리지 말 것 — 말풍선을 다 걷어서
                짚을 것이 없다. 이 자리는 이제 **숫자가 무엇인지** 를 말한다. */}
            <span style={{ fontSize: 11.5, color: C.sub2, wordBreak: "keep-all" }}>
              숫자는 미국이 이만큼 움직인 과거의 날에 국내 종목의 개장이 코스피보다 평균 얼마나 더 움직였는지입니다.
            </span>
          </div>

          <div className="hz-pv-grid">
            {wall.map((s) => (
              <section key={s.sector} className="hz-sheet">
                {/* 아이콘은 열한 장이 다 같다. 갈래가 나뉘는 모양 자체가 이 카드의 뜻이라
                    섹터마다 다른 그림을 찾을 이유가 없다. */}
                <SectionHead icon="call_split" title={s.sector} note={`${s.movers.length}곳`} />
                {s.movers.map((m) => (
                  <MoverBlock key={m.ticker} m={m} />
                ))}
              </section>
            ))}
          </div>
        </>
      )}

      {/* ⚠️⚠️ 각주를 지우지 말 것. 히어로 브리핑의 마지막 줄과 짝이고, "코스피보다" 라는
          단서는 여기에만 온전히 적혀 있다. */}
      <section className="hz-sheet">
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 12, lineHeight: 1.7, color: C.sub, wordBreak: "keep-all" }}>
            숫자는 과거 그런 날 개장에 코스피보다 얼마나 더 움직였는지의 5년 평균입니다. 표본은 쌍마다 44~74건이고
            적중률이 아니라 크기와 횟수로만 말합니다. 재미·참고용이며 매수·매도 신호가 아닙니다.
          </span>
        </div>
      </section>
    </>
  );
}

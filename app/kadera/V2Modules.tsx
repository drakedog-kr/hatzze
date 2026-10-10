import Link from "next/link";

import type { IndexClose } from "@/lib/data";
import { shortDate } from "@/lib/format";
import type { UpcomingEvent } from "@/lib/kadera-why";
import type { IssueKeyword, SentimentPoint, ThemeRotation } from "@/lib/telegram-data";

import { AiMark, Icon } from "../ui";
import { V2Hint, type HintSpec } from "../V2Hint";

/**
 * v2 국장 카더라의 부품 — '모듈' 한 장과 오른쪽 칸의 모듈 셋(2026-10-02 3차).
 *
 * 2차는 토스증권 홈을 얼개째 옮겼다(지수 카드 줄 → 표 → 오른쪽 종목 정보 칸). 지적은 "토스랑 구성이 똑같다 · 인텔리전스
 * 플랫폼 같은 느낌이 덜하다". 그래서 얼개를 바꿨다 — 한 판 대신 **모듈**(머리 띠 + 1px 테두리 + 작은 모서리)을 두 줄기로
 * 쌓는다. 블록웍스 대시보드의 모듈(테두리 10% · r4 · 행 33px · 행마다 가는 선)에서 '모듈마다 머리 띠와 근거'만 가져오고,
 * 모듈 안 내용은 우리 자료에만 있는 것으로 채운다 — 낙관도 30일 막대, 테마 점유율 히트맵, 채널이 짚은 일정.
 */

/** 모듈 한 장 — 머리 띠(제목 · 근거 · 오른쪽 덧붙임) + 몸. 테두리와 모서리는 v2.css 의 .v2-mod. */
export function Module({
  id,
  title,
  help,
  meta,
  aside,
  ai,
  className,
  hint,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  /**
   * 제목 바로 뒤 물음표 툴팁(15자 안 한 마디). ⭐ 설명하는 제목에 붙여 둔다 — 머리 띠 오른쪽 끝(aside)에 두면 '전체 보기' 옆에 떨어져
   * 무엇을 설명하는지 안 읽혔고 글자보다 3px 떠 있었다(2026-10-04 지적).
   */
  help?: string;
  /** 제목 옆 근거 — 기간 · 표본 · 기준 시각. 인텔리전스 화면은 숫자마다 '어디서 언제'를 단다. */
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  /** 생성형 AI 가 쓴 문장을 담은 모듈이면 제목 앞에 AI 표시(이용약관 4조의 고지). */
  ai?: boolean;
  className?: string;
  /** 처음 온 사람에게 한 번 띄우는 쪽지(app/V2Hint.tsx) — 보통 anchor 로 첫 줄을 가리킨다. */
  hint?: HintSpec;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`v2-mod${className ? ` ${className}` : ""}${hint ? " v2-has-hint" : ""}`}>
      <header className="v2-mod-head">
        <h2>
          {ai && <AiMark size={13} />}
          {title}
          {help && (
            <span className="hz-tip hz-tip-wide v2-mod-help" data-tip={help} aria-label={help} tabIndex={0}>
              <Icon name="help" />
            </span>
          )}
        </h2>
        {meta && <span className="v2-mod-meta">{meta}</span>}
        {aside && <span className="v2-mod-aside">{aside}</span>}
      </header>
      {children}
      {hint && <V2Hint {...hint} />}
    </section>
  );
}

export type Tone = "up" | "down" | "flat";

/**
 * 선 그래프 — 아래로 옅어지는 면 · 기준선(점선) · 선 · 끝점 후광. 2차(토스 지수 카드 꼴)의 것을 그대로 되살렸다(2026-10-02 요청).
 * 색은 tone 클래스가 currentColor 로 쥔다(오름 빨강 · 내림 파랑). 면의 그라데이션도 같은 색이라 한 덩어리로 읽힌다.
 * 늘이는 그림이라(preserveAspectRatio none) 끝점은 svg 밖 span 이 그린다 — 안에서 그리면 타원으로 찌그러진다.
 * tips 를 주면 점마다 호버 칸을 깐다 — 마우스를 올리면 그날 값이 뜨고 세로선 · 점이 선다(옛 히어로 · 여론 추이와 같은 .hz-vline 어법).
 * v2 로 옮기며 빠졌던 것을 되살렸다(2026-10-04 "원래 호버하면 몇인지 나왔는데 지금은 안 된다").
 */
export function Spark({
  id,
  values,
  base,
  w,
  h,
  tone,
  dot,
  tips,
  baseLabel,
}: {
  id: string;
  values: number[];
  base?: number;
  /** 점선 왼끝에 붙일 축 글자('50℃'). 이름 없는 점선은 무엇과 견준 선인지 몰랐다(2026-10-04 점검). */
  baseLabel?: string;
  w: number;
  h: number;
  tone: Tone;
  dot?: boolean;
  /** 점마다의 툴팁 글(values 와 같은 길이). */
  tips?: string[];
}) {
  if (values.length < 2) return <div className="v2-spark-empty" />;
  const all = base === undefined ? values : [...values, base];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.14 || 1;
  const y = (v: number) => h - ((v - (lo - pad)) / (hi - lo + pad * 2)) * h;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${w},${h} L0,${h} Z`;
  const lastTop = (y(values[values.length - 1]) / h) * 100;
  return (
    <div className={`v2-spark is-${tone}`}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {base !== undefined && <line x1="0" x2={w} y1={y(base)} y2={y(base)} className="v2-spark-base" vectorEffect="non-scaling-stroke" />}
        <path d={area} fill={`url(#${id})`} />
        <path d={line} className="v2-spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      {base !== undefined && baseLabel && (
        <span className="v2-spark-blabel" style={{ top: `${(y(base) / h) * 100}%` }} aria-hidden="true">
          {baseLabel}
        </span>
      )}
      {dot && <span className="v2-spark-dot" style={{ top: `${lastTop}%` }} />}
      {tips && tips.length === values.length && (
        // 칸 n 등분 — i 번째 칸 안에서 점의 자리는 칸 폭의 i/(n-1) 이라 --hz-x 하나로 선과 점이 점 위에 선다.
        <div className="v2-spark-hits">
          {values.map((v, i) => {
            const at = i / (values.length - 1);
            return (
              <div
                key={i}
                className={`hz-tip hz-vline${at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : ""}`}
                data-tip={tips[i]}
                style={{ ["--hz-x" as string]: `${at * 100}%` }}
              >
                <span className="hz-vdot" style={{ top: `${(y(v) / h) * 100}%` }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 관심 추이 막대 한 칸 — 그날 언급 수. */
export type TrendBar = { date: string; mentions: number };
/**
 * 그날 종가 — 선의 높이(close)와 말풍선 둘째 줄(tip). 글자는 화면이 짓는다(원 · 달러가 다르다).
 * byCur 를 주면 통화 스위치를 따른다 — 말풍선은 속성 글이라 금액 칸(.hz-krw · .hz-usd)처럼 둘 다 그려 둘 수 없어, 통화별 글을
 * data-tip-usd · data-tip-krw 에 싣고 CSS 가 고른 통화의 것을 띄운다(mobile.css 통화 스위치). tip 은 화면 기본 통화의 글이다.
 */
export type TrendPrice = { close: number; tip: string; byCur?: { usd: string; krw: string } };

/**
 * 커뮤니티 관심 추이 — 위 칸은 그날 종가 줄(맥락), 아래 칸은 일별 언급 막대(주인공). 국장 종목 상세 · 미장 종목 상세가 같이 쓴다
 * (2026-10-10). 칸에 마우스를 올리면 세로선이 두 칸을 함께 지나고 선 위에 점이 서며, 말풍선 한 장에 날짜 · 언급(첫 줄)과
 * 종가 · 등락(둘째 줄)이 같이 뜬다. 채널 수는 화면에 두지 않는다 — 숫자 줄 · 말풍선 둘 다 걷었다(2026-10-10 · 10-11 지시).
 *
 * ⭐ 모듈 이름이 '관심 추이'라 막대가 주인공이다 — 종가 선은 가늘고 옅게, 위 칸은 막대보다 낮게 둔다. 그려 보고 걷은 꼴
 *    (겹침 · 무채색 · 등락 색 · 곡선 · 진한 선)과 그 이유는 v2.css 머리말에 모았다.
 * ⭐ 선이 무엇인지는 범례 대신 **최고 · 최저 값 글자**가 말한다 — 값에 '원' · '$' 가 붙어 있으면 종가 선으로 읽힌다.
 *
 * 막대 · 손닿는 칸은 div, 선은 SVG 한 장 — 서버 컴포넌트로 남아 클라이언트 번들이 안 는다. 칸은 틈 없이 n 등분이라
 * (v2.css .v2-tm-trend gap 0 · 틈은 칸 안쪽 여백) 칸 가운데가 정확히 (i + 0.5) / n 이다 — 선의 꼭짓점 · 세로선 · 점이 그 자리에 선다.
 * 늘이는 그림이라(preserveAspectRatio none) 점 · 글자는 SVG 밖 span 이 그린다(안에서 그리면 찌그러진다, Spark 와 같은 까닭).
 * 위 칸의 자리(머리 여백 · 아래 몫)와 막대 높이는 v2.css 의 --px-* 변수가 정한다 — 칸 안 호버 점도 같은 변수로 자리를 잰다.
 *
 * ⚠️ 빈 날을 0 으로 메워 받는다. 안 메우면 언급 없는 날을 건너뛰어 막대 간격이 날짜와 어긋나고, 추이가 실제보다 촘촘해 보인다.
 * ⚠️ 종가가 없는 날(주말 · 휴장 · 아직 공표 전)은 선이 그 칸을 건너 앞뒤 거래일을 잇는다. 선은 거래일이 둘 이상일 때만 긋고,
 *    그 밖엔 예전처럼 막대만 판 높이로 선다.
 */
export function MentionTrend({
  id,
  points,
  floor,
  day,
  partial = false,
  prices,
  priceLabel,
}: {
  /** 면 그라데이션 id — 문서 전역이라 화면마다 다르게(종목 코드). */
  id: string;
  points: TrendBar[];
  /** 막대 키의 바닥. 국장 10 — 그 종목 최댓값으로만 나누면 30일에 한 번 1회 언급도 꽉 찬 막대였다(2026-10-04 점검). */
  floor: number;
  /** 말풍선의 날짜 글자. */
  day: (iso: string) => string;
  /** 마지막 칸이 오늘(아직 안 끝난 날)이면 옅게 · 말풍선에 '집계 중'(미장 mentionTrend partial). */
  partial?: boolean;
  /** 날짜 → 그날 종가. */
  prices?: Map<string, TrendPrice>;
  /** 최고 · 최저 글자의 값 꼴 — '280,500원' · '$239.24'. 통화 스위치를 따르려면 .hz-usd · .hz-krw 두 벌을 돌려준다(미장). */
  priceLabel?: (v: number) => React.ReactNode;
}) {
  const n = points.length;
  const max = Math.max(floor, ...points.map((p) => p.mentions));
  // 최근 사흘만 진한 파랑.
  const recentFrom = n >= 3 ? points[n - 3].date : "";

  const priced = prices ? points.flatMap((p, i) => (prices.has(p.date) ? [{ i, close: prices.get(p.date)!.close }] : [])) : [];
  const hasLine = priced.length >= 2;
  const lo = Math.min(...priced.map((p) => p.close));
  const hi = Math.max(...priced.map((p) => p.close));
  // 위 칸 안에서 위로부터 몇 % 인가(0 = 위 칸 꼭대기 · 100 = 바닥). 한 달 내내 같은 값이면 가운데.
  const y = (v: number) => (hi > lo ? ((hi - v) / (hi - lo)) * 100 : 50);
  const xPct = (i: number) => ((i + 0.5) / n) * 100;
  // 직선으로 잇는다 — 곡선(단조 보간)도 그려 봤는데 극값마다 봉우리가 평평해져 물렁해 보였다(2026-10-10).
  const line = hasLine ? priced.map((p, k) => `${k ? "L" : "M"}${p.i + 0.5},${y(p.close).toFixed(2)}`).join(" ") : "";
  const first = priced[0];
  const last = priced[priced.length - 1];
  const hiAt = priced.find((p) => p.close === hi);
  const loAt = priced.find((p) => p.close === lo);
  // 글자가 판 밖으로 나가지 않게 — 양 끝 근처는 점 쪽에 붙여 안쪽으로 연다.
  const edge = (i: number) => (xPct(i) < 14 ? " is-start" : xPct(i) > 86 ? " is-end" : "");

  return (
    <div className={`v2-tm-trend${hasLine ? " has-px" : ""}`} role="img" aria-label={`최근 ${n}일 언급 막대${hasLine ? "와 종가 선" : ""}`}>
      {points.map((p, i) => {
        const at = i / Math.max(1, n - 1);
        const tipEdge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        const part = partial && i === n - 1;
        const px = prices?.get(p.date);
        const head = `${day(p.date)} · 언급 ${p.mentions}회${part ? " · 집계 중" : ""}`;
        const tip = px ? `${head}\n${px.tip}` : head;
        const ratio = p.mentions / max;
        return (
          <span
            key={p.date}
            className={`hz-tip hz-vline${px ? " hz-tip-wide hz-tip-lines" : ""}${tipEdge}`}
            data-tip={tip}
            data-tip-usd={px?.byCur ? `${head}\n${px.byCur.usd}` : undefined}
            data-tip-krw={px?.byCur ? `${head}\n${px.byCur.krw}` : undefined}
          >
            <i
              className={[!p.mentions ? "is-none" : p.date >= recentFrom ? "is-recent" : "", part ? "is-part" : ""].filter(Boolean).join(" ") || undefined}
              // 0 인 날은 2px 바닥선 — 1px 막대 여럿은 빈 칸이나 깨진 그림으로 보였다(언급 0 종목, 2026-10-05 점검).
              // 선이 있으면 막대는 아래 칸(--px-bars 높이까지)에만 선다.
              style={{
                height: !p.mentions ? "2px" : hasLine ? `calc(var(--px-bars) * ${Math.max(0.03, ratio).toFixed(4)})` : `${Math.max(3, ratio * 100)}%`,
              }}
            />
            {/* 호버 점 — 칸 높이 기준이라 위 칸의 자리(머리 여백 --px-top 과 아래 몫 --px-bottom 을 뺀 높이)로 옮겨 잰다. */}
            {hasLine && px && (
              <span
                className="hz-vdot v2-tm-pxdot"
                style={{ top: `calc(var(--px-top) + (100% - var(--px-top) - var(--px-bottom)) * ${(y(px.close) / 100).toFixed(4)})` }}
              />
            )}
          </span>
        );
      })}
      {hasLine && (
        <div className="v2-tm-pxpane" aria-hidden="true">
          <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.06" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${last.i + 0.5},100 L${first.i + 0.5},100 Z`} fill={`url(#${id})`} />
            <path d={line} className="v2-tm-px-line" vectorEffect="non-scaling-stroke" />
          </svg>
          {priceLabel && hiAt && loAt && hi > lo && (
            <>
              <span className={`v2-tm-pxlab is-hi${edge(hiAt.i)}`} style={{ left: `${xPct(hiAt.i)}%`, top: `${y(hi)}%` }}>
                최고 {priceLabel(hi)}
              </span>
              <span className={`v2-tm-pxlab is-lo${edge(loAt.i)}`} style={{ left: `${xPct(loAt.i)}%`, top: `${y(lo)}%` }}>
                최저 {priceLabel(lo)}
              </span>
            </>
          )}
          {/* 선 끝점 — 가장 최근 종가가 어느 날인지(KRX 는 하루 늦게 공표해 막대보다 먼저 끝나기도 한다). */}
          <span className="v2-tm-pxend" style={{ left: `${xPct(last.i)}%`, top: `${y(last.close)}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * 여론 낙관도 — 값 · 꼬리표 · 30일 선(50 이 점선) · 30일 최고/최저. 2차의 큰 카드를 모듈 안으로 옮긴 것이다(2026-10-02 요청:
 * "낙관도나 그런 거는 토스 지적 전 버전처럼"). 그사이 시험한 50 위아래 막대 · 갈림 막대는 걷었다.
 * ⚠️ 전날 대비를 달지 않는다 — 시장 글만 센 낙관도는 하루 표본이 얇아 +35%p 같은 흔들림이 큰 글씨로 뜬다.
 */
export function SentimentModule({
  score,
  label,
  trend,
  days,
  children,
}: {
  score: number;
  label: string;
  trend: SentimentPoint[];
  /** 큰 숫자가 본 날수(보통 2). 선은 30일이라 머리 띠엔 큰 숫자의 기간을 적는다. */
  days: number;
  /** 선 아래에 붙는 것 — 인기 테마의 평소 대비 낙관도(page.tsx 가 ThemeVsUsualRows 를 넘긴다). */
  children?: React.ReactNode;
}) {
  const vals = trend.map((p) => p.score);
  const tone: Tone = score >= 50 ? "up" : "down";
  const hi = vals.length ? Math.max(...vals) : score;
  const lo = vals.length ? Math.min(...vals) : score;
  return (
    <Module id="mood" title="여론 낙관도" meta={`최근 ${days}일 시장 글`}>
      <div className="v2-bigcard">
        <span className="v2-card-val is-big">
          <b className={`is-${tone}`}>{score}%</b>
          <span className="v2-reason">{label}</span>
        </span>
        <Spark id="v2-mood-spark" values={vals} base={50} baseLabel="50%" w={300} h={64} tone={tone} dot tips={trend.map((p) => `${shortDate(p.date)} · 낙관 ${p.score}%`)} />
        {/* 선의 양끝 날짜 — 큰 숫자(최근 N일)와 선(한 달)의 기간이 한눈에 갈리게. 축 글자다(2026-10-05 점검). */}
        {trend.length >= 2 && (
          <span className="v2-spark-axis" aria-hidden="true">
            <span>{shortDate(trend[0].date)}</span>
            <span>{shortDate(trend[trend.length - 1].date)}</span>
          </span>
        )}
        <span className="v2-card-foot">
          <span>
            {/* '30일 · 29일 최고'로 화면마다 날 수가 달랐다(미장 기록이 하루 짧다) — 한 달로 부른다(2026-10-04 점검). */}
            <em>한 달 최고</em>
            {hi}%
          </span>
          <span>
            <em>한 달 최저</em>
            {lo}%
          </span>
        </span>
        {children && <div className="v2-mood-themes">{children}</div>}
      </div>
    </Module>
  );
}

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "");

/**
 * 종목 한 줄이 가는 곳 — 국내는 종목 페이지(/stock/코드), 미장은 내부자 리포트 종목 화면(/insider/stock/티커).
 * 미국 종목엔 따로 실주소가 없어 시세 · 공시 · 커뮤니티 관심 추이가 다 있는 그 화면이 종목 화면 노릇을 한다(MDD 의 같은 규칙, app/mdd/V2Sheets.tsx).
 * 시장을 모르면(null) 길을 안 낸다.
 */
export function stockHref(code: string, market: string | null): string | null {
  if (market === "US") return `/insider/stock/${encodeURIComponent(code)}`;
  if (market === "KOSPI" || market === "KOSDAQ") return `/stock/${code}`;
  return null;
}

/**
 * 테마 점유율 — 상위 열 테마의 막대 목록. 줄마다 순위 · 테마 · 점유율 막대 · 점유율 · 변화(2026-10-04).
 * 점유율 = 최근 3일 평균(머리 띠의 '최근 3일'), 변화 = 1주 전 같은 날들의 평균과의 차이(lib/theme-flow.ts weekAgoDates).
 *
 * 2차의 작은 카드 열 장(미니 선 · 이름 · 대장 꼬리표 · 점유율 · 변화)을 되살렸었는데 "열 개라 너무 복잡하고 정보 전달도 잘 안 된다"였다(10-04).
 * 카드마다 다섯 가지가 서서 한 칸에 쉰 개 가까운 글자 · 그림이 섞였고, 두 칸 격자라 몇 위가 어디인지도 안 읽혔다. 그래서 '어느 테마에
 * 말이 몰렸나'를 막대 길이 하나로 말한다 — 막대는 1위 테마를 끝으로 한 길이라 몇 배 차이인지가 바로 보인다. 대장 종목은 줄에 마우스를 올리면,
 * 열흘 흐름 · 나머지 테마는 '전체 보기'(테마 판세)에서 본다.
 */
/** 테마 줄이 읽는 칸 — 국장 ThemeRotation · 미장 UsThemeRow 둘 다 맞는다(미장 카더라도 이 부품을 쓴다). */
type ThemeShareRow = Pick<ThemeRotation, "theme" | "sharePct" | "shareDelta"> & { stocks: { name: string }[] };

/** 목록 줄 수 — 10위까지(운영자 판단, 2026-10-04). 한 줄 30px 이라 첫 줄 셋 칸(여론 · 테마 · 일정)의 키(1,440 에서 363) 안에 든다.
 *  복잡했던 건 줄 수가 아니라 카드 한 장에 다섯 가지가 선 꼴이었다 — 줄은 한 가지(막대)만 말한다. */
const THEME_ROWS = 10;

export function ThemeShares({
  themes,
  hrefOf,
  allHref = "/theme",
}: {
  themes: ThemeShareRow[];
  hrefOf: ((theme: string) => string) | null;
  /** 머리 오른쪽 '전체 보기' — 국장 /theme · 미장 /theme/us. */
  allHref?: string;
}) {
  const rows = themes.slice(0, THEME_ROWS);
  const max = Math.max(0.0001, ...rows.map((t) => t.sharePct));
  return (
    <Module
      id="themes"
      title="테마 점유율"
      // 줄이 테마 화면으로 가는 링크다(국장 · 미장 같은 id — 한 번 보면 둘 다 끝). 아래 첫 표 쪽지보다 위라 먼저 뜬다.
      // 첫 li 는 머리 줄이라 둘째 li(첫 테마 줄)를 가리킨다.
      hint={hrefOf && rows.length ? { id: "kadera-themes", order: 1, together: true, anchor: ".v2-tsh > li:nth-child(2)", target: ".v2-tsh > li:not(:first-child)", text: "테마를 누르면 그 테마 종목과 이유가 나옵니다" } : undefined}
      // 머리엔 점유율의 기간만. 변화(+20.5%p)가 견준 기간(1주 전 같은 날들, lib/theme-flow.ts weekAgoDates)은 그 칸 머리가 말한다 —
      // 머리에 '최근 3일 · 1~2주 전 대비'로 나란히 두었더니 두 기간이 한 덩어리로 읽혀 헷갈렸다(2026-10-05 운영자 판단).
      meta="최근 3일"
      // 테마 전체 보기는 이 머리 오른쪽에 둔다(2026-10-03) — 첫 줄 띠 끝에 있을 땐 띠가 1,280 에서 두 줄로 접혔고, 목록을 보다 넘어가는 자리가 여기다.
      aside={
        hrefOf && (
          // 화살표 아이콘은 달지 않는다 — 첫 줄 띠 링크 칸 둘의 › 와 한 화면에 셋이 섰다(2026-10-05 점검). 호버 바탕이 링크임을 말한다.
          <Link href={allHref} className="v2-more">
            전체 보기
          </Link>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="v2-empty">아직 집계된 테마가 없습니다.</p>
      ) : (
        <ol className="v2-tsh">
          {/* 머리 줄 — 옆 · 아래 표와 같은 꼴(2026-10-05 점검). 막대 칸은 이름이 없다(점유율 숫자의 그림이다). */}
          <li aria-hidden="true">
            <span className="v2-tsh-row v2-tsh-th">
              <span />
              <span>테마</span>
              <span />
              <span>점유율</span>
              <span>1주 전 대비</span>
            </span>
          </li>
          {rows.map((t, i) => {
            const d = t.shareDelta;
            const lead = t.stocks[0]?.name;
            const body = (
              <>
                <span className="v2-tsh-rank">{i + 1}</span>
                <span className="v2-tsh-name">{t.theme}</span>
                <span className="v2-tsh-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(2, (t.sharePct / max) * 100)}%` }} />
                </span>
                <b className="v2-tsh-val">{t.sharePct.toFixed(1)}%</b>
                <span className={`v2-tsh-chg${d == null || Math.abs(d) < 0.05 ? "" : d > 0 ? " is-up" : " is-down"}`}>
                  {d == null || Math.abs(d) < 0.05 ? "" : `${sign(d)}${Math.abs(d).toFixed(1)}%p`}
                </span>
              </>
            );
            const tip = lead ? `대장 ${lead}` : undefined;
            return (
              <li key={t.theme}>
                {hrefOf ? (
                  <Link href={hrefOf(t.theme)} className={`v2-tsh-row${tip ? " hz-tip hz-tip-start" : ""}`} data-tip={tip} data-ga="kadera_theme_click">
                    {body}
                  </Link>
                ) : (
                  <div className={`v2-tsh-row${tip ? " hz-tip hz-tip-start" : ""}`} data-tip={tip}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Module>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** '오늘 · 내일 · 10/5(월)' 알약 글자. */
/** 일정 날짜 알약 글자 — 오늘 · 내일 · 'M/D(요일)'. 테마 화면 일정(app/theme/ThemeDetailView.tsx)도 같이 쓴다. */
export function dayPill(date: string, today: string): string {
  if (date === today) return "오늘";
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 1) return "내일";
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAY[new Date(`${date}T12:00:00+09:00`).getUTCDay()]})`;
}

/**
 * 다가오는 일정 — 날짜 알약 + 일정. 2차의 일정 카드 꼴을 되살렸다(2026-10-02 요청).
 * 둘째 줄(여론 · 테마 옆) 오른쪽 칸이다 — 가까운 다섯.
 * ⛔ '채널 글에서 뽑은 날짜라 공시와 다를 수 있다' 같은 각주를 달지 않는다(사족). 머리 근거 '채널이 짚은 날짜'도 걷었다(2026-10-05 운영자 판단).
 * 줄은 그 종목 화면으로 간다(표의 줄과 같은 동작) — 국내는 종목 페이지, 미장은 내부자 리포트 종목 화면(stockHref).
 */
export function EventsModule({ events, today, failed, limit = 5 }: { events: UpcomingEvent[]; today: string; failed: boolean; limit?: number }) {
  const next = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels)
    .slice(0, limit);
  return (
    <Module id="events" title="다가오는 일정">
      {failed ? (
        <p className="v2-empty">일정을 불러오지 못했습니다.</p>
      ) : next.length === 0 ? (
        <p className="v2-empty">앞으로 5주 안에 날짜가 짚인 일정이 아직 없습니다.</p>
      ) : (
        <ul className="v2-events">
          {next.map((e) => {
            const body = (
              <>
                <span className={`v2-daypill${e.date === today ? " is-today" : ""}`}>{dayPill(e.date, today)}</span>
                <span className="v2-event-txt">
                  <b>{e.name}</b> {e.event}
                </span>
              </>
            );
            const href = stockHref(e.code, e.market);
            return (
              <li key={`${e.code}-${e.date}-${e.event}`}>
                {href ? (
                  <Link href={href} className="v2-ev-row" data-ga="kadera_event_click">
                    {body}
                  </Link>
                ) : (
                  <div className="v2-ev-row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Module>
  );
}

/**
 * 이슈 키워드 — 순위표(2026-10-03). 줄마다 순위 · 키워드 · 언급량 막대 · 횟수 · 변화.
 * 단어와 횟수만 늘어놓은 칩은 "대충 만든 것 같고 유용한지 모르겠다"는 지적을 받았다 — 무엇이 늘고 줄었는지가 안 보였다.
 * 그래서 옛 이슈 키워드 시트의 재료(점유율 · 변화)를 다른 표와 같은 꼴로 되살렸다.
 * - 언급량 막대의 끝은 1위다. 점유율 분모는 표에 세운 낱말들의 합(옛 화면과 같다 — 새 조회가 없고 막대와 숫자가 같은 재료다).
 * - 변화 = 최근 3일 평균 점유율이 그 이전 평균보다 25% 넘게 늘었나 · 줄었나(IssueKeyword.trend). 비교할 과거가 없으면 '-'.
 * - 판 폭 전체에 설 땐 다섯 줄씩 두 단으로 놓는다(한 단 열 줄이면 오른쪽이 빈다). 폰은 한 단.
 *   2026-10-03 부터는 오른쪽 칸(오늘의 요약 아래)에 한 단 열 줄로 선다 — 열 줄로 늘린 표 둘 옆을 채운다.
 */
export function KeywordTable({ keywords, split = true }: { keywords: Pick<IssueKeyword, "rank" | "word" | "count" | "trend">[]; split?: boolean }) {
  const rows = keywords.slice(0, 10);
  const top = Math.max(1, ...rows.map((k) => k.count));
  // 오른쪽 좁은 칸에 설 땐(split=false) 한 단 열 줄이다(page.tsx 셋째 줄).
  const half = split ? Math.ceil(rows.length / 2) : rows.length;
  const cols = [rows.slice(0, half), rows.slice(half)].filter((c) => c.length > 0);
  return (
    <Module id="keywords" title="이슈 키워드" meta="최근 3일">
      {rows.length === 0 ? (
        <p className="v2-empty">아직 뽑을 이슈 키워드가 없습니다.</p>
      ) : (
        <div className="v2-kw">
          {cols.map((col, ci) => (
            <div key={ci} className="v2-kw-col">
              <div className="v2-kw-row v2-kw-th" aria-hidden="true">
                <span />
                <span>키워드</span>
                <span>언급량</span>
                <span>횟수</span>
                <span>변화</span>
              </div>
              <ol>
                {col.map((k) => {
                  // 변화는 말로 — '+0.3%p'(표 안 점유율의 차이)는 무엇의 %p 인지 안 읽혔다(2026-10-04 점검). 판정은 파이프라인이
                  // 저장한 trend 하나다(앞 기간 몫의 25% 안쪽이면 '비슷' — calculate_telegram_sentiment.keyword_trend). 화면에서 절대
                  // %p(0.5)로 다시 가르니 열 줄 중 아홉이 '비슷'이었다.
                  const dir = k.trend;
                  const dCls = dir === "up" ? " is-up" : dir === "down" ? " is-down" : "";
                  return (
                    <li key={k.word} className="v2-kw-row">
                      <span className="v2-kw-rank">{k.rank}</span>
                      <span className="v2-kw-word">{k.word}</span>
                      <span className="v2-kw-bar" aria-hidden="true">
                        <i style={{ width: `${(k.count / top) * 100}%` }} />
                      </span>
                      <span className="v2-kw-num">{k.count.toLocaleString("ko-KR")}회</span>
                      <span className={`v2-kw-num v2-kw-delta${dCls}`}>
                        {dir === null ? "-" : dir === "up" ? "늘어남" : dir === "down" ? "줄어듦" : "비슷"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Module>
  );
}

/* ── 첫 줄(개요 띠) 칸들 — 국장 카더라 · 시장 브리핑이 같이 쓴다(v2.css .v2-cover). ───────────────────────── */

const signPct = (v: number, digits: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(digits)}%`;

/** 'M/D 종가' 코스피 · 코스닥(값 · 전 거래일 대비). 둘 다 없으면 칸을 안 그린다. */
export function CoverIndexCell({ kospi, kosdaq }: { kospi: IndexClose | null; kosdaq: IndexClose | null }) {
  const cells = ([["코스피", kospi], ["코스닥", kosdaq]] as const).flatMap(([name, v]) => (v ? [{ name, ...v }] : []));
  const date = kospi?.date ?? kosdaq?.date;
  if (!date || !cells.length) return null;
  return (
    <div className="v2-cover-cell v2-cover-idx">
      <span className="v2-cover-k">{date.slice(5).split("-").map(Number).join("/")} 종가</span>
      {cells.map((c) => (
        <span key={c.name} className="v2-cover-v">
          <em>{c.name}</em>
          <b>{c.close.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          {c.changePct !== null && <span className={`v2-cover-chg${c.changePct > 0 ? " is-up" : c.changePct < 0 ? " is-down" : ""}`}>{signPct(c.changePct, 2)}</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * 미장 카더라 첫 줄의 시장 맥락 — 그 미국 거래일의 S&P500 등락(국장 첫 줄 코스피 · 코스닥 칸의 짝).
 * 값은 국장 미리보기 수집기가 이미 받아 둔 것(kr_preview_day.spx_dp · ^GSPC)이라 새 조회가 없다. 지수 수준은 저장하지 않아 등락만 적는다.
 * 머리말은 미국 날짜다('10/2 미장'). 국장이 쉬는 동안 여러 세션을 묶은 날은 '9/30~10/1 미장'(그 누적 등락).
 */
export function CoverUsIndexCell({ label, spx }: { label: string; spx: number }) {
  return (
    <div className="v2-cover-cell v2-cover-idx">
      <span className="v2-cover-k">{label}</span>
      <span className="v2-cover-v">
        {/* 국장 칸(코스피 · 코스닥)과 같은 꼴 — 이름이 13px 600, 등락이 12px 500. 뒤집혀 있어 '+0.73%'만 굵게 튀었다(2026-10-05 점검). */}
        <b>S&amp;P500</b>
        <span className={`v2-cover-chg${spx > 0 ? " is-up" : spx < 0 ? " is-down" : ""}`}>{signPct(spx, 2)}</span>
      </span>
    </div>
  );
}

/** val · tone 은 이름 옆 작은 값(카더라 칩의 등락 · 배수). 없는 칸도 있다(MDD 종목 화면 · 테마 리포트). */
export type CoverLink = {
  cap: string;
  name: string;
  val?: string;
  tone?: Tone;
  href: string;
  ga: string;
  /** 뒤로 가는 칸(데일리 노트 '이전 글') — 화살표가 왼쪽을 가리키고 칸 맨 앞에 선다(2026-10-04 "이전 글은 화살표가 왼쪽"). */
  back?: boolean;
};

/** 링크 칸 — 이 화면에 없는 것을 싣고 다른 화면으로 보낸다. 띠의 다른 칸과 같은 꼴 + 끝에 작은 ›(알약 칩은 v2 결과 안 맞아 걷었다). */
export function CoverLinkCell({ c }: { c: CoverLink }) {
  return (
    <Link href={c.href} className={`v2-cover-cell v2-cover-go${c.back ? " is-back" : ""}`} data-ga={c.ga}>
      {c.back && <Icon name="chevron_left" />}
      <span className="v2-cover-k">{c.cap}</span>
      <span className="v2-cover-v">
        <b>{c.name}</b>
        {c.val && <span className={`v2-cover-chg is-${c.tone ?? "flat"}`}>{c.val}</span>}
      </span>
      {!c.back && <Icon name="chevron_right" />}
    </Link>
  );
}

/** 오른쪽 끝 — 언제 · 무엇을 얼마나 읽었나. **한 줄**이다(2026-10-03 "모든 페이지 이건 한 줄로") — 두 줄로 쌓던 때가 있었다. */
export function CoverMeta({ updated, basis }: { updated: string; basis?: string | null }) {
  return (
    <div className="v2-cover-cell v2-cover-meta">
      <span className="v2-cover-k">
        <i className="v2-dot" />
        {basis ? `${updated} · ${basis}` : updated}
      </span>
    </div>
  );
}

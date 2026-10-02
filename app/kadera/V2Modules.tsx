import Link from "next/link";

import type { UpcomingEvent } from "@/lib/kadera-why";
import type { SentimentPoint, ThemeRotation } from "@/lib/telegram-data";

import { AiMark } from "../ui";

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
  meta,
  aside,
  ai,
  className,
  children,
}: {
  id?: string;
  title: string;
  /** 제목 옆 근거 — 기간 · 표본 · 기준 시각. 인텔리전스 화면은 숫자마다 '어디서 언제'를 단다. */
  meta?: string;
  aside?: React.ReactNode;
  /** 생성형 AI 가 쓴 문장을 담은 모듈이면 제목 앞에 AI 표시(이용약관 4조의 고지). */
  ai?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`v2-mod${className ? ` ${className}` : ""}`}>
      <header className="v2-mod-head">
        <h2>
          {ai && <AiMark size={13} />}
          {title}
        </h2>
        {meta && <span className="v2-mod-meta">{meta}</span>}
        {aside && <span className="v2-mod-aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * 여론 낙관도 — 50 을 가운데 선으로 두고 날마다 위(낙관)·아래(비관)로 뻗는 막대 30개.
 * 선 그래프 대신 막대인 것은 '50 을 넘었나'가 이 숫자의 뜻이라서다 — 위아래가 갈리면 그날 기울기가 한눈에 읽힌다.
 * 막대 길이는 30일 중 가장 멀리 간 날을 끝으로 잡는다(고정 ±50 이면 18~79 사이 움직임이 납작해진다).
 * ⚠️ 전날 대비를 달지 않는다 — 시장 글만 센 낙관도는 하루 표본이 얇아 +35%p 같은 흔들림이 큰 글씨로 뜬다(2차 때 걷었다).
 */
export function SentimentModule({
  score,
  trend,
  days,
}: {
  score: number;
  trend: SentimentPoint[];
  /** 큰 숫자가 본 날수(보통 2). 막대는 30일이라 둘을 갈라 적어야 한다 — 머리에 '최근 30일'만 두었더니 76% 도 30일 값으로 읽혔다. */
  days: number;
}) {
  const vals = trend.map((p) => p.score);
  const far = Math.max(10, ...vals.map((v) => Math.abs(v - 50)));
  return (
    <Module id="mood" title="여론 낙관도" meta={`최근 ${days}일 시장 글`}>
      <div className="v2-mood">
        {/* ⛔ 뜻을 문장으로 달지 않는다(2026-10-02 "사족 없이"). 큰 숫자 밑 갈림 막대가 '낙관과 비관을 나눈 몫'이라는 뜻을 대신한다 —
            중립 글은 두 쪽 어디에도 안 든다(lib/telegram-data.ts EcosystemSentiment.score). */}
        <div className="v2-mood-now">
          <span className={`v2-mood-side is-up${score >= 50 ? " is-lead" : ""}`}>
            낙관 <b>{score}%</b>
          </span>
          <span className={`v2-mood-side is-down${score < 50 ? " is-lead" : ""}`}>
            비관 <b>{100 - score}%</b>
          </span>
        </div>
        <div className="v2-split" aria-hidden="true">
          <i className="is-up" style={{ width: `${score}%` }} />
          <i className="is-down" style={{ width: `${100 - score}%` }} />
        </div>
        {/* 30일 추이 — 읽는 법은 축 글자가 맡는다(왼쪽 낙관·비관, 아래 30일 전·오늘). */}
        {vals.length > 1 && (
          <div className="v2-trend" aria-hidden="true">
            <span className="v2-trend-y">
              <span>낙관</span>
              <span>비관</span>
            </span>
            <span className="v2-diverge">
              {vals.map((v, i) => {
                const h = `${(Math.abs(v - 50) / far) * 100}%`;
                const last = i === vals.length - 1;
                return (
                  <span key={i} className={`v2-dv${last ? " is-last" : ""}`}>
                    <i className="v2-dv-up" style={{ height: v >= 50 ? h : 0 }} />
                    <i className="v2-dv-down" style={{ height: v < 50 ? h : 0 }} />
                  </span>
                );
              })}
            </span>
            <span className="v2-trend-x">
              <span>{vals.length}일 전</span>
              <span>오늘</span>
            </span>
          </div>
        )}
      </div>
    </Module>
  );
}

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "");

/**
 * 테마 점유율 — 줄마다 이름 · 막대(점유율) · 점유율 · 변화. 2026-10-02 에 14일 히트맵(칸 14개 + 머리 줄 + 진하기 범례)에서
 * 줄였다 — "복잡하다". 추이는 변화(%p) 한 칸이 맡는다.
 * 막대 길이의 끝은 1위 테마다(점유율 100% 가 아니라) — 10% 안팎 테마들이 실낱이 되지 않게.
 * 점유율 = 최근 3일 평균(머리 띠의 '최근 3일'), 변화 = 5일 이상 전 평균과의 차이(lib/telegram-data.ts THEME_PRIOR_GAP_DAYS).
 */
export function ThemeShare({ themes, hrefOf }: { themes: ThemeRotation[]; hrefOf: ((theme: string) => string) | null }) {
  const rows = themes.slice(0, 10);
  const top = Math.max(0.0001, ...rows.map((t) => t.sharePct));
  return (
    <Module id="themes" title="테마 점유율" meta="최근 3일">
      {rows.length === 0 ? (
        <p className="v2-empty">아직 집계된 테마가 없습니다.</p>
      ) : (
        <ol className="v2-share">
          {rows.map((t) => {
            const d = t.shareDelta;
            const body = (
              <>
                <span className="v2-share-name">{t.theme}</span>
                <span className="v2-share-bar" aria-hidden="true">
                  <i style={{ width: `${(t.sharePct / top) * 100}%` }} />
                </span>
                <span className="v2-share-pct">{t.sharePct.toFixed(1)}%</span>
                <span className={`v2-share-delta${d === null || d === 0 ? "" : d > 0 ? " is-up" : " is-down"}`}>
                  {d === null || d === 0 ? "-" : `${sign(d)}${Math.abs(d).toFixed(1)}%p`}
                </span>
              </>
            );
            return (
              <li key={t.theme}>
                {hrefOf ? (
                  <Link href={hrefOf(t.theme)} className="v2-share-row">
                    {body}
                  </Link>
                ) : (
                  <div className="v2-share-row">{body}</div>
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

function dayLabel(date: string, today: string): string {
  if (date === today) return "오늘";
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 1) return "내일";
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d} ${WEEKDAY[new Date(`${date}T12:00:00+09:00`).getUTCDay()]}`;
}

/**
 * 다가오는 일정 — 채널 글이 날짜를 짚은 일정, 가까운 열넷까지. 오른쪽 줄기 맨 아래라 왼쪽 줄기 길이를 메우는 자리다 —
 * 표 문장이 세 줄까지 감싸게 되면서(2026-10-02) 왼쪽이 길어져 일곱이면 334px 가 비었다. 몇 채널이 짚었는지를 근거로 단다.
 * 오른쪽 줄기의 맨 아래 모듈이라 왼쪽 줄기 끝까지 늘어난다(v2.css) — 남는 자리는 목록 아래 빈다.
 * ⛔ '채널 글에서 뽑은 날짜라 공시와 다를 수 있다' 같은 각주를 달지 않는다(2026-10-02 "사족 없이") — 머리 띠의 '채널이 짚은 날짜'가 그 말이다.
 */
export function EventsModule({ events, today, failed }: { events: UpcomingEvent[]; today: string; failed: boolean }) {
  const next = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels)
    .slice(0, 14);
  return (
    <Module id="events" title="다가오는 일정" meta="채널이 짚은 날짜">
      {failed ? (
        <p className="v2-empty">일정을 불러오지 못했습니다.</p>
      ) : next.length === 0 ? (
        <p className="v2-empty">앞으로 5주 안에 날짜가 짚인 일정이 아직 없습니다.</p>
      ) : (
        <ul className="v2-events">
          {next.map((e) => {
            const body = (
              <>
                <span className={`v2-ev-day${e.date === today ? " is-today" : ""}`}>{dayLabel(e.date, today)}</span>
                <span className="v2-ev-txt">
                  <b>{e.name}</b> {e.event}
                </span>
                <span className="v2-ev-src">채널 {e.channels}곳</span>
              </>
            );
            // 국내 종목은 그 종목 화면으로 — 표의 줄과 같은 동작이다. 미장 티커는 아직 실주소가 없어 글자로 둔다.
            const kr = e.market === "KOSPI" || e.market === "KOSDAQ";
            return (
              <li key={`${e.code}-${e.date}-${e.event}`}>
                {kr ? (
                  <Link href={`/stock/${e.code}`} className="v2-ev-row">
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

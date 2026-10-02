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
  label,
  trend,
}: {
  score: number;
  label: string;
  trend: SentimentPoint[];
}) {
  const vals = trend.map((p) => p.score);
  const far = Math.max(10, ...vals.map((v) => Math.abs(v - 50)));
  const hi = vals.length ? Math.max(...vals) : score;
  const lo = vals.length ? Math.min(...vals) : score;
  return (
    <Module id="mood" title="여론 낙관도" meta={`최근 ${vals.length || 1}일`}>
      <div className="v2-mood">
        <div className="v2-mood-now">
          <b className={score >= 50 ? "is-up" : "is-down"}>{score}%</b>
          <span className="v2-tag">{label}</span>
        </div>
        {vals.length > 1 && (
          <div className="v2-diverge" aria-hidden="true">
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
          </div>
        )}
        <dl className="v2-mood-foot">
          <div>
            <dt>최고</dt>
            <dd>{hi}%</dd>
          </div>
          <div>
            <dt>최저</dt>
            <dd>{lo}%</dd>
          </div>
          <div>
            <dt>가운데 선</dt>
            <dd>50%</dd>
          </div>
        </dl>
      </div>
    </Module>
  );
}

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "");

/**
 * 테마 히트맵 — 줄은 테마, 칸은 날(최근 14일), 진하기는 그날 점유율. 오른쪽에 지금 점유율과 변화.
 * 진하기의 끝은 **이 표 전체에서 가장 높은 칸**이다 — 줄마다 따로 잡으면 작은 테마도 새까맣게 칠해져 크기 비교가 사라진다.
 * 색은 오름·내림이 아니라 브랜드 파랑 한 가지(점유율은 방향이 아니라 양이다).
 */
export function ThemeHeat({ themes, hrefOf }: { themes: ThemeRotation[]; hrefOf: ((theme: string) => string) | null }) {
  const rows = themes.slice(0, 8);
  const days = Math.min(14, Math.max(0, ...rows.map((t) => t.series.length)));
  const max = Math.max(0.0001, ...rows.flatMap((t) => t.series.slice(-days)));
  return (
    <Module id="themes" title="테마 점유율" meta={`최근 ${days}일 · 언급 비중`}>
      {rows.length === 0 ? (
        <p className="v2-empty">아직 집계된 테마가 없습니다.</p>
      ) : (
        <div className="v2-heat">
          <ol>
            {rows.map((t) => {
              const cells = t.series.slice(-days);
              const pad = days - cells.length;
              const d = t.shareDelta;
              const body = (
                <>
                  <span className="v2-heat-name">{t.theme}</span>
                  <span className="v2-heat-cells" aria-hidden="true">
                    {Array.from({ length: pad }, (_, i) => (
                      <i key={`p${i}`} className="is-none" />
                    ))}
                    {cells.map((v, i) => (
                      <i key={i} style={{ opacity: 0.1 + 0.9 * (v / max) }} />
                    ))}
                  </span>
                  <span className="v2-heat-share">{t.sharePct.toFixed(1)}%</span>
                  <span className={`v2-heat-delta${d === null || d === 0 ? "" : d > 0 ? " is-up" : " is-down"}`}>
                    {d === null || d === 0 ? "-" : `${sign(d)}${Math.abs(d).toFixed(1)}`}
                  </span>
                </>
              );
              return (
                <li key={t.theme}>
                  {hrefOf ? (
                    <Link href={hrefOf(t.theme)} className="v2-heat-row">
                      {body}
                    </Link>
                  ) : (
                    <div className="v2-heat-row">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="v2-heat-axis" aria-hidden="true">
            <span>{days}일 전</span>
            <span>오늘</span>
            <span className="v2-heat-axis-r">점유율 · %p</span>
          </div>
        </div>
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

/** 다가오는 일정 — 채널 글이 날짜를 짚은 일정, 가까운 다섯. 몇 채널이 짚었는지를 근거로 단다. */
export function EventsModule({ events, today, failed }: { events: UpcomingEvent[]; today: string; failed: boolean }) {
  const next = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels)
    .slice(0, 5);
  return (
    <Module id="events" title="다가오는 일정" meta="채널이 짚은 날짜">
      {failed ? (
        <p className="v2-empty">일정을 불러오지 못했습니다.</p>
      ) : next.length === 0 ? (
        <p className="v2-empty">앞으로 5주 안에 날짜가 짚인 일정이 아직 없습니다.</p>
      ) : (
        <ul className="v2-events">
          {next.map((e) => (
            <li key={`${e.code}-${e.date}-${e.event}`}>
              <span className={`v2-ev-day${e.date === today ? " is-today" : ""}`}>{dayLabel(e.date, today)}</span>
              <span className="v2-ev-txt">
                <b>{e.name}</b> {e.event}
              </span>
              <span className="v2-ev-src">{e.channels}곳</span>
            </li>
          ))}
        </ul>
      )}
    </Module>
  );
}

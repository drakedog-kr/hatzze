import Link from "next/link";

import type { UpcomingEvent } from "@/lib/kadera-why";
import type { SentimentPoint, ThemeRotation } from "@/lib/telegram-data";

/**
 * v2 국장 카더라의 맨 위 줄 — 토스증권 홈 '지수 줄'의 짝(2026-10-02).
 * 토스는 지수마다 값 · 등락 · 선 그래프 · 'AI 이유 꼬리표'를 한 카드에 묶는다(해부 노트 8절).
 * 여기선 여론 낙관도(큰 카드) · 상위 테마 여섯(작은 카드) · 다가오는 일정(일정 카드)이 그 자리를 쓴다.
 */

type Tone = "up" | "down" | "flat";

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "");

/**
 * 선 그래프 — 아래로 옅어지는 면 · 기준선(점선) · 선. 토스 지수 카드의 꼴이다.
 * 색은 tone 클래스가 currentColor 로 쥔다(오름 빨강 · 내림 파랑). 면의 그라데이션도 같은 색이라 한 덩어리로 읽힌다.
 * 늘이는 그림이라(preserveAspectRatio none) 끝점은 svg 밖 span 이 그린다 — 안에서 그리면 타원으로 찌그러진다.
 */
function Spark({ id, values, base, w, h, tone, dot }: { id: string; values: number[]; base?: number; w: number; h: number; tone: Tone; dot?: boolean }) {
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
      {dot && <span className="v2-spark-dot" style={{ top: `${lastTop}%` }} />}
    </div>
  );
}

/**
 * 여론 낙관도 — 큰 카드. 기준선은 50(낙관과 비관이 같은 자리).
 * ⚠️ 토스 지수 카드와 달리 **전날 대비 등락을 안 단다.** 시장 글만 센 낙관도는 하루 표본이 얇아 날마다 크게 흔들린다
 * (2026-10-02 30일 최저 18% · 최고 79%, 전날 대비 +35%p). 그 폭을 큰 글씨로 달면 표본 흔들림이 여론 변화처럼 읽힌다.
 */
export function MoodCard({ score, label, trend }: { score: number; label: string; trend: SentimentPoint[] }) {
  const vals = trend.map((p) => p.score);
  const tone: Tone = score >= 50 ? "up" : "down";
  const hi = vals.length ? Math.max(...vals) : score;
  const lo = vals.length ? Math.min(...vals) : score;
  return (
    <div className="v2-bigcard" id="mood">
      <span className="v2-card-name">
        여론 낙관도
        <span className="v2-reason">{label}</span>
      </span>
      <span className="v2-card-val">
        <b>{score}%</b>
      </span>
      <Spark id="v2-mood-spark" values={vals} base={50} w={192} h={72} tone={tone} dot />
      <span className="v2-card-foot">
        <span>
          <em>30일 최고</em>
          {hi}%
        </span>
        <span>
          <em>30일 최저</em>
          {lo}%
        </span>
      </span>
    </div>
  );
}

/** 테마 작은 카드 — 미니 선(14일 점유율) · 이름 · 대장 종목 꼬리표 · 점유율 · 변화. */
export function ThemeCard({ t, href, i }: { t: ThemeRotation; href: string | null; i: number }) {
  const d = t.shareDelta;
  const tone: Tone = d === null || d === 0 ? "flat" : d > 0 ? "up" : "down";
  const lead = t.stocks[0]?.name;
  const body = (
    <>
      <Spark id={`v2-theme-spark-${i}`} values={t.series} w={56} h={40} tone={tone} />
      <span className="v2-mini-txt">
        <span className="v2-mini-name">
          <span>{t.theme}</span>
          {lead && <span className="v2-reason">대장 {lead}</span>}
        </span>
        <span className="v2-card-val is-sm">
          <b>{t.sharePct.toFixed(1)}%</b>
          {d !== null && d !== 0 && (
            <span className={`v2-delta is-${tone}`}>
              {sign(d)}
              {Math.abs(d).toFixed(1)}%p
            </span>
          )}
        </span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="v2-minicard">
      {body}
    </Link>
  ) : (
    <div className="v2-minicard">{body}</div>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayPill(date: string, today: string): string {
  if (date === today) return "오늘";
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 1) return "내일";
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAY[new Date(`${date}T12:00:00+09:00`).getUTCDay()]})`;
}

/** 다가오는 일정 — 토스 '주요 일정' 카드의 꼴. 가까운 것 넷. 날짜는 '오늘 · 내일 · 10/5(월)' 알약. */
export function EventsCard({ events, today, failed }: { events: UpcomingEvent[]; today: string; failed: boolean }) {
  const next = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels)
    .slice(0, 4);
  return (
    <div className="v2-eventcard" id="events">
      <span className="v2-card-name">다가오는 일정</span>
      {failed ? (
        <p className="v2-muted">일정을 불러오지 못했습니다.</p>
      ) : next.length === 0 ? (
        <p className="v2-muted">앞으로 5주 안에 날짜가 짚인 일정이 아직 없습니다.</p>
      ) : (
        <ul>
          {next.map((e) => (
            <li key={`${e.code}-${e.date}-${e.event}`}>
              <span className={`v2-daypill${e.date === today ? " is-today" : ""}`}>{dayPill(e.date, today)}</span>
              <span className="v2-event-txt">
                <b>{e.name}</b> {e.event}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";

import type { UpcomingEvent } from "@/lib/kadera-why";
import type { IssueKeyword, ThemeRotation } from "@/lib/telegram-data";

import { StockLogo } from "../StockLogo";

/**
 * v2 국장 카더라의 패널과 목록들(2026-10-02). **탭도, 눌러야 열리는 상세도 없다** — 패널마다 제 목록을 다 펴 두고,
 * AI 문장은 종목 줄 바로 아래 둘째 줄에 적는다(눌러 보지 않아도 읽힌다).
 *
 * 줄 꼴은 두 가지뿐이다.
 *   종목 줄(StockList)  순위 · 로고 · 이름 · 값 · 등락  /  둘째 줄에 문장
 *   목록 줄(테마·화제어) 순위 · 이름 · 값 · 변화
 * 예전엔 목록마다 막대·스파크라인·순위 배지·말풍선·칩이 제각각이라 한 화면에 그래픽 종류가 열 가지를 넘었다.
 * 여기선 색을 오르내림(빨강·파랑) 하나에만 쓰고, 나머지는 글자와 정렬로 가른다.
 */

/** 패널 껍데기 — 작은 제목과 오른쪽 조건 알약. 높이는 내용이 정한다(안에서 스크롤하지 않는다). */
export function Panel({
  title,
  meta,
  id,
  className,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`v2-panel${className ? ` ${className}` : ""}`} id={id}>
      <header className="v2-p-head">
        <h2 className="v2-p-title">{title}</h2>
        {meta && <span className="v2-p-meta">{meta}</span>}
      </header>
      <div className="v2-p-body">{children}</div>
    </section>
  );
}

function Change({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="v2-sl-chg" />;
  const [cls, arrow] = rate > 0 ? [" is-up", "▲"] : rate < 0 ? [" is-down", "▼"] : ["", ""];
  return (
    <span className={`v2-sl-chg${cls}`}>
      {arrow}
      {Math.abs(rate).toFixed(2)}%
    </span>
  );
}

export type StockLine = {
  code: string;
  name: string;
  market: string | null;
  /** 이름 오른쪽 값("6.7배" · "84회"). 없으면 등락만 선다. */
  value?: string;
  /** 값을 빨간 잉크로(급부상 배수). */
  valueHot?: boolean;
  change: number | null;
  /** 이름 옆 작은 꼬리표("신규"). */
  tag?: string;
  /** 둘째 줄 문장(AI 한 줄 · 커뮤니티가 말한 이유 · 흐름 요약). */
  text: string | null;
  /** 문장이 아직 없을 때 그 자리에 설 말. 없으면 둘째 줄을 비운다. */
  pending?: string;
};

/** 종목 줄 목록. 줄 전체가 그 종목 화면으로 가는 링크다(MDD 정밀분석은 종목 화면이 잇는다). */
export function StockList({ items, empty }: { items: StockLine[]; empty: string }) {
  if (!items.length) return <p className="v2-empty">{empty}</p>;
  return (
    <ol className="v2-sl-list">
      {items.map((s, i) => (
        <li key={s.code}>
          <Link href={`/stock/${s.code}`} className="v2-sl">
            <span className="v2-li-rank">{i + 1}</span>
            <StockLogo code={s.code} name={s.name} market={s.market} size={24} />
            <span className="v2-sl-name">
              <span>{s.name}</span>
              {s.tag && <span className="v2-tag">{s.tag}</span>}
            </span>
            <span className={`v2-sl-val${s.valueHot ? " is-hot" : ""}`}>{s.value ?? ""}</span>
            <Change rate={s.change} />
            {(s.text || s.pending) && <span className={`v2-sl-text${s.text ? "" : " is-pending"}`}>{s.text ?? s.pending}</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** ▲1.6%p · ▼3계단. 0·null 은 흐린 '-'. */
function Delta({ v, unit, digits = 1 }: { v: number | null; unit: string; digits?: number }) {
  if (v === null || v === 0 || Number.isNaN(v)) return <span className="v2-li-delta">-</span>;
  return (
    <span className={`v2-li-delta ${v > 0 ? "is-up" : "is-down"}`}>
      {v > 0 ? "▲" : "▼"}
      {Math.abs(v).toFixed(digits)}
      {unit}
    </span>
  );
}

function Head({ cols }: { cols: string[] }) {
  return (
    <div className="v2-lh" aria-hidden="true">
      {cols.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  );
}

export function ThemeRows({ themes, hrefOf }: { themes: ThemeRotation[]; hrefOf: (theme: string) => string | null }) {
  if (!themes.length) return <p className="v2-empty">아직 집계된 테마가 없습니다.</p>;
  return (
    <>
      <Head cols={["#", "테마", "점유율", "변화"]} />
      <ol className="v2-list">
        {themes.map((t) => {
          const inner = (
            <>
              <span className="v2-li-rank">{t.rank}</span>
              <span className="v2-li-main">{t.theme}</span>
              <span className="v2-li-val">{t.sharePct.toFixed(1)}%</span>
              <Delta v={t.shareDelta} unit="%p" />
            </>
          );
          const href = hrefOf(t.theme);
          return (
            <li key={t.theme}>
              {href ? (
                <Link href={href} className="v2-li">
                  {inner}
                </Link>
              ) : (
                <div className="v2-li">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function KeywordRows({ keywords }: { keywords: IssueKeyword[] }) {
  if (!keywords.length) return <p className="v2-empty">아직 뽑을 화제어가 없습니다.</p>;
  return (
    <>
      <Head cols={["#", "화제어", "언급", "변화"]} />
      <ol className="v2-list">
        {keywords.map((k) => (
          <li key={k.word}>
            <div className="v2-li">
              <span className="v2-li-rank">{k.rank}</span>
              <span className="v2-li-main">{k.word}</span>
              <span className="v2-li-val">{k.count.toLocaleString("ko-KR")}회</span>
              {/* shareDelta 는 몫(0~1)의 차라 %p 로 적으려면 100 을 곱한다(IssueKeyword 주석). */}
              <Delta v={k.shareDelta === null ? null : k.shareDelta * 100} unit="%p" />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 다가오는 일정 — 날짜 머리 아래 그날 것. 좁은 패널이라 달력 대신 목록이다. */
export function EventRows({ events, today, limit = 10 }: { events: UpcomingEvent[]; today: string; limit?: number }) {
  // 가까운 것부터 limit 개만 — 5주치를 다 펴면 패널이 화면 몇 장 길이가 된다(본문 3,600px 이었다).
  const upcoming = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels)
    .slice(0, limit);
  if (!upcoming.length) return <p className="v2-empty">앞으로 5주 안에 날짜가 짚인 일정이 아직 없습니다.</p>;
  const groups = new Map<string, UpcomingEvent[]>();
  for (const e of upcoming) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
  return (
    <div className="v2-ev">
      {[...groups].map(([date, items]) => {
        const [, m, d] = date.split("-").map(Number);
        // 한국 정오는 UTC 로도 같은 날이라 getUTCDay 가 그날 요일이다(서버 시간대와 무관).
        const wd = WEEKDAY[new Date(`${date}T12:00:00+09:00`).getUTCDay()];
        return (
          <section key={date}>
            <h3 className="v2-ev-date">
              {m}월 {d}일 ({wd}){date === today && <span className="v2-tag">오늘</span>}
            </h3>
            <ul className="v2-list">
              {items.map((e) => {
                const inner = (
                  <>
                    <span className="v2-li-main">{e.name}</span>
                    <span className="v2-ev-text">{e.event}</span>
                  </>
                );
                return (
                  <li key={`${e.code}-${e.event}`}>
                    {/^\d{6}$/.test(e.code) ? (
                      <Link href={`/stock/${e.code}`} className="v2-li v2-ev-row">
                        {inner}
                      </Link>
                    ) : (
                      <div className="v2-li v2-ev-row">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * 여론 30일 추이 — 선 하나와 50 기준선. 옛 추이 타일(parts.tsx SentimentTrendTile)은 제 캡션·띠 색·라벨을 들고 있어
 * 패널 안에서 제목이 두 번 서고 그래픽이 겹쳤다. 여기선 선과 마지막 점, 양 끝 날짜만 남긴다.
 */
export function MoodTrend({ points }: { points: { date: string; score: number }[] | null }) {
  if (!points || points.length < 2) {
    return <p className="v2-muted" style={{ margin: 0, fontSize: 12.5 }}>{points === null ? "추이를 불러오지 못했습니다." : "추이를 그릴 기록이 아직 없습니다."}</p>;
  }
  const W = 100;
  const H = 40;
  const lo = Math.min(30, ...points.map((p) => p.score)) - 2;
  const hi = Math.max(70, ...points.map((p) => p.score)) + 2;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => ((hi - v) / (hi - lo)) * H;
  const last = points[points.length - 1];
  const md = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  return (
    <div className="v2-trend">
      <span className="v2-cap">30일 추이</span>
      <div className="v2-trend-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={W} y1={y(50)} y2={y(50)} className="v2-trend-mid" vectorEffect="non-scaling-stroke" />
          <polyline points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")} className="v2-trend-line" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          className={`v2-trend-dot ${last.score >= 50 ? "is-up" : "is-down"}`}
          style={{ top: `${(y(last.score) / H) * 100}%` }}
          title={`${md(last.date)} 낙관 ${last.score}%`}
        />
      </div>
      <span className="v2-axis">
        <span>{md(points[0].date)}</span>
        <span>{md(last.date)}</span>
      </span>
    </div>
  );
}

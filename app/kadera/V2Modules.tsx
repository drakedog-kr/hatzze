import Link from "next/link";

import type { UpcomingEvent } from "@/lib/kadera-why";
import type { IssueKeyword, SentimentPoint, ThemeRotation } from "@/lib/telegram-data";

import { AiMark, Icon } from "../ui";

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

type Tone = "up" | "down" | "flat";

/**
 * 선 그래프 — 아래로 옅어지는 면 · 기준선(점선) · 선 · 끝점 후광. 2차(토스 지수 카드 꼴)의 것을 그대로 되살렸다(2026-10-02 요청).
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
        <Spark id="v2-mood-spark" values={vals} base={50} w={300} h={64} tone={tone} dot />
        <span className="v2-card-foot">
          <span>
            <em>{vals.length}일 최고</em>
            {hi}%
          </span>
          <span>
            <em>{vals.length}일 최저</em>
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
 * 테마 — 작은 카드 목록. 미니 선(14일 점유율) · 이름 · 대장 종목 꼬리표 · 점유율 · 변화. 2차의 테마 카드를 그대로 되살렸다(2026-10-02 요청).
 * 점유율 = 최근 3일 평균(머리 띠의 '최근 3일'), 변화 = 5일 이상 전 평균과의 차이(lib/telegram-data.ts THEME_PRIOR_GAP_DAYS).
 */
export function ThemeCards({ themes, hrefOf }: { themes: ThemeRotation[]; hrefOf: ((theme: string) => string) | null }) {
  // 열 — 2칸 × 5줄. 옆 여론 칸이 테마별 낙관도까지 실어 키가 커졌다(2026-10-02) — 여섯이면 이 칸 아래가 100px 비었다.
  // 남는 높이는 줄이 나눠 먹는다(v2.css .v2-band .v2-themes 1fr).
  const rows = themes.slice(0, 10);
  return (
    <Module
      id="themes"
      title="테마 점유율"
      meta="최근 3일"
      // 테마 전체 보기는 이 머리 오른쪽에 둔다(2026-10-03) — 첫 줄 띠 끝에 있을 땐 띠가 1,280 에서 두 줄로 접혔고, 카드를 보다 넘어가는 자리가 여기다.
      aside={
        hrefOf && (
          <Link href="/theme" className="v2-more">
            전체 보기
            <Icon name="chevron_right" />
          </Link>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="v2-empty">아직 집계된 테마가 없습니다.</p>
      ) : (
        <div className="v2-themes">
          {rows.map((t, i) => {
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
                  <span className="v2-card-val">
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
            return hrefOf ? (
              <Link key={t.theme} href={hrefOf(t.theme)} className="v2-minicard" data-ga="kadera_theme_click">
                {body}
              </Link>
            ) : (
              <div key={t.theme} className="v2-minicard">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Module>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** '오늘 · 내일 · 10/5(월)' 알약 글자. */
function dayPill(date: string, today: string): string {
  if (date === today) return "오늘";
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 1) return "내일";
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAY[new Date(`${date}T12:00:00+09:00`).getUTCDay()]})`;
}

/**
 * 다가오는 일정 — 날짜 알약 + 일정. 2차의 일정 카드 꼴을 되살렸다(2026-10-02 요청).
 * 둘째 줄(여론 · 테마 옆) 오른쪽 칸이다 — 가까운 다섯.
 * ⛔ '채널 글에서 뽑은 날짜라 공시와 다를 수 있다' 같은 각주를 달지 않는다(사족) — 머리 띠의 '채널이 짚은 날짜'가 그 말이다.
 * 국내 종목 줄은 그 종목 화면으로 간다(표의 줄과 같은 동작). 미장 티커는 아직 실주소가 없어 글자로 둔다.
 */
export function EventsModule({ events, today, failed, limit = 5 }: { events: UpcomingEvent[]; today: string; failed: boolean; limit?: number }) {
  const next = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels)
    .slice(0, limit);
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
                <span className={`v2-daypill${e.date === today ? " is-today" : ""}`}>{dayPill(e.date, today)}</span>
                <span className="v2-event-txt">
                  <b>{e.name}</b> {e.event}
                </span>
              </>
            );
            const kr = e.market === "KOSPI" || e.market === "KOSDAQ";
            return (
              <li key={`${e.code}-${e.date}-${e.event}`}>
                {kr ? (
                  <Link href={`/stock/${e.code}`} className="v2-ev-row" data-ga="kadera_event_click">
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
 * - 변화 = 최근 3일 평균 점유율 − 그 이전 평균(IssueKeyword.shareDelta, %p). 비교할 과거가 없으면 '-'.
 * - 판 폭 전체에 설 땐 다섯 줄씩 두 단으로 놓는다(한 단 열 줄이면 오른쪽이 빈다). 폰은 한 단.
 *   2026-10-03 부터는 오른쪽 칸(오늘의 요약 아래)에 한 단 열 줄로 선다 — 열 줄로 늘린 표 둘 옆을 채운다.
 */
export function KeywordTable({ keywords, split = true }: { keywords: IssueKeyword[]; split?: boolean }) {
  const rows = keywords.slice(0, 10);
  const top = Math.max(1, ...rows.map((k) => k.count));
  const total = rows.reduce((a, k) => a + k.count, 0) || 1;
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
                  const d = k.shareDelta === null ? null : k.shareDelta * 100;
                  const dCls = d === null || Math.abs(d) < 0.05 ? "" : d > 0 ? " is-up" : " is-down";
                  return (
                    <li key={k.word} className="v2-kw-row">
                      <span className="v2-kw-rank">{k.rank}</span>
                      <span className="v2-kw-word">{k.word}</span>
                      <span className="v2-kw-bar" aria-hidden="true">
                        <i style={{ width: `${(k.count / top) * 100}%` }} />
                        <em>{((k.count / total) * 100).toFixed(1)}%</em>
                      </span>
                      <span className="v2-kw-num">{k.count.toLocaleString("ko-KR")}회</span>
                      <span className={`v2-kw-num v2-kw-delta${dCls}`}>
                        {d === null || Math.abs(d) < 0.05 ? "-" : `${sign(d)}${Math.abs(d).toFixed(1)}%p`}
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

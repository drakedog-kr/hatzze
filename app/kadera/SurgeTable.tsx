import Link from "next/link";

import { StockLogo } from "../StockLogo";
import { AiMark } from "../ui";

/**
 * 급부상 종목 표 — v2 리디자인의 첫 조각(국장·미장 카더라가 같이 쓴다).
 *
 * 예전엔 3열 × 2행 셀 격자였다. 셀마다 배수·막대·문장·시세가 제 자리를 따로 잡아서, 여섯 종목을
 * 견주려면 눈이 Z 자로 오가며 같은 숫자를 매번 다시 찾아야 했다. 표는 **같은 값이 같은 세로줄**에
 * 서므로 배수·언급·문장을 위에서 아래로 한 번에 훑는다. 줄 하나에 종목 하나다(토스증권 '실시간
 * 차트'와 같은 얼개).
 *
 * 폭에 따라 세 꼴로 접힌다. 기준은 화면 폭이 아니라 **표 자신의 폭**이다(컨테이너 쿼리) — 사이드바가
 * 열리고 닫히는 것과 상관없이 같은 폭이면 같은 꼴이다. 칸 배치는 v2.css 의 grid-template-areas 가 쥔다.
 *   넓음  순위 · 종목 · 평소 대비 · 7일 언급 · 언급 수 · 왜 뜨나 · 현재가 · 바로가기
 *   중간  윗줄에 숫자, 아랫줄에 문장과 바로가기
 *   좁음  폰. 이름과 배수가 한 줄, 문장, 시세와 바로가기
 *
 * 조회는 하지 않는다. 두 화면이 각자 자기 자료를 이 줄 꼴(SurgeRow)로 옮겨 넘긴다.
 */
export type SurgeRow = {
  key: string;
  name: string;
  /** 이름 옆 코드·티커. 이름이 곧 티커인 미장 종목(RTX)은 null 이다 — "RTX RTX" 가 된다. */
  code: string | null;
  logo: { code: string; market: string | null };
  /** 이름이 가는 곳(종목 화면). 없으면 이름은 글자로만 선다. */
  href: string | null;
  /** "6.7" — 단위(배)는 표가 붙인다. 반올림 규칙이 시장마다 달라 글자로 받는다. */
  ratioText: string;
  isNew: boolean;
  /** 막대 칸(최근 7일)과 그 날짜. 길이가 같아야 한다. */
  series: number[];
  dates: string[];
  /** 배수가 실제로 센 뒤쪽 칸 수(최근 N일). 그 칸만 붉게 칠한다. */
  hot: number;
  mentions: number;
  /** 못 셌으면 null — '0개 채널'은 거짓이라 그 줄만 뺀다. */
  channels: number | null;
  /** AI 한 줄. 없으면 null(집계 직후 20~40분). */
  line: string | null;
  /** 이미 꼴을 갖춘 가격("20,550원" · "$123.45"). 못 받았으면 null. */
  price: string | null;
  /** 등락률(%). 실시간이 아니면 null 로 두고 priceNote 를 넘긴다. */
  change: number | null;
  /** 등락률 대신 설 기준일 표기(국장의 KRX 저장 종가 폴백). */
  priceNote?: React.ReactNode;
  /** 가격이 없을 때 그 자리에 설 말. */
  priceMissing: string;
  /** 이름 아래 줄 끝에 붙는 테마 칩. */
  themes?: React.ReactNode;
  /** 맨 오른쪽 바로가기(MDD 정밀분석 등). */
  actions: React.ReactNode;
};

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 7일 언급 막대. 배수에 들어간 최근 칸만 붉고, 그중 가장 높은 칸이 가장 진하다(옛 DayBars 의 warm 과 같은 뜻).
 * 날짜 축은 그리지 않는다 — 표 머리가 '7일'을 말하고, 칸마다 title 에 날짜와 횟수가 있다.
 * 0 인 날도 2px 은 남긴다. 칸이 통째로 사라지면 며칠이 빠진 것처럼 보인다.
 */
function MiniBars({ values, dates, hot }: { values: number[]; dates: string[]; hot: number }) {
  const max = Math.max(1, ...values);
  const start = values.length - Math.min(hot, values.length);
  let peak = -1;
  for (let i = start; i < values.length; i++) if (peak < 0 || values[i] > values[peak]) peak = i;
  const label = values.map((v, i) => `${shortDate(dates[i])} ${v}회`).join(", ");
  return (
    <div className="v2-bars" role="img" aria-label={`최근 7일 언급: ${label}`}>
      {values.map((v, i) => (
        <span
          key={dates[i] ?? i}
          title={`${shortDate(dates[i])} ${v}회`}
          style={{
            height: v > 0 ? `max(3px, ${(v / max) * 100}%)` : 2,
            background: i < start ? "var(--c-bar-mute)" : i === peak ? "var(--c-warm-1)" : "var(--c-warm-3)",
          }}
        />
      ))}
    </div>
  );
}

function Change({ rate }: { rate: number }) {
  const [cls, arrow] = rate > 0 ? ["is-up", "▲"] : rate < 0 ? ["is-down", "▼"] : ["", ""];
  return (
    <span className={`v2-change ${cls}`}>
      {arrow}
      {Math.abs(rate).toFixed(2)}%
    </span>
  );
}

export function SurgeTable({ rows, recentDays }: { rows: SurgeRow[]; recentDays: number }) {
  return (
    <div className="v2-table v2-surge">
      {/* 열 머리. 폰에선 숨는다(줄이 세 층으로 접혀 세로줄이 없다). */}
      <div className="v2-thead" aria-hidden="true">
        <span className="v2-c-rank">#</span>
        <span className="v2-c-stock">종목</span>
        <span className="v2-c-ratio">평소 대비</span>
        <span className="v2-c-trend">7일 언급</span>
        <span className="v2-c-count">최근 {recentDays}일</span>
        <span className="v2-c-why">왜 뜨나</span>
        <span className="v2-c-price">현재가</span>
        <span className="v2-c-act" />
      </div>
      <ol className="v2-tbody">
        {rows.map((r, i) => (
          <li key={r.key} className="v2-row">
            <span className="v2-c-rank v2-rank">{i + 1}</span>

            <div className="v2-c-stock v2-stock">
              <StockLogo code={r.logo.code} name={r.name} market={r.logo.market} size={32} />
              <div className="v2-stock-txt">
                {r.href ? (
                  <Link href={r.href} className="v2-name hz-stock-link">
                    {r.name}
                  </Link>
                ) : (
                  <span className="v2-name">{r.name}</span>
                )}
                <span className="v2-stock-sub">
                  {r.code && <span className="v2-code">{r.code}</span>}
                  {r.isNew && <span className="v2-tag">신규</span>}
                  {/* 넓은 표에선 언급 수가 제 세로줄에 선다. 좁아지면 그 줄이 사라지고 여기로 온다. */}
                  <span className="v2-count-inline">
                    {r.mentions}회{r.channels !== null && ` · ${r.channels}개 채널`}
                  </span>
                  {r.themes}
                </span>
              </div>
            </div>

            <span className="v2-c-ratio v2-ratio">
              {r.ratioText}
              <small>배</small>
            </span>

            <div className="v2-c-trend">
              <MiniBars values={r.series} dates={r.dates} hot={r.hot} />
            </div>

            <span className="v2-c-count v2-count">
              <strong>{r.mentions}회</strong>
              {r.channels !== null && <span>{r.channels}개 채널</span>}
            </span>

            <p className={`v2-c-why v2-why${r.line ? "" : " is-empty"}`}>
              <AiMark size={14} style={{ flexShrink: 0, marginTop: 3 }} />
              <span className="v2-why-txt">{r.line ?? "한 줄 요약은 오늘 집계가 끝나면 붙습니다."}</span>
            </p>

            <span className="v2-c-price v2-price">
              {r.price ? (
                <>
                  <strong>{r.price}</strong>
                  {r.change !== null ? <Change rate={r.change} /> : r.priceNote}
                </>
              ) : (
                <span className="v2-price-missing">{r.priceMissing}</span>
              )}
            </span>

            <span className="v2-c-act v2-act">{r.actions}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

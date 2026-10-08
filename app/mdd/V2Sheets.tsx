"use client";

// v2 MDD 의 새 모듈들(2026-10-03 "껍데기만 바꾸면 v2 가 아니다" → 판정표 1 · 2단계).
//  - 첫 줄 띠(2단계 7) — 같은 기간 지수의 고점 대비 · 종목 화면 · 테마 리포트 · 종가 기준일. 카더라 · 브리핑과 같은 부품.
//  - 낙폭 요약(둘째 줄 셋째 칸) — 옛 '이 하락의 맥락' 세 문단을 이름표 줄로 다시 짰다(문장은 shared.ts mddSummary).
//  - 역대 하락 사례 — 옛 'Top 5' · 리스크 '하락 vs 회복 속도' · '혼자 빠지나, 같이 빠지나' · 성격 타일이 같은 사건을 네 군데서 말하던 것을 표 하나로.
//  - 회복까지 — 옛 '회복까지 걸린 기간' + '이 하락의 성격'(급락형 · 완만형의 회복 중앙값). 깊이 분포 막대는 사례 표와 겹쳐 뺐다.
//  - 해마다 — 옛 리스크 '낙폭 대비 보상'. 최근 다섯 해 + '전체보기' 팝업 대신 조회 기간의 해를 다 펼친다(누르지 않고 보이게).
//  - 업종 안에서 · 수익 · 손실 비율 — 나란한 두 칸, 줄마다 이름 · 막대 · 값. 업종 줄은 누르면 그 종목 MDD 로.

import { CHARACTER_SPLIT_DAYS } from "@/lib/mdd";
import type { MddAnalysis, RiskProfile as RiskProfileData } from "@/lib/mdd";

import { CoverLinkCell, CoverMeta, Module, type CoverLink } from "../kadera/V2Modules";
import { benchName, fmtCloseDay, fmtDay, fmtDur, fmtPct, fmtPrice, fmtYm, mddSummary, similarDrop } from "./shared";
import type { PriceLadder } from "@/lib/mdd";
import type { AttributionData, MddResult, StockOption, ThemeCmp } from "./shared";

/** 차트 막대 끝 수익 — 정수로("+46%"). 막대 칸이 60px 남짓이라 소수점까지 적으면 이웃과 닿는다. 정확한 값은 툴팁에. */
const pctShort = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v))}%`;

const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "" : v > 0 ? " is-up" : " is-down");

/* ── 첫 줄 띠 ───────────────────────────────────────────────────── */
/**
 * 카더라 · 시장 브리핑 첫 줄과 같은 부품(.v2-cover). 이 화면 어디에도 없는 것만 싣는다.
 *  - 같은 기간 기준 지수의 고점 대비 — 종목만 빠졌나, 시장 전체가 내려와 있나를 첫눈에.
 *  - 종목 화면 · 테마 리포트 — 이 종목을 더 읽을 다른 화면으로.
 *  - 오른쪽 끝 종가 기준일 · 거래일 수 한 줄(옛 가격 옆 'M/D 종가'를 여기로 옮겼다 — 한 화면에 두 번 적지 않는다).
 * ⛔ 종목 가격 · 등락은 싣지 않는다 — 바로 아래 종목 칸이 크게 말한다.
 */
export function MddCover({ data, periodLabel }: { data: MddResult; periodLabel: string }) {
  const a = data.analysis;
  const bench = benchName(data.market);
  const links: CoverLink[] = [
    {
      cap: "종목 화면",
      name: data.name,
      href: data.market === "US" ? `/insider/stock/${encodeURIComponent(data.code)}` : `/stock/${data.code}`,
      ga: "mdd_cover_stock",
    },
  ];
  if (data.theme?.href) links.push({ cap: "테마 리포트", name: data.theme.name, href: data.theme.href, ga: "mdd_cover_theme" });
  // 지수 칸은 '시장 탓 · 종목 탓' 칸이 없는 종목(신고가 부근 — 그 자리엔 '시장 대비 최근 1년')에만 — 그 칸이 서면 같은 화면에 코스피 낙폭이
  // 기준이 다른 세 숫자(띠 −23.2% · 시장 탓 −22.7% · 사례 표 −38.3%)로 섰다(2026-10-05 점검).
  const showIdx = !data.attribution;
  return (
    <div className="v2-cover">
      {showIdx && (
      <div className="v2-cover-cell v2-cover-idx">
        <span className="v2-cover-k">{periodLabel} 고점 대비</span>
        <span className="v2-cover-v">
          <em>{bench}</em>
          {data.bench ? (
            <>
              <b className={data.bench.dd < 0 ? "is-down" : undefined}>{fmtPct(data.bench.dd)}</b>
              <span className="v2-cover-chg">{fmtDay(data.bench.peakDate, a.asOf)} 고점</span>
            </>
          ) : (
            <span className="v2-cover-chg">시세를 불러오지 못했습니다</span>
          )}
        </span>
      </div>
      )}
      {links.map((c) => (
        <CoverLinkCell key={c.ga} c={c} />
      ))}
      {/* 한 줄로(2026-10-03) — 카더라는 칩 둘과 함께라 두 줄로 쌓지만, 여기는 칸이 적어 한 줄에 든다. */}
      {/* 'N거래일' — 지금 낙폭 칸 '이보다 깊었던 날 682거래일'과 같은 꼴(2026-10-05 점검). */}
      <CoverMeta updated={`${fmtCloseDay(a.asOf)} 종가 기준 · ${a.tradingDays.toLocaleString("ko-KR")}거래일`} />
    </div>
  );
}

/* ── 이름 · 막대 · 값 목록 ──────────────────────────────────────── */
type DdItem = { key: string; name: string; dd: number; self?: boolean; pick?: StockOption | null };

/**
 * 종목 여럿의 지금 낙폭 — 한 단 목록, 줄마다 이름 · 막대 · 값. 막대는 모두 같은 왼쪽 선에서 출발해 길이로 견준다.
 * 옛 업종 칸은 두 단으로 접혀 왼쪽 단과 오른쪽 단을 견주려면 눈이 오르내렸고(10-03 지적), 그 뒤 잠깐 한 줄 가로 배치
 * (막대가 위에서 아래로)로 바꿨다가 "가로 형태 별로"로 되돌렸다. 막대 길이는 이 묶음에서 가장 깊은 값에 맞춘다.
 * 줄은 남는 높이를 고르게 받는다(나란한 짝 칸과 키를 맞춘다). 누를 수 있는 줄은 그 종목 MDD 로 간다(지금 종목은 안 눌린다).
 * 평균은 막대 위를 세로로 지르는 점선 하나(값은 부르는 쪽이 칸 머리에 적는다).
 */
function DdList({ items, avg, onPick, label }: { items: DdItem[]; avg?: number | null; onPick: (s: StockOption) => void; label: string }) {
  const worst = Math.max(1, ...items.map((i) => Math.abs(i.dd)), avg != null ? Math.abs(avg) : 0);
  const w = (v: number) => `${Math.max(1.5, (Math.abs(v) / worst) * 100)}%`;
  return (
    <div className="v2-dd-wrap" style={avg != null ? { ["--avg" as string]: Math.abs(avg) / worst } : undefined}>
      {/* 평균 점선 — 값은 칸 머리 근거 글자에 있다. 여기에 글자 자리를 따로 두면 나란한 짝 칸과 줄이 어긋났다. */}
      {avg != null && <div className="v2-dd-avg" aria-hidden="true" />}
      <ol className="v2-dd" aria-label={label}>
        {items.map((it) => {
          const body = (
            <>
              <span className="v2-dd-name">{it.name}</span>
              <span className="v2-dd-bar">
                <i style={{ ["--w" as string]: w(it.dd) }} />
              </span>
              <span className="v2-dd-val">{fmtPct(it.dd)}</span>
            </>
          );
          return (
            <li key={it.key} className={it.self ? "is-self" : undefined}>
              {it.pick && !it.self ? (
                <button type="button" className="v2-dd-row" onClick={() => onPick(it.pick!)} data-ga="mdd_peer_click">
                  {body}
                </button>
              ) : (
                <div className="v2-dd-row" aria-current={it.self ? "true" : undefined}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── 업종 안에서 ─────────────────────────────────────────────────── */
/** 같은 테마 대표 종목들의 지금 낙폭(각자 고점 대비) — 깊은 순 한 단 목록. 옛 sheets.tsx Theme(가로 막대 두 단)를 바꿨다. */
export function ThemeModule({ theme, onPick }: { theme: ThemeCmp; onPick: (s: StockOption) => void }) {
  const self = theme.peers.find((p) => p.isSelf);
  const rank = self ? theme.peers.filter((p) => p.dd < self.dd).length + 1 : null;
  return (
    // ⚠️ 머리에 잣대('최근 10년 고점 대비')를 더해 봤다가 걷었다(2026-10-03) — 폰(375)에서 머리가 175px 뿐이라 말줄임으로 잘렸다.
    // 위 '시장 탓' 칸의 업종 평균과 숫자가 다른 까닭(그쪽은 이 종목 고점 이후 같은 기간)은 그 칸 머리가 말한다.
    <Module
      title={`${theme.name} 대표 ${theme.peers.length}종목 안에서`}
      // 짧게 — 폰(머리 175px)에서 '깊게 빠진 순 8위 · 평균 고점 대비 −26.2%'가 말줄임으로 잘려 평균값이 사라졌다(2026-10-05 점검).
      // '깊게 빠진 순'은 깊은 순으로 늘어선 막대가 말한다. '평균' 앞 점선 표식이 그림 속 세로 점선의 이름이다.
      meta={
        <>
          {rank ? `${rank}위 · ` : ""}
          <i className="v2-dd-avg-key" aria-hidden="true" />
          평균 {fmtPct(theme.avgDd)}
        </>
      }
      className="v2-md-theme"
      // 줄이 단추라(누르면 그 종목 MDD 로 바뀐다) 표처럼만 보인다. 이 종목 자신의 줄은 단추가 아니라 단추인 첫 줄을 가리킨다.
      // 위 '역대 하락 사례' 쪽지를 본 뒤에 뜬다(app/V2Hint.tsx 차례).
      hint={theme.peers.some((p) => !p.isSelf) ? { id: "mdd-peers", order: 2, anchor: ".v2-dd > li:has(> button.v2-dd-row)", text: "종목을 누르면 그 종목의 낙폭으로 바뀝니다" } : undefined}
    >
      <DdList
        label={`${theme.name} 대표 종목 지금 낙폭`}
        items={theme.peers.map((p) => ({
          key: p.code || p.name,
          name: p.name,
          dd: p.dd,
          self: p.isSelf,
          pick: p.code ? { code: p.code, name: p.name, market: p.market ?? null } : null,
        }))}
        avg={theme.avgDd}
        onPick={onPick}
      />
    </Module>
  );
}

/* ── 수익 · 손실 비율 ─────────────────────────────────────────── */
/**
 * 최근 1년 이 종목을 산 돈 중 얼마가 지금 수익이고 얼마가 손실인가(lib/mdd.ts priceLadder 의 aboveShare) — '많이 빠진 대형주' 자리(2026-10-03).
 * 손실 = 지금 가격보다 비싸게 거래된 날의 거래대금 몫, 수익 = 나머지.
 *
 * 1~4차(10-03~04)는 큰 숫자 · 갈림 막대 · 가격대 목록이나 가격대 막대 그림을 겹쳐 실어 "한번에 이해하기 힘들다" · "너무 복잡하다" ·
 * "투박하다"였고, 도넛 하나와 숫자 둘로 줄이자 이번엔 "정보가 없는 느낌"이었다(10-04). 그래서 그림은 도넛 하나로 두고 표 하나를 더한다:
 *  ① 도넛 + 수익 중 · 손실 중 — 가운데는 기준(지금 가격).
 *  ② 평균 매수가 표 — 수익 중 · 손실 중 두 줄, 줄마다 평균 매수가와 평균 수익률(지금 가격 ÷ 평균 매수가 − 1). "산 사람들은 평균
 *     얼마에 샀고 지금 얼마나 벌었나 · 잃었나"를 한 줄씩 말한다. 칸 머리 줄(평균 매수가 · 평균 수익률)이 열의 뜻을 말해 설명 문장을 안 단다.
 *     ⚠️ 평균 수익률은 사람 수가 아니라 산 금액으로 가중한 평균이다 — 그쪽에 들어간 돈 전체의 수익률과 같다('지금 수익률'에서 고침, 10-04).
 *     '전체' 줄도 있었는데 두 줄을 돈 비중대로 섞은 값이라 겹쳐 걷었다(운영자 판단, 10-04).
 * 가격대별 몫(priceLadder 의 bands)은 그리지 않는다.
 * ⚠️ 사람 수가 아니라 거래대금(산 쪽)으로 센 어림이다 — 이미 판 사람 · 1년 넘게 든 사람은 못 가른다. 머리 근거가 '최근 1년 거래 기준'.
 */
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;
/** 두 호 사이 틈(둘레 길이). 한쪽이 0 이면 틈 없이 고리 하나. */
const RING_GAP = 1.6;

export function LadderModule({ ladder, market }: { ladder: PriceLadder; market: string | null }) {
  const isUs = market === "US";
  const priceNow = isUs ? `$${ladder.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `${Math.round(ladder.price).toLocaleString("ko-KR")}원`;
  // 둘의 합이 100 이 되게 손실을 반올림하고 수익은 나머지로.
  const loss = Math.round(ladder.aboveShare);
  const gain = 100 - loss;
  const gap = gain > 0 && loss > 0 ? RING_GAP : 0;
  const gainLen = Math.max(0, (RING_C * gain) / 100 - gap);
  const lossLen = Math.max(0, (RING_C * loss) / 100 - gap);
  // 평균은 어림이라 끝자리까지 적지 않는다 — 국장은 10만 원 이상 백 원, 만 원 이상 십 원 단위(209,432원 → 209,400원). 미장은 센트 그대로.
  const roundAvg = (v: number) => (isUs ? v : v >= 100_000 ? Math.round(v / 100) * 100 : v >= 10_000 ? Math.round(v / 10) * 10 : Math.round(v));
  // 배포 직후 옛 응답(평균 매수가 없음)이 캐시에 남아 있으면 표를 빼고 도넛만.
  const avgRows: { label: string; avg: number; cls: string }[] = [];
  for (const [label, avg, cls] of [
    ["수익 중", ladder.gainAvg, "is-gain"],
    ["손실 중", ladder.lossAvg, "is-loss"],
  ] as const) {
    if (avg != null && avg > 0) avgRows.push({ label, avg, cls });
  }
  return (
    <Module title="수익 · 손실 비율" meta="최근 1년 거래 기준" className="v2-md-pl">
      <div className="v2-md-pl-body">
        <div className="v2-md-pl-ring" role="img" aria-label={`지금 ${priceNow} 기준 수익 중 ${gain}% · 손실 중 ${loss}%`}>
          {/* 12시에서 시계 방향으로 수익(빨강), 이어서 손실(파랑). */}
          <svg viewBox="0 0 100 100" aria-hidden="true">
            {gainLen > 0 && (
              <circle cx="50" cy="50" r={RING_R} className="is-gain" strokeDasharray={`${gainLen} ${RING_C}`} strokeDashoffset={-gap / 2} />
            )}
            {lossLen > 0 && (
              <circle
                cx="50"
                cy="50"
                r={RING_R}
                className="is-loss"
                strokeDasharray={`${lossLen} ${RING_C}`}
                strokeDashoffset={-((RING_C * gain) / 100 + gap / 2)}
              />
            )}
          </svg>
          <span className="v2-md-pl-center">
            <em>지금</em>
            <b>{priceNow}</b>
          </span>
        </div>
        <dl className="v2-md-pl-legend">
          <div className="is-gain">
            <dt>수익 중</dt>
            <dd>{gain}%</dd>
          </div>
          <div className="is-loss">
            <dt>손실 중</dt>
            <dd>{loss}%</dd>
          </div>
        </dl>
      </div>
      {avgRows.length > 0 && (
        <table className="v2-md-pl-tbl">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">구분</span>
              </th>
              <th scope="col">평균 매수가</th>
              <th scope="col">평균 수익률</th>
            </tr>
          </thead>
          <tbody>
            {avgRows.map(({ label, avg, cls }) => {
              const ret = (ladder.price / avg - 1) * 100;
              return (
                <tr key={label} className={cls}>
                  <th scope="row">{label}</th>
                  <td>{fmtPrice(roundAvg(avg), market)}</td>
                  <td className={ret > 0.05 ? "is-up" : ret < -0.05 ? "is-down" : undefined}>{fmtPct(ret)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Module>
  );
}

/* ── 낙폭 요약 ─────────────────────────────────────────────────── */
/**
 * 시장 브리핑 '오늘의 브리핑'과 같은 꼴(.v2-brief3 — 이름표 칸 · 문장 칸, 줄은 남는 높이를 고르게 받는다).
 * 문장은 계산으로 만든다 — LLM 이 아니라 AI 표시를 안 붙인다.
 */
export function SummaryModule({ data }: { data: MddResult }) {
  const rows = mddSummary(data);
  return (
    <Module title="낙폭 요약" className="v2-md-sum">
      <dl className="v2-brief3">
        {rows.map((r) => (
          <div key={r.key} className="v2-brief3-row">
            <dt>{r.label}</dt>
            <dd>{r.parts.map((p, i) => (typeof p === "string" ? p : <b key={i}>{p.b}</b>))}</dd>
          </div>
        ))}
      </dl>
    </Module>
  );
}

/** 사례 표 구간 글자 — 같은 달이면 날까지, 아니면 연 · 월. 진행 중이면 시작만(뒤에 '진행 중'). */
function caseSpan(from: string, to: string | null): string {
  const dot = (iso: string) => iso.slice(0, 10).replaceAll("-", ".");
  if (to === null) return `${fmtYm(from)} ~ `;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${dot(from)} ~ ${to.slice(5, 10).replace("-", ".")}`;
  return `${fmtYm(from)} ~ ${fmtYm(to)}`;
}

/* ── 역대 하락 사례 ─────────────────────────────────────────────── */
/**
 * 사건마다 한 줄 — 번호 · 구간 · 깊이 · 같은 기간 시장 · 빠진 기간 · 되찾은 기간 · 유형. 깊은 순(lib/mdd.ts topDrawdowns).
 * 시장 칸은 고점→저점 사이 지수 등락이다(api/mdd 가 채운다). 유형은 고점→저점이 CHARACTER_SPLIT_DAYS 이하면 급락.
 */
export function CasesTable({
  a,
  periodLabel,
  market,
  focus,
  onFocus,
}: {
  a: MddAnalysis;
  periodLabel: string;
  market: string | null;
  /** 물속 차트에 강조한 사례의 고점 날짜. 줄을 누르면 켜고, 한 번 더 누르면 끈다(판정표 9). */
  focus: string | null;
  onFocus: (peakDate: string | null) => void;
}) {
  const bench = benchName(market);
  return (
    <Module
      title="역대 하락 사례"
      meta={`${periodLabel} · 깊은 순`}
      className="v2-md-cases-mod"
      // 줄이 단추다(누르면 위 물속 차트에 그 하락 구간이 칠해진다) — 생김새는 그냥 표라 눌러 볼 생각을 안 한다.
      // 쪽지는 마지막 줄을 가리켜 판 바닥에서 위로 뒤집혀 선다 — 첫 줄 밑이면 폰에서 '진행 중' 줄(가장 중요한 줄)을 덮었다(2026-10-05 모바일 점검).
      hint={{ id: "mdd-cases", order: 1, anchor: "ol > .v2-md-case:last-child", text: "줄을 누르면 차트에 그 하락 구간이 칠해집니다" }}
    >
      <div className="v2-md-cases">
        <div className="v2-md-case v2-md-case-th" aria-hidden="true">
          <span>구간</span>
          <span>깊이</span>
          {/* '그동안' — 그 사례의 고점 → 저점 사이 지수 등락이다. '코스피'만이면 지수 자체의 낙폭으로 읽혀 띠의 '코스피 −23.2%'와 겹쳤다. */}
          <span>그동안 {bench}</span>
          <span>빠진 기간</span>
          <span>회복 기간</span>
          <span>유형</span>
        </div>
        <ol>
          {a.topDrawdowns.map((e, i) => (
            <li
              key={e.peakDate}
              className={`v2-md-case${e.recovered ? "" : " is-now"}${focus === e.peakDate ? " is-on" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={focus === e.peakDate}
              aria-label={`${fmtYm(e.peakDate)} 하락 구간을 차트에 표시`}
              onClick={() => onFocus(focus === e.peakDate ? null : e.peakDate)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onFocus(focus === e.peakDate ? null : e.peakDate);
                }
              }}
            >
              <span className="v2-md-case-span">
                {/* 물속 차트의 번호 표식과 같은 번호(깊은 순) — 표와 차트가 누르지 않아도 이어진다(판정표 10). */}
                <i className="v2-md-case-n">{i + 1}</i>
                {/* 시작 · 끝이 같은 달이면 날까지('2026.06.02 ~ 06.18') — '2026.06 ~ 2026.06'은 기간이 안 보였고 같은 달 시작 사건 둘이 갈리지 않았다. */}
                {caseSpan(e.peakDate, e.recovered ? e.recoveryDate! : null)}
                {!e.recovered && <b>진행 중</b>}
              </span>
              <span className="is-num is-down">{fmtPct(e.depth)}</span>
              {/* data-k — 폰은 머리 줄을 숨겨 아래 층 숫자 셋이 무엇인지 몰랐다(파란 −23.2% 가 종목 깊이로 읽혔다). 값 앞에 칸 이름을 붙인다(카더라 표와 같은 꼴). */}
              <span className={`is-num${tone(e.market)}`} data-k={bench}>
                {e.market === null || e.market === undefined ? "없음" : fmtPct(e.market)}
              </span>
              <span className="is-num" data-k="빠진">
                {fmtDur(e.troughDays)}
              </span>
              {/* 진행 중이면 저점 이후 며칠째인지 — '진행 중'은 구간 칸이 이미 말한다. */}
              {/* 폰 칸 이름은 '회복' — '되찾은 2개월째'가 71px 칸에서 두 줄로 꺾였다(2026-10-05 점검). */}
              <span className="is-num" data-k="회복">
                {/* 진행 중도 같은 단위(1.2년 · 2개월)로 — 날수('687일째')면 같은 칸의 다른 줄과 단위가 달랐다. */}
                {e.recovered ? fmtDur(e.days - e.troughDays) : <em>{fmtDur(e.days - e.troughDays)}째</em>}
              </span>
              {/* 옆 회복까지 칸과 같은 낱말(급락형 · 완만형) — 한 화면에 두 꼴이었다(2026-10-08 마지막 점검). */}
              <span className="v2-md-case-kind">{e.troughDays <= CHARACTER_SPLIT_DAYS ? "급락형" : "완만형"}</span>
            </li>
          ))}
        </ol>
      </div>
    </Module>
  );
}

/* ── 회복까지 ───────────────────────────────────────────────────── */
/**
 * 지금만큼(또는 더) 빠졌던 하락이 고점을 되찾기까지 걸린 기간 — 보통(중앙값) · 최단~최장 · 그중 몇 번 되찾았나.
 * 아래 두 줄은 빠진 속도별(급락형 · 완만형) 회복 중앙값이고 지금 하락이 어느 쪽인지 꼬리표를 단다(옛 '이 하락의 성격').
 * ⭐ 위아래가 **다른 하락들**을 센다(위: 지금만큼 깊었던 것 · 아래: 15% 넘게 빠졌다 되찾은 것) — 둘 다 문턱을 숫자로 적는다.
 *    '이만큼 빠졌던 2번 중 1번'과 '15% 넘게 … 3번'이 한 카드에 서서 숫자가 안 맞아 보였다(2026-10-04 점검). '중앙값'은 '보통'으로.
 */
export function RecoveryModule({ a }: { a: MddAnalysis }) {
  const r = a.recovery!;
  // 문턱은 지금 낙폭 그대로(소수 한 자리) — 반올림하면(23.9 → 24) 센 하락과 글자가 조금 어긋난다.
  const depth = `${Math.abs(a.currentDd).toFixed(1)}% 넘게`;
  const ch = a.character;
  // 저점 이후 — 위 '보통 ○년'과 같은 기준(저점에서 되찾기까지, lib/mdd.ts recoveryStats). 고점 이후 날수와 견주면 기준이 달랐다(2026-10-05 점검).
  const sinceLow = Math.round((Date.parse(a.asOf) - Date.parse(a.lowDate)) / 86_400_000);
  const hasRange = r.recoveredCount >= 2 && r.minDays !== null && r.maxDays !== null && r.maxDays > r.minDays;
  const kinds = ch
    ? ([
        ["fast", "급락형", ch.fast],
        ["slow", "완만형", ch.slow],
      ] as const)
    : [];
  return (
    // 회복한 사례가 없으면 이번이 처음이다(진행 중인 하락은 마지막 하나뿐) — '1번 중 0번 되찾음'으로 적혔다(카카오 5년 실측).
    // 몇 번 중 몇 번이 회복했는지는 머리 근거가 아니라 큰 숫자 옆에 — 큰 숫자가 그 하락들의 기간이다(2026-10-05 운영자 판단).
    <Module title="회복까지" className="v2-md-rec">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          {r.recoveredCount > 0 ? (
            <>
              <b>{fmtDur(r.medianDays!)}</b>
              <span className="v2-reason">{r.recoveredCount === 1 ? "걸림" : "보통"}</span>
              <span className="v2-md-aside">{`${depth} 빠졌던 ${r.similarCount}번 중 ${r.recoveredCount}번 회복함`}</span>
            </>
          ) : (
            <>
              <b className="is-down">{fmtDur(sinceLow)}째</b>
              <span className="v2-reason">저점 이후</span>
              <span className="v2-md-aside">{`${depth} 빠진 건 이번이 처음`}</span>
            </>
          )}
        </span>
        {hasRange && <RangeLine min={r.minDays!} median={r.medianDays!} max={r.maxDays!} />}
        {/* 범위 줄이 없고 꼴별 줄도 없으면 이 기간에 되찾은 (지금보다 얕은) 하락들을 적는다 — 큰 숫자 하나만 남아 판이 비었다
            (2026-10-04 점검, 1년 조회). 회복이 한 번뿐인 때(SK하이닉스 8줄)도 같아 칸 위아래가 178 · 181px 비었다(2026-10-08 마지막 점검). */}
        {!hasRange && !kinds.some(([, , k]) => k) && a.topDrawdowns.some((e) => e.recovered && e.depth > a.currentDd) && (
          <dl className="v2-md-kv">
            {a.topDrawdowns
              .filter((e) => e.recovered && e.depth > a.currentDd)
              .slice(0, 3)
              .map((e) => (
                <div key={e.peakDate}>
                  <dt>{fmtPct(e.depth)} 빠졌을 때</dt>
                  <dd>회복까지 {fmtDur(e.days - e.troughDays)}</dd>
                </div>
              ))}
          </dl>
        )}
        {kinds.some(([, , k]) => k) && (
          <div className="v2-md-kinds">
            {/* 머리 줄은 걷었다 — 아래 두 줄도 위 큰 숫자 옆('이만큼 빠졌던 n번 중 m번 회복함')과 같은 하락을 센다(lib/mdd.ts drawdownCharacter, 2026-10-05). */}
            {kinds.map(([key, label, k]) => (
              <div key={key} className={`v2-md-kind${ch!.currentClass === key ? " is-now" : ""}`}>
                <span className="v2-md-kind-name">
                  {label}
                  {ch!.currentClass === key && <span className="v2-badge">지금</span>}
                </span>
                <span className="v2-md-kind-n">{k ? `${k.count}번` : "없음"}</span>
                {/* '보통' — 무엇의 기간인지(그 꼴 하락이 되찾기까지 걸린 중앙값). 숫자만이면 '3번 2개월'로 읽혔다(10-03). */}
                {/* 한 번뿐이면 '보통'이 아니다 — 그 한 번이 걸린 기간(위 큰 숫자의 '걸림'과 같은 말, 2026-10-04 점검). */}
                <span className="v2-md-kind-v">{k ? (k.count === 1 ? `${fmtDur(k.medianRecovery)} 걸림` : `보통 ${fmtDur(k.medianRecovery)}`) : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Module>
  );
}

/**
 * 최단~최장 위에 중앙값 점 — 회복까지 걸린 기간의 퍼짐. 중앙값 글자는 바로 위 큰 숫자라 다시 적지 않고(10-03 되풀이 걷음),
 * 양 끝에 '최단 · 최장'을 붙인다(예전엔 숫자만 있어 무엇의 끝인지 몰랐다). 회복이라 빨강 계열.
 */
function RangeLine({ min, median, max }: { min: number; median: number; max: number }) {
  const at = max > min ? ((median - min) / (max - min)) * 100 : 50;
  return (
    <div className="v2-md-range">
      <span className="v2-md-range-track">
        <i style={{ left: `${at}%` }} />
      </span>
      <span className="v2-md-range-lab">
        <span>최단 {fmtDur(min)}</span>
        <span>최장 {fmtDur(max)}</span>
      </span>
    </div>
  );
}

/* ── 시장 탓 · 종목 탓 ───────────────────────────────────────────── */
/**
 * 고점 이후 같은 기간 — 기준 지수 · 업종(대표 종목 평균, 이 종목 제외) · 이 종목의 등락을 나란히. 큰 숫자는 기준(업종, 없으면 지수)보다
 * 더 · 덜 빠진 몫(%p). 옛 sheets.tsx Attribution(옛 시트 + 인라인 34px · 11.5px · 굵기 800)을 v2 모듈 꼴로 다시 썼다(2026-10-03).
 *
 * ⚠️ 업종보다 덜 빠진 종목이 절반쯤이다 — 그때 '종목 탓'을 그대로 쓰면 음수가 된다. 낱말을 '덜 빠진 폭'으로 바꾼다.
 * 단위는 %p — 두 낙폭률의 차이라 % 로 적으면 틀린 말이 된다. 큰 숫자는 온도색을 안 쓴다(경보처럼 읽혔다).
 * 업종 이름은 '○○ 평균' — 다른 칸('대표 종목')과 같은 대상을 '업종'이라 부르던 것을 맞췄다. 어느 종목인지는 아래 업종 칸이 적는다.
 */
export function AttributionModule({
  attr,
  stockName,
  themeName,
  market,
  since,
}: {
  attr: AttributionData;
  stockName: string;
  themeName: string | null;
  market: string | null;
  /** 고점 날짜(화면 말투, '6월 18일') — 칸 머리 '○ 고점 이후'. */
  since: string;
}) {
  const bench = benchName(market);
  // 받침에 따라 와 · 과(요약 줄 mddSummary 의 은 · 는과 같은 셈 — S&P500 은 '오백', 코스닥은 받침이 있다).
  const wa = market === "US" || market === "KOSDAQ" ? "과" : "와";
  // 업종 이름만 — '○○ 평균'이면 바로 아래 업종 칸 머리 '평균 −26.9%'(각자 고점 대비)와 섞여 읽혔다(2026-10-08 마지막 점검).
  //    대표 종목 평균이라는 뜻은 바로 위 낙폭 요약이 말한다. '인터넷·플랫폼 대표 종목'은 96px 칸에서 두 줄이었다(10-05).
  const themeLabel = themeName ?? "업종";
  const rows: { key: string; label: string; v: number; self?: boolean }[] = [];
  if (attr.market !== null) rows.push({ key: "market", label: bench, v: attr.market });
  if (attr.theme !== null) rows.push({ key: "theme", label: themeLabel, v: attr.theme });
  rows.push({ key: "self", label: stockName, v: attr.stock, self: true });
  const worst = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  /* 판정은 제목 그대로 **시장(지수) 먼저**, 요약 줄과 같은 잣대(similarDrop — 3%p 또는 낙폭의 15%)로 가른다. 업종 평균을 먼저 보던 때
     코스피와 거의 같이 빠진 삼성전자가 '14.7%p 종목 탓'으로, 바로 위 요약은 '코스피와 비슷'으로 서로 반대말을 했다(2026-10-04 점검).
       시장과 비슷 → 시장 탓 · 시장보다 덜 → 덜 빠짐 · 시장보다 더, 업종과 비슷 → 업종 탓 · 시장 · 업종보다 다 더 → 종목 탓. */
  const m = attr.market;
  const t = attr.theme;
  const s0 = attr.stock;
  const verdict =
    m === null
      ? null
      : similarDrop(s0, m)
        ? { word: "시장 탓", big: m, note: `${bench}${wa} 비슷하게 빠짐` }
        : s0 > m
          ? { word: "덜 빠짐", big: s0 - m, note: `${bench}보다 덜 빠짐` }
          : t !== null && (similarDrop(s0, t) || s0 > t)
            ? { word: "업종 탓", big: s0 - m, note: `${bench}보다 더 · 업종과 비슷하게 빠짐` }
            : { word: "종목 탓", big: s0 - m, note: t !== null ? `${bench} · 업종보다 더 빠짐` : `${bench}보다 더 빠짐` };
  // 부호가 섞이면(시장은 오르고 종목은 빠짐) 막대를 가운데 0 선에서 좌우로 — 같은 방향으로 뻗으면 방향을 색으로만 갈랐다(2026-10-05 점검).
  const mixed = rows.some((r) => r.v > 0) && rows.some((r) => r.v < 0);
  return (
    <Module title="시장 탓 · 종목 탓" meta={`${since} 고점 이후`} className="v2-md-attr">
      <div className="v2-md-body">
        {verdict && s0 !== 0 && (
          <span className="v2-card-val is-big">
            {/* 큰 숫자는 늘 시장(지수)과의 차이(%p) — '시장 탓'일 때만 시장의 낙폭을 적으면 종목 칸 안이라 이 종목 낙폭으로 읽혔다(2026-10-05 점검). */}
            <b>{`${Math.abs(s0 - m!).toFixed(1)}%p`}</b>
            <span className="v2-reason">{verdict.word}</span>
            <span className="v2-md-aside">{verdict.note}</span>
          </span>
        )}
        <AttrRows rows={rows} worst={worst} mixed={mixed} />
      </div>
    </Module>
  );
}

/**
 * 이름 · 막대 · 값 줄들(시장 탓 · 시장 대비 칸). 부호가 섞이면(mixed) 막대는 가운데 0 선에서 좌우로 뻗는다 — 길이는 같은 잣대(worst)의 반폭.
 */
function AttrRows({ rows, worst, mixed }: { rows: { key: string; label: string; v: number; self?: boolean }[]; worst: number; mixed: boolean }) {
  return (
    <ol className={`v2-md-attr-rows${mixed ? " is-mixed" : ""}`}>
      {rows.map((r) => (
        <li key={r.key} className={r.self ? "is-self" : undefined}>
          <span className="v2-md-attr-name">{r.label}</span>
          <span className="v2-dd-bar">
            <i className={r.v >= 0 ? "is-up" : undefined} style={{ ["--w" as string]: `${Math.max(1.5, (Math.abs(r.v) / worst) * 100)}%` }} />
          </span>
          <span className={`v2-md-attr-val${r.v > 0 ? " is-up" : ""}`}>{fmtPct(r.v)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ── 고점 부근 종목의 두 칸 ─────────────────────────────────────────── */
const daysOf = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * 직전 큰 하락 — 고점 부근이라 '회복까지'를 잴 하락이 없을 때 그 자리에 선다. 마지막으로 크게 빠졌다 되찾은 일(lib/mdd.ts lastDrop)의
 * 깊이 · 빠진 기간 · 되찾기까지. 한 줄 문장만 든 빈 판이던 자리다(2026-10-04 점검, 엔비디아).
 */
export function LastDropModule({ d, asOf }: { d: NonNullable<MddAnalysis["lastDrop"]>; asOf: string }) {
  const fall = daysOf(d.peakDate, d.troughDate);
  const back = daysOf(d.troughDate, d.recoveryDate);
  return (
    <Module title="직전 큰 하락" meta={`${fmtYm(d.peakDate)} ~ ${fmtYm(d.recoveryDate)}`} className="v2-md-lastdrop">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          <b className="is-down">{fmtPct(d.depth)}</b>
          {/* 곁글 — 회색 알약은 판정 낱말에만 쓴다(지금 낙폭 '전고점 대비'와 같은 꼴, 2026-10-08 마지막 점검). */}
          <span className="v2-md-aside">고점 대비</span>
        </span>
        <dl className="v2-md-kv">
          <div>
            <dt>빠진 기간</dt>
            <dd>{fmtDur(fall)}</dd>
          </div>
          <div>
            <dt>회복 기간</dt>
            <dd>{fmtDur(back)}</dd>
          </div>
          <div>
            <dt>고점을 회복한 날</dt>
            {/* 지금 낙폭 칸 '회복한 날'과 같은 꼴('10월 1일') — '2026.10.01'로 두 꼴이 섰다(2026-10-05 점검). */}
            <dd>{fmtDay(d.recoveryDate, asOf)}</dd>
          </div>
        </dl>
      </div>
    </Module>
  );
}

/** 최근 1년 시장 대비 — 고점 부근이라 '시장 탓 · 종목 탓'을 나눌 하락이 없을 때 그 자리에 선다(api/mdd yearCmp). 막대 꼴은 그 칸과 같다. */
export function YearVsMarketModule({ c, stockName, market }: { c: { stock: number; market: number }; stockName: string; market: string | null }) {
  const bench = benchName(market);
  const gap = c.stock - c.market;
  const rows = [
    { key: "market", label: bench, v: c.market, self: false },
    { key: "self", label: stockName, v: c.stock, self: true },
  ];
  const worst = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  return (
    <Module title="시장 대비" meta="최근 1년" className="v2-md-attr">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          <b>{Math.abs(gap).toFixed(1)}%p</b>
          <span className="v2-reason">{gap >= 0 ? "더 오름" : "덜 오름"}</span>
          <span className="v2-md-aside">{bench}보다</span>
        </span>
        <AttrRows rows={rows} worst={worst} mixed={rows.some((r) => r.v > 0) && rows.some((r) => r.v < 0)} />
      </div>
    </Module>
  );
}

/* ── 해마다 ─────────────────────────────────────────────────────── */
/**
 * 조회 기간의 해마다 주가 수익(전해 마지막 종가 대비) — 막대 차트 하나. 머리 숫자는 복리 연평균(CAGR · 배당 제외)이다.
 * ⚠️ 해는 조회 기간만큼 자른다 — yearlyStats 는 거래일 20일 넘는 해를 다 세서 10년 조회에 11개가 나온다(옛 RiskProfile 과 같다).
 *
 * 예전엔 칸 안에 테두리 친 격자 표(연도 · 수익 · 낙폭 세 줄 + 머리 칸)가 또 들어 있어 "카드 안에 표가 또 있어 복잡하다"(10-03)였다.
 * 지금은 0 선에서 오르면 위(빨강) · 빠지면 아래(파랑) 막대와 막대 끝 수익, 바닥에 연도뿐이다. 그 해 낙폭은 막대에 올리면 뜨고,
 * 평균은 머리 줄에 있다. 차트는 남는 높이를 받는다(옆 '시장 탓' 칸과 키를 맞춘다).
 * 해가 많으면(전체 조회 27년 등) 막대 끝 숫자가 서로 닿아 숨기고(툴팁에 있다) 연도는 하나 걸러 적는다.
 */
export function YearsModule({
  r,
  periodLabel,
  asOf,
  firstDate,
}: {
  r: RiskProfileData;
  periodLabel: string;
  /** 마지막 거래일 — 그해 막대는 덜 찬 해라 옅게 · '올해'로. */
  asOf: string;
  /** 자료 첫날 — 1년 조회의 첫 해(작년 끝 몇 달)도 덜 찬 해다. */
  firstDate: string;
}) {
  // 2년이 안 되는 조회는 걸친 해를 다 그린다(1년 조회면 작년 끝 몇 달 + 올해) — 하나만 그리면 머리의 1년 수익과 막대가 안 맞았다(2026-10-04 점검).
  const short = r.years < 2;
  const yrs = short ? r.yearly.length : Math.max(1, Math.round(r.years));
  const years = r.yearly.slice(-yrs);
  const avgMdd = years.length ? years.reduce((s, y) => s + y.mdd, 0) / years.length : 0;
  const maxUp = Math.max(0, ...years.map((y) => y.ret));
  const maxDown = Math.max(0, ...years.map((y) => -y.ret));
  const span = Math.max(1, maxUp + maxDown);
  const dense = years.length > 14;
  // 막대가 적으면(3 · 5년 조회) 24px 막대 사이가 200px 넘게 비었다 — 막대를 넓힌다(2026-10-05 점검).
  const few = years.length <= 6;
  // 막대가 많으면 끝 숫자를 숨기되 가장 높은 해 · 가장 낮은 해 · 올해는 남긴다 — 다 숨기면 축도 숫자도 없는 그림이었다(2026-10-05 점검).
  const keepYears = new Set<number>();
  if (dense && years.length) {
    keepYears.add(years.reduce((b, y) => (y.ret > b.ret ? y : b)).year);
    keepYears.add(years.reduce((b, y) => (y.ret < b.ret ? y : b)).year);
    keepYears.add(Number(asOf.slice(0, 4)));
  }
  // 자료가 그 해 1월 초부터가 아니면 첫 해도 덜 찬 해다(1년 조회의 '2025' = 10~12월 석 달, 2026-10-05 점검).
  const firstYear = Number(firstDate.slice(0, 4));
  const firstPart = firstDate.slice(5) > "01-10";
  // 폰(10년이면 칸 32px)에선 세 자리 수익("+214%", 11px 37px)이 이웃 숫자와 닿았다(알테오젠 · 테슬라 실측) — 세 자리만 폰에서 한 단
  // 작게(.is-wide) 써서 숫자가 제 칸 폭 안에 들게 한다. 이웃 숫자를 위로 띄우는 길은 짧은 막대 쪽을 띄우면 오히려 붙었다.
  const wide = (v: number) => Math.round(Math.abs(v)) >= 100;
  return (
    <Module title="해마다" meta={`${periodLabel} · 주가만(배당 제외)`} className="v2-md-years">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          {/* 1년 남짓이면 '연 복리'가 아니라 그 기간 수익 그대로 — 연 환산 값은 막대(올해 · 작년 끝)와 셈이 안 맞았다. */}
          {short ? (
            <>
              <b className={tone(r.annualReturn).trim()}>{fmtPct((Math.pow(1 + r.annualReturn / 100, r.years) - 1) * 100)}</b>
              <span className="v2-reason">기간 수익</span>
            </>
          ) : (
            <>
              <b className={tone(r.annualReturn).trim()}>연 {fmtPct(r.annualReturn)}</b>
              <span className="v2-reason">복리 수익</span>
            </>
          )}
          <span className="v2-md-aside">
            해마다 낙폭 평균 <b className="is-down">{fmtPct(avgMdd)}</b>
          </span>
        </span>
        <div
          className={`v2-yc${dense ? " is-dense" : ""}${few ? " is-few" : ""}`}
          style={{ ["--n" as string]: years.length, ["--zero" as string]: `${(maxUp / span) * 100}%` }}
          role="img"
          aria-label={`해마다 수익 ${years.map((y) => `${y.year}년 ${fmtPct(y.ret)}`).join(", ")}`}
        >
          {years.map((y, i) => {
            const at = years.length <= 1 ? 0.5 : i / (years.length - 1);
            const edge = at < 0.2 ? " hz-tip-start" : at > 0.8 ? " hz-tip-end" : "";
            // 마지막 거래일의 해는 아직 덜 찼다 — 옅게 칠하고 '올해'로, 툴팁에 '○월 ○일까지'(2026-10-04 점검: 아홉 달 성적이 한 해처럼 읽혔다).
            const partYear = y.year === Number(asOf.slice(0, 4));
            const headPart = !partYear && firstPart && y.year === firstYear;
            const upTo = partYear
              ? ` · ${Number(asOf.slice(5, 7))}월 ${Number(asOf.slice(8, 10))}일까지`
              : headPart
                ? ` · ${Number(firstDate.slice(5, 7))}월 ${Number(firstDate.slice(8, 10))}일부터`
                : "";
            return (
              <div key={y.year} className={`v2-yc-col hz-tip${edge}`} data-tip={`${y.year}년${upTo} · 수익 ${fmtPct(y.ret)} · 그 해 낙폭 ${fmtPct(y.mdd)}`}>
                <span className="v2-yc-plot">
                  <i className={`${y.ret >= 0 ? "is-up" : "is-down"}${partYear || headPart ? " is-part" : ""}`} style={{ ["--h" as string]: `${(Math.abs(y.ret) / span) * 100}%` }}>
                    {/* 폰은 '+'를 뗀 짧은 꼴(.is-bare) — 10년이면 칸이 32px 라 '+125%+130%'처럼 붙어 읽혔다(2026-10-04 점검). 방향은 막대 색이 말한다. */}
                    <em className={wide(y.ret) ? "is-wide" : undefined} data-keep={keepYears.has(y.year) ? "" : undefined}>
                      <span className="v2-yc-full">{pctShort(y.ret)}</span>
                      <span className="v2-yc-bare">{y.ret < 0 ? pctShort(y.ret) : `${Math.round(y.ret)}%`}</span>
                    </em>
                  </i>
                </span>
                {/* 하나 걸러 숨길 연도 — 해가 많을 때(.is-dense)만 CSS 가 숨긴다. */}
                <span className="v2-yc-yr" data-minor={i % 2 === 1 && !partYear ? "" : undefined}>
                  {/* 320 폰은 두 자리(’17) — 네 자리가 '201/7'로 꺾였다(2026-10-05 모바일 점검). 갈아 끼우는 건 v2.css. */}
                  {partYear ? (
                    "올해"
                  ) : (
                    <>
                      <span className="v2-yc-y4">{y.year}</span>
                      <span className="v2-yc-y2">’{String(y.year).slice(2)}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Module>
  );
}

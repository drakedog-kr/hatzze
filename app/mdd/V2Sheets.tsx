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
import { benchName, fmtCloseDay, fmtDay, fmtDayCount, fmtDur, fmtPct, fmtPrice, fmtYm, mddSummary } from "./shared";
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
  return (
    <div className="v2-cover">
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
      {links.map((c) => (
        <CoverLinkCell key={c.ga} c={c} />
      ))}
      {/* 한 줄로(2026-10-03) — 카더라는 칩 둘과 함께라 두 줄로 쌓지만, 여기는 칸이 적어 한 줄에 든다. */}
      <CoverMeta updated={`${fmtCloseDay(a.asOf)} 종가 기준 · 거래일 ${a.tradingDays.toLocaleString("ko-KR")}일`} />
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
      meta={`${rank ? `깊게 빠진 순 ${rank}위 · ` : ""}평균 ${fmtPct(theme.avgDd)}`}
      className="v2-md-theme"
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
    <Module title="역대 하락 사례" meta={`${periodLabel} · 깊은 순`} className="v2-md-cases-mod">
      <div className="v2-md-cases">
        <div className="v2-md-case v2-md-case-th" aria-hidden="true">
          <span>구간</span>
          <span>깊이</span>
          <span>{bench}</span>
          <span>빠진 기간</span>
          <span>되찾은 기간</span>
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
                {fmtYm(e.peakDate)} ~ {e.recovered ? fmtYm(e.recoveryDate!) : <b>진행 중</b>}
              </span>
              <span className="is-num is-down">{fmtPct(e.depth)}</span>
              <span className={`is-num${tone(e.market)}`}>{e.market === null || e.market === undefined ? "없음" : fmtPct(e.market)}</span>
              <span className="is-num">{fmtDur(e.troughDays)}</span>
              {/* 진행 중이면 저점 이후 며칠째인지 — '진행 중'은 구간 칸이 이미 말한다. */}
              <span className="is-num">{e.recovered ? fmtDur(e.days - e.troughDays) : <em>{fmtDayCount(e.days - e.troughDays)}째</em>}</span>
              <span className="v2-md-case-kind">{e.troughDays <= CHARACTER_SPLIT_DAYS ? "급락" : "완만"}</span>
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
  const sincePeak = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);
  const hasRange = r.recoveredCount >= 2 && r.minDays !== null && r.maxDays !== null && r.maxDays > r.minDays;
  const kinds = ch
    ? ([
        ["fast", "급락형", ch.fast],
        ["slow", "완만형", ch.slow],
      ] as const)
    : [];
  return (
    // 되찾은 사례가 없으면 이번이 처음이다(진행 중인 하락은 마지막 하나뿐) — '1번 중 0번 되찾음'으로 적혔다(카카오 5년 실측).
    <Module
      title="회복까지"
      meta={r.recoveredCount > 0 ? `${depth} 빠졌던 ${r.similarCount}번 중 ${r.recoveredCount}번 되찾음` : `${depth} 빠진 건 이번이 처음`}
      className="v2-md-rec"
    >
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          {r.recoveredCount > 0 ? (
            <>
              <b>{fmtDur(r.medianDays!)}</b>
              <span className="v2-reason">{r.recoveredCount === 1 ? "걸림" : "보통"}</span>
            </>
          ) : (
            <>
              <b className="is-down">{fmtDayCount(sincePeak)}째</b>
              <span className="v2-reason">고점 이후</span>
            </>
          )}
        </span>
        {hasRange && <RangeLine min={r.minDays!} median={r.medianDays!} max={r.maxDays!} />}
        {kinds.some(([, , k]) => k) && (
          <div className="v2-md-kinds">
            {/* 머리 줄 — 아래 두 줄이 센 하락. 위 '이만큼 빠졌던 n번'(지금만큼 깊었던 것)과 모집단이 달라(15% 넘게 빠졌다 되찾은 것 전부)
                3번 + 2번이 4번과 안 맞아 보였다(2026-10-03). */}
            <span className="v2-md-kinds-cap">15% 넘게 빠졌다 되찾은 {kinds.reduce((s, [, , k]) => s + (k?.count ?? 0), 0)}번</span>
            {kinds.map(([key, label, k]) => (
              <div key={key} className={`v2-md-kind${ch!.currentClass === key ? " is-now" : ""}`}>
                <span className="v2-md-kind-name">
                  {label}
                  {ch!.currentClass === key && <span className="v2-badge">지금</span>}
                </span>
                <span className="v2-md-kind-n">{k ? `${k.count}번` : "없음"}</span>
                {/* '보통' — 무엇의 기간인지(그 꼴 하락이 되찾기까지 걸린 중앙값). 숫자만이면 '3번 2개월'로 읽혔다(10-03). */}
                <span className="v2-md-kind-v">{k ? `보통 ${fmtDur(k.medianRecovery)}` : ""}</span>
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
  const rows: { key: string; label: string; v: number; self?: boolean }[] = [];
  if (attr.market !== null) rows.push({ key: "market", label: bench, v: attr.market });
  if (attr.theme !== null) rows.push({ key: "theme", label: `${themeName ?? "업종"} 평균`, v: attr.theme });
  rows.push({ key: "self", label: stockName, v: attr.stock, self: true });
  const worst = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  const base = attr.theme ?? attr.market;
  const gap = base !== null && attr.stock !== 0 ? attr.stock - base : null;
  const excess = gap !== null && gap < 0;
  const baseLabel = attr.theme !== null ? `${themeName ?? "업종"} 평균` : bench;
  return (
    <Module title="시장 탓 · 종목 탓" meta={`${since} 고점 이후`} className="v2-md-attr">
      <div className="v2-md-body">
        {gap !== null && (
          <span className="v2-card-val is-big">
            <b>{Math.abs(gap).toFixed(1)}%p</b>
            <span className="v2-reason">{excess ? "종목 탓" : "덜 빠진 폭"}</span>
            <span className="v2-md-aside">
              {baseLabel}보다 {excess ? "더" : "덜"} 빠짐
            </span>
          </span>
        )}
        <ol className="v2-md-attr-rows">
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
export function YearsModule({ r, periodLabel }: { r: RiskProfileData; periodLabel: string }) {
  const yrs = Math.max(1, Math.round(r.years));
  const years = r.yearly.slice(-yrs);
  const avgMdd = years.length ? years.reduce((s, y) => s + y.mdd, 0) / years.length : 0;
  const maxUp = Math.max(0, ...years.map((y) => y.ret));
  const maxDown = Math.max(0, ...years.map((y) => -y.ret));
  const span = Math.max(1, maxUp + maxDown);
  const dense = years.length > 14;
  // 폰(10년이면 칸 32px)에선 세 자리 수익("+214%", 11px 37px)이 이웃 숫자와 닿았다(알테오젠 · 테슬라 실측) — 세 자리만 폰에서 한 단
  // 작게(.is-wide) 써서 숫자가 제 칸 폭 안에 들게 한다. 이웃 숫자를 위로 띄우는 길은 짧은 막대 쪽을 띄우면 오히려 붙었다.
  const wide = (v: number) => Math.round(Math.abs(v)) >= 100;
  return (
    <Module title="해마다" meta={`${periodLabel} · 주가만(배당 제외)`} className="v2-md-years">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          <b className={tone(r.annualReturn).trim()}>연 {fmtPct(r.annualReturn)}</b>
          <span className="v2-reason">복리 수익</span>
          <span className="v2-md-aside">
            해마다 낙폭 평균 <b className="is-down">{fmtPct(avgMdd)}</b>
          </span>
        </span>
        <div
          className={`v2-yc${dense ? " is-dense" : ""}`}
          style={{ ["--n" as string]: years.length, ["--zero" as string]: `${(maxUp / span) * 100}%` }}
          role="img"
          aria-label={`해마다 수익 ${years.map((y) => `${y.year}년 ${fmtPct(y.ret)}`).join(", ")}`}
        >
          {years.map((y, i) => {
            const at = years.length <= 1 ? 0.5 : i / (years.length - 1);
            const edge = at < 0.2 ? " hz-tip-start" : at > 0.8 ? " hz-tip-end" : "";
            return (
              <div key={y.year} className={`v2-yc-col hz-tip${edge}`} data-tip={`${y.year}년 · 수익 ${fmtPct(y.ret)} · 그 해 낙폭 ${fmtPct(y.mdd)}`}>
                <span className="v2-yc-plot">
                  <i className={y.ret >= 0 ? "is-up" : "is-down"} style={{ ["--h" as string]: `${(Math.abs(y.ret) / span) * 100}%` }}>
                    <em className={wide(y.ret) ? "is-wide" : undefined}>{pctShort(y.ret)}</em>
                  </i>
                </span>
                {/* 하나 걸러 숨길 연도 — 해가 많을 때(.is-dense)만 CSS 가 숨긴다. */}
                <span className="v2-yc-yr" data-minor={i % 2 === 1 ? "" : undefined}>
                  {y.year}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Module>
  );
}

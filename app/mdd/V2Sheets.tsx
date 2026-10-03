"use client";

// v2 MDD 의 새 모듈들(2026-10-03 "껍데기만 바꾸면 v2 가 아니다" → 판정표 1 · 2단계).
//  - 첫 줄 띠(2단계 7) — 같은 기간 지수의 고점 대비 · 종목 화면 · 테마 리포트 · 종가 기준일. 카더라 · 브리핑과 같은 부품.
//  - 낙폭 요약(둘째 줄 셋째 칸) — 옛 '이 하락의 맥락' 세 문단을 이름표 줄로 다시 짰다(문장은 shared.ts mddSummary).
//  - 역대 하락 사례 — 옛 'Top 5' · 리스크 '하락 vs 회복 속도' · '혼자 빠지나, 같이 빠지나' · 성격 타일이 같은 사건을 네 군데서 말하던 것을 표 하나로.
//  - 회복까지 — 옛 '회복까지 걸린 기간' + '이 하락의 성격'(급락형 · 완만형의 회복 중앙값). 깊이 분포 막대는 사례 표와 겹쳐 뺐다.
//  - 해마다 — 옛 리스크 '낙폭 대비 보상'. 최근 다섯 해 + '전체보기' 팝업 대신 조회 기간의 해를 다 펼친다(누르지 않고 보이게).
//  - 업종 안에서 · 많이 빠진 대형주(2단계 8 · 9) — 한 줄로 늘어선 막대(DdColumns). 누르면 그 종목 MDD 로.

import { CHARACTER_SPLIT_DAYS } from "@/lib/mdd";
import type { MddAnalysis, RiskProfile as RiskProfileData } from "@/lib/mdd";

import { CoverLinkCell, CoverMeta, Module, type CoverLink } from "../kadera/V2Modules";
import { RecoveryRange } from "./sheets";
import { BIG_DROP_SHOW, benchName, fmtCloseDay, fmtDay, fmtDayCount, fmtDur, fmtPct, fmtYm, mddSummary } from "./shared";
import type { BigDrops, MddResult, StockOption, ThemeCmp } from "./shared";

/** 해마다 칸의 수익 — 100% 넘으면 소수점을 뗀다("+274.4%"가 칸 폭 57px 에서 잘렸다, 1280 실측). */
const pctCell = (v: number) => (Math.abs(v) >= 100 ? `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v))}%` : fmtPct(v));

const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "" : v > 0 ? " is-up" : " is-down");

/* ── 첫 줄 띠 ───────────────────────────────────────────────────── */
/**
 * 카더라 · 시장 브리핑 첫 줄과 같은 부품(.v2-cover). 이 화면 어디에도 없는 것만 싣는다.
 *  - 같은 기간 기준 지수의 고점 대비 — 종목만 빠졌나, 시장 전체가 내려와 있나를 첫눈에.
 *  - 종목 화면 · 테마 리포트 — 이 종목을 더 읽을 다른 화면으로.
 *  - 오른쪽 끝 종가 기준일 · 거래일 수(옛 가격 옆 'M/D 종가'를 여기로 옮겼다 — 한 화면에 두 번 적지 않는다).
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
      <CoverMeta updated={`${fmtCloseDay(a.asOf)} 종가 기준`} basis={`거래일 ${a.tradingDays.toLocaleString("ko-KR")}일`} />
    </div>
  );
}

/* ── 한 줄로 늘어선 막대 ─────────────────────────────────────────── */
type DdItem = { key: string; name: string; dd: number; self?: boolean; pick?: StockOption | null };

/**
 * 종목 여럿의 지금 낙폭을 **한 줄로** — 막대가 같은 윗선(0%)에서 아래로 내려온다(물속 차트와 같은 방향).
 * 예전 업종 칸은 가로 막대를 두 단으로 접어, 왼쪽 단과 오른쪽 단을 견주려면 눈이 오르내렸다(2026-10-03 지적).
 * 한 줄이면 모든 막대가 한 잣대 위에 선다. 폰(≤679)은 열한 칸이 안 들어가 한 단 가로 막대로 접는다(CSS).
 * 막대 길이는 이 묶음에서 가장 깊은 값에 맞춘다. 누를 수 있는 칸은 그 종목 MDD 로 간다(지금 종목은 안 눌린다).
 */
function DdColumns({ items, avg, onPick, label }: { items: DdItem[]; avg?: number | null; onPick: (s: StockOption) => void; label: string }) {
  const worst = Math.max(1, ...items.map((i) => Math.abs(i.dd)), avg != null ? Math.abs(avg) : 0);
  const h = (v: number) => `${Math.max(2, (Math.abs(v) / worst) * 100)}%`;
  return (
    <div className="v2-dd-wrap" style={{ ["--n" as string]: items.length, ["--avg" as string]: avg != null ? Math.abs(avg) / worst : 0 }}>
      <ol className="v2-dd" aria-label={label}>
        {items.map((it) => {
          const body = (
            <>
              <span className="v2-dd-name">{it.name}</span>
              <span className="v2-dd-val">{fmtPct(it.dd)}</span>
              <span className="v2-dd-bar">
                <i style={{ ["--h" as string]: h(it.dd) }} />
              </span>
            </>
          );
          return (
            <li key={it.key} className={it.self ? "is-self" : undefined}>
              {it.pick && !it.self ? (
                <button type="button" className="v2-dd-col" onClick={() => onPick(it.pick!)} data-ga="mdd_peer_click">
                  {body}
                </button>
              ) : (
                <div className="v2-dd-col" aria-current={it.self ? "true" : undefined}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {/* 평균은 막대 위를 가로지르는 점선 하나 — 숫자는 오른쪽 끝에(머리 띠에 다시 적지 않는다). */}
      {avg != null && (
        <div className="v2-dd-avg">
          <span>평균 {fmtPct(avg)}</span>
        </div>
      )}
    </div>
  );
}

/* ── 업종 안에서 ─────────────────────────────────────────────────── */
/** 같은 테마 대표 종목들의 지금 낙폭(각자 고점 대비) — 깊은 순 한 줄. 옛 sheets.tsx Theme(가로 막대 두 단)를 바꿨다. */
export function ThemeModule({ theme, onPick }: { theme: ThemeCmp; onPick: (s: StockOption) => void }) {
  const self = theme.peers.find((p) => p.isSelf);
  const rank = self ? theme.peers.filter((p) => p.dd < self.dd).length + 1 : null;
  return (
    <Module title={`${theme.name} 대표 ${theme.peers.length}종목 안에서`} meta={rank ? `깊게 빠진 순 ${rank}위` : undefined} className="v2-md-theme">
      <DdColumns
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

/* ── 많이 빠진 대형주 ────────────────────────────────────────────── */
/**
 * 시총 상위 스무 종목 중 지금 고점에서 가장 많이 내려온 열 개(page.tsx loadBigDrops) — 처음 온 사람의 입구(판정표 8).
 * 고른 종목의 시장 쪽(국장 · 미장)을 보이고, 기간은 화면 기간을 따른다('전체'는 받는 일봉이 10년치라 10년).
 * 값은 /api/mdd 와 같은 창 · 같은 종가로 낸 것이라 눌러 연 종목의 '지금 낙폭'과 같다.
 */
export function BigDropsModule({ bigDrops, data, onPick }: { bigDrops: BigDrops | undefined; data: MddResult; onPick: (s: StockOption) => void }) {
  const isUs = data.market === "US";
  const key = (data.years === "all" ? "10" : data.years) as "1" | "3" | "5" | "10";
  const list = bigDrops ? (isUs ? bigDrops.us : bigDrops.kr) : null;
  const rows = (list ?? [])
    .flatMap((b) => (b.dd[key] ? [{ ...b, d: b.dd[key]! }] : []))
    .sort((x, y) => x.d.dd - y.d.dd)
    .slice(0, BIG_DROP_SHOW);
  return (
    // 머리의 종목 수는 실제로 받은 수다 — 시세가 빈 종목이 빠지면 스물이 아니다.
    <Module title="많이 빠진 대형주" meta={`${isUs ? "미장" : "국장"} 시총 상위 ${list?.length ?? 0}종목 중 · 최근 ${key}년 고점 대비`} className="v2-md-big">
      {rows.length ? (
        <DdColumns
          label="많이 빠진 대형주 지금 낙폭"
          items={rows.map((r) => ({
            key: r.code,
            name: r.name,
            dd: r.d.dd,
            self: r.code === data.code,
            pick: { code: r.code, name: r.name, market: r.market },
          }))}
          onPick={onPick}
        />
      ) : (
        <p className="v2-empty">대형주 시세를 지금 불러오지 못했습니다.</p>
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
 * 사건마다 한 줄 — 구간 · 깊이 · 같은 기간 시장 · 빠진 기간 · 되찾은 기간 · 유형. 깊은 순(lib/mdd.ts topDrawdowns).
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
          {a.topDrawdowns.map((e) => (
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
 * 지금만큼(또는 더) 빠졌던 하락이 고점을 되찾기까지 걸린 기간 — 중앙값 · 최단~최장 · 그중 몇 번 되찾았나.
 * 아래 두 줄은 빠진 속도별(급락형 · 완만형) 회복 중앙값이고 지금 하락이 어느 쪽인지 꼬리표를 단다(옛 '이 하락의 성격').
 */
export function RecoveryModule({ a }: { a: MddAnalysis }) {
  const r = a.recovery!;
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
    <Module title="회복까지" meta={`이만큼 빠졌던 ${r.similarCount}번 중 ${r.recoveredCount}번 되찾음`} className="v2-md-rec">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          {r.recoveredCount > 0 ? (
            <>
              <b>{fmtDur(r.medianDays!)}</b>
              <span className="v2-reason">중앙값</span>
            </>
          ) : (
            <>
              <b className="is-down">{fmtDayCount(sincePeak)}째</b>
              <span className="v2-reason">되찾은 전례 없음</span>
            </>
          )}
        </span>
        {hasRange && <RecoveryRange min={r.minDays!} median={r.medianDays!} max={r.maxDays!} />}
        {kinds.some(([, , k]) => k) && (
          <div className="v2-md-kinds">
            {kinds.map(([key, label, k]) => (
              <div key={key} className={`v2-md-kind${ch!.currentClass === key ? " is-now" : ""}`}>
                <span className="v2-md-kind-name">
                  {label}
                  {ch!.currentClass === key && <span className="v2-badge">지금</span>}
                </span>
                <span className="v2-md-kind-n">{k ? `${k.count}번` : "없음"}</span>
                <span className="v2-md-kind-v">{k ? fmtDur(k.medianRecovery) : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Module>
  );
}

/* ── 해마다 ─────────────────────────────────────────────────────── */
/**
 * 조회 기간의 해마다 주가 수익(전해 마지막 종가 대비)과 그 해 안의 최대 낙폭. 머리 숫자는 복리 연평균(CAGR · 배당 제외)이다.
 * ⚠️ 해는 조회 기간만큼 자른다 — yearlyStats 는 거래일 20일 넘는 해를 다 세서 10년 조회에 11개가 나온다(옛 RiskProfile 과 같다).
 *
 * 칸마다 수익 막대(0 을 가운데 두고 오르면 위 · 빠지면 아래, 이 칸들 중 가장 큰 값에 맞춘다). 넓은 칸(2fr)으로 옮기며
 * 연도 칸이 한 줄에 들자 옆 '시장 탓' 칸보다 키가 낮아졌다 — 남는 높이는 막대가 받는다(빈 줄을 만들지 않는다).
 * 줄 나눔은 칸 수에 맞춰 고르게(--yr-cols 한 줄 11칸까지 · 폰 --yr-cols-sm 4칸까지) — auto-fit 은 10 + 2 처럼 끝줄에 두 칸만 남겼다.
 */
export function YearsModule({ r, periodLabel }: { r: RiskProfileData; periodLabel: string }) {
  const yrs = Math.max(1, Math.round(r.years));
  const years = r.yearly.slice(-yrs);
  const avgMdd = years.length ? years.reduce((s, y) => s + y.mdd, 0) / years.length : 0;
  const maxRet = Math.max(1, ...years.map((y) => Math.abs(y.ret)));
  const cells = years.length + 1; // 머리 칸 하나
  const balance = (max: number) => Math.ceil(cells / Math.ceil(cells / max));
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
        <div className="v2-md-yrs" style={{ ["--yr-cols" as string]: balance(11), ["--yr-cols-sm" as string]: balance(4) }}>
          <div className="v2-md-yr is-head" aria-hidden="true">
            <span>연도</span>
            <span>수익</span>
            <span className="v2-md-yr-bar" />
            <span>낙폭</span>
          </div>
          {years.map((y) => (
            <div key={y.year} className="v2-md-yr">
              <span>{y.year}</span>
              <span className={`is-num${tone(y.ret)}`}>{pctCell(y.ret)}</span>
              <span className="v2-md-yr-bar" aria-hidden="true">
                <i className={y.ret >= 0 ? "is-up" : "is-down"} style={{ ["--h" as string]: `${(Math.abs(y.ret) / maxRet) * 50}%` }} />
              </span>
              <span className="is-num is-low">{pctCell(y.mdd)}</span>
            </div>
          ))}
        </div>
      </div>
    </Module>
  );
}

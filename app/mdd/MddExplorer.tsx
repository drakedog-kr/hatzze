"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DrawdownCharacter, DrawdownPoint, Episode, MddAnalysis, RiskProfile as RiskProfileData } from "@/lib/mdd";
import { C, Icon, MONO } from "../ui";

export type StockOption = { code: string; name: string; market: string | null };

type Peer = { name: string; code: string; dd: number; isSelf: boolean };
type ThemeCmp = { name: string; peers: Peer[]; avgDd: number; sincePeakAvg: number | null };
type Attribution = { sincePeakDays: number; stock: number; market: number | null; theme: number | null };
type MddResult = {
  ok: true;
  code: string;
  name: string;
  market: string | null;
  years: string;
  analysis: MddAnalysis;
  attribution: Attribution | null;
  theme: ThemeCmp | null;
  risk: RiskProfileData | null;
};

const PERIODS: { key: string; label: string }[] = [
  { key: "1", label: "1년" },
  { key: "3", label: "3년" },
  { key: "5", label: "5년" },
  { key: "10", label: "10년" },
  { key: "all", label: "전체" },
];

const DEFAULT: StockOption = { code: "005930", name: "삼성전자", market: "KOSPI" };

const fmtPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
const fmtWon = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
/** 기간을 사람 단위로 짧게. 카드 안 큰 숫자는 이 형식으로 통일한다(1,733일 → 4.7년). */
const fmtDur = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)}년` : d >= 45 ? `${Math.round(d / 30)}개월` : `${Math.round(d)}일`);
const fmtDayCount = (d: number) => `${Math.round(d).toLocaleString("ko-KR")}일`;

export function MddExplorer({ stocks, initial }: { stocks: StockOption[]; initial?: StockOption | null }) {
  // initial 은 URL(?code=…)로 지정된 종목. 없으면 기본 종목(삼성전자)으로 연다.
  const [selected, setSelected] = useState<StockOption>(initial ?? DEFAULT);
  const [years, setYears] = useState("10");
  const [data, setData] = useState<MddResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // 조회는 외부 시스템(야후) 동기화라 effect 가 맞다. setState 를 effect 본문에
    // 직접 부르지 않고 이 async 함수 안에서만 호출한다(cascading-render 린트 회피).
    const run = async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        code: selected.code,
        market: selected.market ?? "KOSPI",
        name: selected.name,
        years,
      });
      try {
        const res = await fetch(`/api/mdd?${params}`);
        const json = await res.json();
        if (!active) return;
        if (json.ok) setData(json as MddResult);
        else setError(json.error ?? "불러오지 못했습니다.");
      } catch {
        if (active) setError("네트워크 오류로 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [selected, years]);

  // 폭·헤더 모양을 시장 브리핑·카더라와 맞춘다(둘 다 maxWidth 1180 + 제목 옆 가로줄).
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.ink }}>MDD 정밀분석</h1>
          <div style={{ height: 1, flex: 1, background: C.line }} />
        </div>
        <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 14, lineHeight: 1.6 }}>
          종목이 고점에서 <b style={{ color: C.ink }}>얼마나 빠졌는지</b>, 이만큼 빠진 적이 <b style={{ color: C.ink }}>얼마나 드문지</b>, 과거엔 회복까지 <b style={{ color: C.ink }}>얼마나 걸렸는지</b>를 봅니다.
        </p>
      </header>

      <Controls stocks={stocks} selected={selected} onSelect={setSelected} years={years} onYears={setYears} />

      {loading && <Skeleton />}
      {!loading && error && <ErrorCard message={error} />}
      {!loading && !error && data && <Results data={data} />}

      {/* 면책("재미·참고용이며 매수·매도 신호가 아닙니다")은 푸터가 전역으로 이미 말하므로 빼고,
          여기선 이 페이지에만 해당하는 데이터 기준만 밝힌다. */}
      <p style={{ margin: 0, color: C.muted, fontSize: 12, lineHeight: 1.7 }}>
        모든 수치는 <b style={{ color: C.sub }}>종가</b> 기준이며 액면분할·감자를 반영한 수정주가입니다. 시세 출처는 Yahoo Finance이고,
        표본이 한 사이클 남짓이라 회복 기간은 <b style={{ color: C.sub }}>범위</b>로만 참고하십시오.
      </p>
    </div>
  );
}

/* ── 조회 바: 종목 검색 + 기간 토글 ─────────────────────────────── */
function Controls({
  stocks,
  selected,
  onSelect,
  years,
  onYears,
}: {
  stocks: StockOption[];
  selected: StockOption;
  onSelect: (s: StockOption) => void;
  years: string;
  onYears: (y: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stocks
      .filter((s) => s.name.toLowerCase().includes(q) || s.code.startsWith(q))
      .slice(0, 8);
  }, [query, stocks]);

  const pick = (s: StockOption) => {
    onSelect(s);
    setQuery("");
    setOpen(false);
  };

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div ref={boxRef} style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
        {/* 포커스 때 파란 테두리 + 옅은 링 — 입력 중임을 분명히 한다. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: C.card,
            border: `1px solid ${focused ? C.blue : C.line}`,
            boxShadow: focused ? `0 0 0 3px var(--c-blue-tint)` : "none",
            borderRadius: 12,
            padding: "0 14px",
            height: 44,
            transition: "border-color .15s, box-shadow .15s",
          }}
        >
          <Icon name="search" style={{ fontSize: 20, color: focused ? C.blue : C.sub }} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setFocused(true);
            }}
            onBlur={() => setFocused(false)}
            placeholder={`${selected.name} · 다른 종목 검색`}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: C.ink, fontSize: 15, minWidth: 0 }}
          />
        </div>
        {open && matches.length > 0 && (
          <ul style={{ position: "absolute", top: 50, left: 0, right: 0, zIndex: 20, listStyle: "none", margin: 0, padding: 6, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: `0 8px 24px ${C.shadow}` }}>
            {matches.map((s) => (
              <li key={s.code}>
                <button
                  onClick={() => pick(s)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 10px", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: C.ink, fontSize: 14, textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>{s.code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 기간 토글 — 낱개 알약 5개 대신 하나의 세그먼티드 컨트롤로 묶는다(한 덩어리로 읽힘). */}
      <div style={{ display: "flex", gap: 2, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 999, padding: 3 }}>
        {PERIODS.map((p) => {
          const on = p.key === years;
          return (
            <button
              key={p.key}
              onClick={() => onYears(p.key)}
              aria-pressed={on}
              style={{
                padding: "7px 15px",
                borderRadius: 999,
                border: "none",
                background: on ? C.card : "transparent",
                boxShadow: on ? `0 1px 3px ${C.shadow}` : "none",
                color: on ? C.blue : C.sub,
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "background .15s, color .15s",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 결과 ─────────────────────────────────────────────────────── */
function Results({ data }: { data: MddResult }) {
  const a = data.analysis;
  // 2열 배치: 헤드라인·리스크 프로필·테마는 full(넓어야 함), 나머지 컴팩트 카드는 둘씩.
  // 진단 페어[원인|성격] → 이력 페어[회복|Top5] 순으로 자연히 채워진다.
  return (
    <div className="mdd-grid">
      <div className="mdd-full">
        <Headline data={data} />
      </div>
      {data.risk && (
        <div className="mdd-full">
          <RiskProfile r={data.risk} />
        </div>
      )}
      {data.attribution && (
        <Attribution
          attr={data.attribution}
          themeName={data.theme?.name ?? null}
          themePeers={data.theme?.peers.filter((p) => !p.isSelf).map((p) => p.name) ?? []}
          athDate={a.athDate}
        />
      )}
      {a.character && <Character ch={a.character} />}
      {a.recovery && <Recovery a={a} />}
      {a.topDrawdowns.length > 0 && <TopDrawdowns eps={a.topDrawdowns} />}
      {data.theme && (
        <div className="mdd-full">
          <Theme theme={data.theme} />
        </div>
      )}
    </div>
  );
}

/* ── 공통 프리미티브 ───────────────────────────────────────────────
   카드마다 제각각이던 머리·타일·막대를 셋으로 통일한다. 페이지 전체가 같은
   리듬(파란 아이콘 → 제목 → 한 줄 설명 → 데이터)으로 읽히게 하는 게 목적이다. */

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, minWidth: 0 };

/** 카드 머리 — 시장 브리핑(TitleRow)·카더라(SectionHead)와 같은 구조. 아이콘은 파랑 고정. */
function CardHead({ icon, title, sub, right }: { icon: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.ink, display: "flex", alignItems: "center", gap: 10, lineHeight: 1.25 }}>
          <Icon name={icon} style={{ fontSize: 22, color: C.blue, flexShrink: 0 }} />
          <span style={{ wordBreak: "keep-all" }}>{title}</span>
        </h2>
        {sub && <p style={{ margin: "7px 0 0", fontSize: 12.5, color: C.sub, lineHeight: 1.55, wordBreak: "keep-all" }}>{sub}</p>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "blue" | "warn" }) {
  const bg = tone === "blue" ? "var(--c-blue-tint)" : tone === "warn" ? "var(--c-mania-tint, rgba(220,80,80,.12))" : C.bg;
  const fg = tone === "blue" ? C.blue : tone === "warn" ? C.mania : C.sub;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** 값 타일 — 라벨 / 큰 숫자 / 보조. 회복·성격 카드가 공유한다. */
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ink" | "cold" | "mania" | "blue" }) {
  const color = tone === "cold" ? C.cold : tone === "mania" ? C.mania : tone === "blue" ? C.blue : C.ink;
  return (
    <div style={{ background: C.bg, borderRadius: 12, padding: "13px 15px", minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** 이름 | 막대 | 값 한 줄. 원인 분해·테마 비교가 공유한다. */
function BarRow({
  label,
  pct,
  value,
  color,
  strong,
  help,
  labelWidth = 112,
}: {
  label: string;
  pct: number;
  value: string;
  color: string;
  strong?: boolean;
  help?: string;
  labelWidth?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${labelWidth}px minmax(0,1fr) 58px`, alignItems: "center", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: strong ? C.ink : C.sub, fontWeight: strong ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {help && (
          <span className="hz-tip hz-tip-wide" data-tip={help} style={{ flexShrink: 0, display: "inline-flex", cursor: "help", color: C.faint }}>
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        )}
      </span>
      <span style={{ height: 9, background: C.bg, borderRadius: 999, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: color, opacity: strong ? 1 : 0.5, borderRadius: 999 }} />
      </span>
      <span style={{ fontFamily: MONO, fontSize: 13, textAlign: "right", color: strong ? C.ink : C.sub, fontWeight: strong ? 800 : 500 }}>{value}</span>
    </div>
  );
}

/* ── 헤드라인 ─────────────────────────────────────────────────── */
function Headline({ data }: { data: MddResult }) {
  const a = data.analysis;
  const atHigh = a.currentDd > -1;
  const approxYears = (Date.parse(a.asOf) - Date.parse(a.firstDate)) / (365 * 86_400_000);
  const requested = data.years === "all" ? Infinity : Number(data.years);
  // 요청한 기간보다 상장 이력이 짧으면 "최근 10년"은 거짓이 된다 — 실제 구간으로 바꾼다.
  const truncated = data.years !== "all" && approxYears < requested - 0.5;
  const periodLabel =
    data.years === "all" || truncated ? `상장 이후·약 ${Math.max(1, Math.round(approxYears))}년` : `최근 ${data.years}년`;

  // 정직성 경고 — 겹쳐 쌓지 않고 필요한 것만.
  const cautions: string[] = [];
  if (data.years === "all")
    cautions.push("전체 구간에는 합병·감자·액면병합이 섞여 있어, 아주 오래된 낙폭은 지금의 회사와 다를 수 있습니다.");
  else if (truncated) cautions.push(`상장한 지 약 ${Math.round(approxYears)}년이라 요청한 기간보다 데이터가 짧습니다.`);
  if (approxYears < 2) cautions.push("표본이 짧아 더 오래된 종목과 같은 무게로 보지 마십시오.");

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 21, fontWeight: 800, color: C.ink }}>{data.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 13, color: C.faint }}>{data.code}</span>
          {data.market && <Badge>{data.market}</Badge>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="blue">{periodLabel}</Badge>
          <Badge>{a.asOf} 종가</Badge>
        </div>
      </div>

      {/* 히어로 — 지금 낙폭을 가장 크게, 그 옆에 '얼마나 드문지'를 한 문장으로. */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 7 }}>고점 대비</div>
          <span style={{ fontFamily: MONO, fontSize: 54, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.035em", color: atHigh ? C.ink : C.cold }}>
            {atHigh ? "신고가 부근" : fmtPct(a.currentDd)}
          </span>
        </div>
        {!atHigh && (
          <p style={{ margin: "0 0 6px", fontSize: 14.5, color: C.sub, lineHeight: 1.6, maxWidth: 340 }}>
            {periodLabel} 중 이보다 깊었던 날은 <b style={{ color: C.ink }}>{Math.round(a.deeperThanNowPct)}%</b>뿐입니다
          </p>
        )}
      </div>

      {/* 현재가·최고가를 라벨 붙은 두 칸으로 — 예전 회색 한 줄보다 기준이 분명하다. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        <Stat label="현재가" value={fmtWon(a.price)} sub={`${a.asOf} 종가`} />
        <Stat label={`${periodLabel} 최고가`} value={fmtWon(a.ath)} sub={a.athDate} />
        <Stat label="기간 최저점" value={fmtPct(a.mdd)} sub={a.mddDate} tone="cold" />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sub }}>고점 대비 낙폭 추이</span>
        <span style={{ fontSize: 11.5, color: C.muted }}>0%에 가까울수록 고점 부근</span>
      </div>
      <Underwater series={a.underwater} mdd={a.mdd} />

      {cautions.map((c, i) => (
        <p key={i} style={{ margin: `${i === 0 ? 16 : 6}px 0 0`, fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
          <Icon name="info" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} />
          {c}
        </p>
      ))}
    </section>
  );
}

/* 고점 대비 낙폭 곡선(언더워터). dd 는 0 이하이고 아래로 갈수록 깊다. */
function Underwater({ series, mdd }: { series: DrawdownPoint[]; mdd: number }) {
  const W = 720;
  const H = 176;
  // 왼쪽 여백 — y축 라벨(0%·−23%·−45%)을 이 안에 두어 곡선과 겹치지 않게 한다.
  // 예전엔 라벨을 플롯 안(x=3)에 그려 0% 가 곡선과 겹쳐 읽기 어려웠다.
  //
  // 폭은 '라벨 최대 폭(4글자 −99% 기준 실측 27.8) + 라벨↔플롯 간격 8' 로 잡는다.
  // 이러면 가장 넓은 라벨의 왼쪽 끝이 x≈0 에 딱 붙어, 오른쪽(플롯이 x=W 까지라 여백 0)과
  // 좌우 여백이 같아진다. 예전 48 은 왼쪽만 12 units 남아 오른쪽보다 넓어 보였다.
  const LABEL_GAP = 8;
  const PAD_L = 36;
  const floor = Math.min(mdd, -1); // 0 나눗셈·완전 평평 방지
  const n = series.length;
  const x = (i: number) => (n <= 1 ? PAD_L : PAD_L + (i / (n - 1)) * (W - PAD_L));
  const y = (dd: number) => (dd / floor) * H;

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.dd).toFixed(1)}`).join(" ");
  const area = `${line} L${W},0 Z`;

  // 연도 경계(1월로 처음 넘어가는 지점)를 눈금으로. 첫 데이터 지점은 연중(예: 2016-07)에
  // 시작해 완전한 연도가 아니고, x=0 이라 라벨이 왼쪽으로 잘린다("2016"→"16"). 그래서
  // i=0 은 건너뛰고 실제 1월 경계부터만 찍는다.
  const yearMarks: { x: number; year: number }[] = [];
  for (let i = 1; i < n; i++) {
    const yr = Number(series[i].date.slice(0, 4));
    if (Number(series[i - 1].date.slice(0, 4)) !== yr) yearMarks.push({ x: x(i), year: yr });
  }
  // 기간이 길면(전체 = 27년 등) 해마다 찍을 때 라벨이 서로 겹쳐 붙어 버린다
  // ("2001200220032004…"). 들어갈 수 있는 라벨 수를 세어 1·2·5·10년 중 가장 촘촘한
  // 간격을 고르고, 그 배수 해에만 라벨을 둔다(2005·2010·2015… 처럼 떨어지는 해로).
  const LABEL_SLOT = 68; // 라벨 하나가 차지할 최소 폭(연도 라벨 실측 ~28 + 여유)
  const maxLabels = Math.max(2, Math.floor((W - PAD_L) / LABEL_SLOT));
  let yearStep = 1;
  for (const s of [1, 2, 5, 10]) {
    yearStep = s;
    if (yearMarks.filter((t) => t.year % s === 0).length <= maxLabels) break;
  }
  const ticks = yearMarks.filter((t) => t.year % yearStep === 0);
  // 그리드 라인(0/절반/바닥) 라벨.
  const rows = [0, floor / 2, floor];
  // 기간 최저점 — 곡선에서 가장 깊은 지점에 표시를 남긴다.
  let ti = 0;
  for (let i = 1; i < n; i++) if (series[i].dd < series[ti].dd) ti = i;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 -6 ${W} ${H + 26}`} width="100%" role="img" aria-label={`고점 대비 낙폭 곡선. 현재 ${fmtPct(series[n - 1].dd)}, 기간 최저 ${fmtPct(mdd)}`}>
        <line x1={PAD_L} y1="0" x2={W} y2="0" stroke={C.line} strokeWidth="1" />
        {rows.slice(1).map((dd, i) => (
          <line key={i} x1={PAD_L} y1={y(dd)} x2={W} y2={y(dd)} stroke={C.line} strokeWidth="1" strokeDasharray="2 5" />
        ))}
        <path d={area} fill={C.cold} fillOpacity="0.14" />
        <path d={line} fill="none" stroke={C.cold} strokeWidth="1.6" strokeLinejoin="round" />
        {/* 최저점 — 속 빈 점으로 현재 점(속 찬 점)과 구분한다. */}
        <circle cx={x(ti)} cy={y(series[ti].dd)} r="3.5" fill={C.card} stroke={C.cold} strokeWidth="1.6" />
        <circle cx={W} cy={y(series[n - 1].dd)} r="4.5" fill={C.cold} stroke={C.card} strokeWidth="2" />
        {rows.map((dd, i) => (
          <text key={i} x={PAD_L - LABEL_GAP} y={y(dd) + 4} fontSize="11" fill={C.faint} textAnchor="end">
            {Math.round(dd)}%
          </text>
        ))}
        {ticks.map((t, i) => (
          <text key={i} x={t.x} y={H + 16} fontSize="11" fill={C.faint} textAnchor="middle">
            {t.year}
          </text>
        ))}
      </svg>
      {/* 시장 브리핑 지표 카드와 같은 크로스헤어 — 보이지 않는 세로 띠가 hover 시 기준선(hz-vline)과
          툴팁(hz-tip)을 낸다. 연도 라벨 높이(≈26px)만큼 아래로 남는 띠는 무시할 수준이다. */}
      <div style={{ position: "absolute", top: 0, left: `${(PAD_L / W) * 100}%`, right: 0, bottom: 26, display: "flex" }}>
        {series.map((p, i) => {
          // 툴팁이 넓어서(날짜·가격·낙폭, nowrap) 가운데 정렬이면 양 끝 지점에서 컨테이너를
          // 벗어난다 — 오른쪽으로 벗어나면 페이지에 가로 스크롤까지 생긴다. 끝쪽 15%는
          // 안쪽으로 열리게 방향을 튼다.
          const at = n <= 1 ? 0 : i / (n - 1);
          const edge = at < 0.15 ? " hz-tip-start" : at > 0.85 ? " hz-tip-end" : "";
          return (
            <div
              key={i}
              className={`hz-tip hz-vline${edge}`}
              data-tip={`${p.date} · ${fmtWon(p.close)} · 고점 대비 ${fmtPct(p.dd)}`}
              style={{ flex: 1, position: "relative" }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── 리스크 프로필 ─────────────────────────────────────────────────
   세 타일이 완전히 같은 문법을 쓴다: [범례] → [연도 + 막대 2줄 + 값 2개] × 최대 4줄 →
   [요약 한 줄]. 타일마다 구조가 다르면 종목을 바꿀 때마다 길이가 들쭉날쭉해진다. */
const RISK_ROWS = 4; // 모든 타일이 쓰는 고정 줄 수

function RiskProfile({ r }: { r: RiskProfileData }) {
  const yrs = Math.max(1, Math.round(r.years));
  const alone = r.withMarket === null ? 0 : r.bigDropCount - r.withMarket;
  const yearly = r.yearly.slice(-RISK_ROWS);
  const events = r.events.slice(-RISK_ROWS);

  const legend = (items: { label: string; color: string; opacity?: number }[]) => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.sub }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color, opacity: it.opacity ?? 1 }} />
          {it.label}
        </span>
      ))}
    </div>
  );

  /** 한 줄 = [연도] [막대+값] [막대+값]. 세 타일이 이 한 가지 줄만 쓴다. */
  const row = (
    key: string | number,
    year: number,
    a: { pct: number; color: string; opacity: number; value: string },
    b: { pct: number; color: string; opacity: number; value: string },
  ) => (
    <div key={key} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{`'${String(year).slice(2)}`}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[a, b].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ display: "block", flex: 1 }}>
              <span style={{ display: "block", height: 6, width: `${Math.max(2, Math.min(100, s.pct))}%`, background: s.color, opacity: s.opacity, borderRadius: 999 }} />
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.sub, width: 42, textAlign: "right" }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const empty = (text: string) => <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{text}</p>;
  const rows = (children: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
  );
  const summary = (text: string) => (
    <p style={{ margin: "12px 0 0", fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{text}</p>
  );

  /* 1 — 낙폭 대비 보상: 해마다 '그 해 수익'과 '그 해 최악 낙폭'. */
  const tile1 =
    yearly.length === 0 ? (
      empty("연도별 표본이 부족합니다.")
    ) : (
      <>
        {legend([
          { label: "그 해 수익", color: C.mania },
          { label: "그 해 최악 낙폭", color: C.cold, opacity: 0.45 },
        ])}
        {rows(
          (() => {
            const max = Math.max(...yearly.flatMap((y) => [Math.abs(y.ret), Math.abs(y.mdd)]), 1);
            return yearly.map((y) =>
              row(
                y.year,
                y.year,
                { pct: (Math.abs(y.ret) / max) * 100, color: y.ret >= 0 ? C.mania : C.cold, opacity: 1, value: `${y.ret >= 0 ? "+" : "−"}${Math.abs(Math.round(y.ret))}%` },
                { pct: (Math.abs(y.mdd) / max) * 100, color: C.cold, opacity: 0.45, value: `${Math.round(y.mdd)}%` },
              ),
            );
          })(),
        )}
        {summary(`최근 ${yrs}년 연 ${fmtPct(r.annualReturn)} · 최악 ${fmtPct(r.mdd)}`)}
      </>
    );

  /* 2 — 하락 vs 회복 속도: 큰 하락마다 '빠지는 데'와 '되돌아오는 데'. */
  const tile2 =
    events.length === 0 ? (
      empty("큰 하락 표본이 얇습니다.")
    ) : (
      <>
        {legend([
          { label: "빠지는 데", color: C.cold },
          { label: "되돌아오는 데", color: C.cold, opacity: 0.4 },
        ])}
        {rows(
          (() => {
            const max = Math.max(...events.map((e) => Math.max(e.dropDays, e.recoverDays ?? 0)), 1);
            return events.map((e, i) =>
              row(
                i,
                e.year,
                { pct: (e.dropDays / max) * 100, color: C.cold, opacity: 1, value: fmtDur(e.dropDays) },
                {
                  pct: e.recoverDays === null ? 0 : (e.recoverDays / max) * 100,
                  color: C.cold,
                  opacity: 0.4,
                  value: e.recoverDays === null ? "미회복" : fmtDur(e.recoverDays),
                },
              ),
            );
          })(),
        )}
        {summary(
          r.dropDaysMedian !== null && r.recoverDaysMedian !== null
            ? `보통 ${fmtDur(r.dropDaysMedian)} 빠지고 ${fmtDur(r.recoverDaysMedian)} 만에 되돌아왔습니다`
            : "되찾은 큰 하락 표본이 얇습니다",
        )}
      </>
    );

  /* 3 — 혼자 빠지나, 같이 빠지나: 큰 하락마다 이 종목과 코스피의 낙폭. */
  const tile3 =
    events.length === 0 ? (
      empty("큰 하락이 없었습니다.")
    ) : !events.some((e) => e.market !== null) ? (
      empty("코스피 데이터가 없습니다.")
    ) : (
      <>
        {legend([
          { label: "이 종목", color: C.cold },
          { label: "코스피", color: C.track },
        ])}
        {rows(
          (() => {
            const max = Math.max(...events.flatMap((e) => [Math.abs(e.stock), e.market !== null ? Math.abs(e.market) : 0]), 1);
            return events.map((e, i) =>
              row(
                i,
                e.year,
                { pct: (Math.abs(e.stock) / max) * 100, color: C.cold, opacity: 1, value: `${Math.round(e.stock)}%` },
                {
                  pct: e.market === null ? 0 : (Math.abs(e.market) / max) * 100,
                  color: C.track,
                  opacity: 1,
                  value: e.market === null ? "—" : `${Math.round(e.market)}%`,
                },
              ),
            );
          })(),
        )}
        {summary(
          r.withMarket === null
            ? "코스피 데이터가 없습니다"
            : alone > 0
              ? `${r.bigDropCount}번 중 ${alone}번은 이 종목만 빠졌습니다`
              : "큰 하락 때마다 코스피도 함께 빠졌습니다",
        )}
      </>
    );

  const tiles: { icon: string; label: string; sub: string; viz: React.ReactNode }[] = [
    { icon: "trending_up", label: "낙폭 대비 보상", sub: "감수한 위험에 비해 얼마나 벌었나", viz: tile1 },
    { icon: "speed", label: "하락 vs 회복 속도", sub: "빠질 때와 되돌아올 때, 어느 쪽이 오래 걸리나", viz: tile2 },
    { icon: "sync", label: "혼자 빠지나, 같이 빠지나", sub: "큰 하락 때 코스피도 같이 빠졌나", viz: tile3 },
  ];

  return (
    <section style={card}>
      <CardHead
        icon="insights"
        title="리스크 프로필"
        sub="이 종목을 들고 있으면 어떤 위험을 감수하게 되는지, 세 가지 각도로 봅니다."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "stretch" }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: C.bg, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--c-blue-tint)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={t.icon} style={{ fontSize: 17, color: C.blue }} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.3, wordBreak: "keep-all" }}>{t.label}</span>
                <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, wordBreak: "keep-all" }}>{t.sub}</span>
              </div>
            </div>
            {/* 줄 수가 적은 타일도 같은 높이를 유지하도록 최소 높이를 준다(4줄 기준).
                요약 문장은 항상 타일 맨 아래에 붙는다. */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 138 }}>
              <div style={{ flex: 1 }}>{t.viz}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: "16px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.6 }}>
        <Icon name="info" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} />
        보상은 조회 기간(최근 {yrs}년)에 따라 달라지니 절대 수치보다 성격으로 보십시오. 큰 하락·속도는 고점 대비 −20% 이상 하락 기준이고, 최근 {RISK_ROWS}건까지만 보여줍니다.
      </p>
    </section>
  );
}

/* ── 원인 분해 ─────────────────────────────────────────────────── */
function Attribution({
  attr,
  themeName,
  themePeers,
  athDate,
}: {
  attr: Attribution;
  themeName: string | null;
  themePeers: string[];
  athDate: string;
}) {
  const rows: { label: string; v: number; self: boolean; help?: string }[] = [{ label: "이 종목", v: attr.stock, self: true }];
  if (attr.market !== null) rows.push({ label: "코스피", v: attr.market, self: false });
  if (attr.theme !== null)
    rows.push({
      label: `${themeName ?? "테마"} 대표`,
      v: attr.theme,
      self: false,
      // "○○ 대표"가 어떤 종목인지 툴팁으로 밝힌다 — 이 종목은 뺀 나머지 대표 종목 평균이다.
      help: themePeers.length ? `${themePeers.join(" · ")}. 이 테마 대표 종목의 평균입니다 (이 종목 제외).` : undefined,
    });
  const worst = Math.max(...rows.map((r) => Math.abs(r.v)), 1);

  // 판단 기준은 시장(없으면 테마). 종목이 기준보다 얼마나 더/덜 빠졌나.
  const bench = attr.market ?? attr.theme;
  const gap = bench !== null ? attr.stock - bench : 0;
  const verdict =
    bench === null
      ? "같은 기간 종목의 낙폭입니다."
      : gap >= 8
        ? "시장이 빠지는 와중에 상대적으로 버틴 편입니다."
        : gap <= -8
          ? "시장·업종보다 더 깊게 빠졌습니다. 종목 고유 요인이 있는지 볼 대목입니다."
          : "거의 시장을 따라 움직였습니다. 이 하락의 대부분은 시장 전체가 함께 빠진 것입니다.";

  return (
    <section style={card}>
      <CardHead
        icon="call_split"
        title="이 하락, 시장 탓일까 종목 탓일까"
        sub={`고점(${athDate}) 이후 ${attr.sincePeakDays.toLocaleString("ko-KR")}일, 같은 기간을 나란히 놓고 비교합니다.`}
      />
      <p style={{ margin: "0 0 16px", color: C.ink, fontSize: 15, fontWeight: 700, lineHeight: 1.6, wordBreak: "keep-all" }}>{verdict}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map((r) => (
          // 고점 이후 수익률이라 시장·테마는 상승(+)일 수도 있다 — 부호로 색을 가른다
          // (하락=파랑, 상승=빨강, 티커와 같은 한국장 관례). 자기 종목만 진하게.
          <BarRow
            key={r.label}
            label={r.label}
            pct={(Math.abs(r.v) / worst) * 100}
            value={fmtPct(r.v)}
            color={r.v >= 0 ? C.mania : C.cold}
            strong={r.self}
            help={r.help}
          />
        ))}
      </div>
    </section>
  );
}

/* ── 회복까지 걸린 시간 ─────────────────────────────────────────── */
function Recovery({ a }: { a: MddAnalysis }) {
  const r = a.recovery!;

  // 지금 깊이에서 회복한 전례가 없으면(대개 역대 최대 낙폭) 회복 통계를 낼 표본이 없다.
  // "아직 회복 못 함 1건" 타일 하나만 덩그러니 두는 대신, 얼마나 오래 미회복 중인지를 보여준다.
  if (r.recoveredCount === 0) {
    const days = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);
    return (
      <section style={card}>
        <CardHead icon="history" title="회복까지 걸린 시간" sub="과거 이만큼 빠졌을 때 고점을 되찾기까지 걸린 기간입니다." />
        <p style={{ margin: "0 0 16px", color: C.sub, fontSize: 14, lineHeight: 1.7 }}>
          이만큼(<b style={{ color: C.ink }}>{fmtPct(a.currentDd)}</b>) 깊게 빠진 뒤 <b style={{ color: C.ink }}>회복한 전례가 없습니다</b>. 지금이 이 종목의 역대 최대 낙폭입니다.
        </p>
        <Stat label={`고점(${a.athDate}) 이후 지금까지`} value={fmtDur(days)} sub={`${fmtDayCount(days)}째 회복 못 함`} tone="mania" />
      </section>
    );
  }

  const tiles: { label: string; value: string; sub?: string; tone?: "ink" | "mania" }[] = [
    { label: "최단 회복", value: fmtDur(r.minDays!), sub: fmtDayCount(r.minDays!) },
    { label: "중앙값", value: fmtDur(r.medianDays!), sub: fmtDayCount(r.medianDays!) },
    { label: "최장 회복", value: fmtDur(r.maxDays!), sub: fmtDayCount(r.maxDays!) },
  ];
  if (r.unrecoveredCount > 0) tiles.push({ label: "아직 회복 못 함", value: `${r.unrecoveredCount}건`, sub: "진행 중", tone: "mania" });

  return (
    <section style={card}>
      <CardHead
        icon="history"
        title="회복까지 걸린 시간"
        sub={`지금(${fmtPct(a.currentDd)}) 이상 빠졌던 ${r.similarCount}번 중 ${r.recoveredCount}번이 고점을 되찾았습니다.`}
      />
      {/* 2열 고정 그리드 — flex-wrap 이면 한 줄에 3개가 들어가고 남은 하나('아직 회복 못 함')가
          혼자 전체 폭으로 늘어나 어색했다. 4칸이면 2×2, 3칸이면 2+1 로 타일 크기가 일정하다. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {tiles.map((t, i) => (
          <Stat key={i} label={t.label} value={t.value} sub={t.sub} tone={t.tone} />
        ))}
      </div>
    </section>
  );
}

/* ── 이 하락의 성격 ─────────────────────────────────────────────── */
function Character({ ch }: { ch: DrawdownCharacter }) {
  const isFast = ch.currentClass === "fast";
  const curLabel = isFast ? "급락형" : "완만형";
  const hasBuckets = Boolean(ch.fast || ch.slow);
  const compare =
    ch.fast && ch.slow
      ? `과거 하락은 급락형이 완만형보다 회복이 ${ch.fast.medianRecovery < ch.slow.medianRecovery ? "빨랐" : "느렸"}습니다.`
      : null;
  const tiles: { label: string; sub: string; b: { count: number; medianRecovery: number } | null; on: boolean }[] = [
    { label: "급락형", sub: "빠르게 빠진 하락", b: ch.fast, on: isFast },
    { label: "완만형", sub: "오래 흘러내린 하락", b: ch.slow, on: !isFast },
  ];
  return (
    <section style={card}>
      <CardHead
        icon="bolt"
        title="이 하락의 성격"
        sub="같은 깊이라도 빨리 빠진 하락과 오래 흘러내린 하락은 회복 양상이 다릅니다."
        right={<Badge tone="blue">{curLabel}</Badge>}
      />
      <p style={{ margin: "0 0 16px", color: C.sub, fontSize: 14, lineHeight: 1.7, wordBreak: "keep-all" }}>
        지금은 <b style={{ color: C.ink }}>{curLabel}</b>입니다. 고점 이후 <b style={{ color: C.ink }}>{fmtDayCount(ch.currentTroughDays)}</b> 만에 저점({fmtPct(ch.currentTroughDepth)})까지 빠졌습니다.
        {compare && ` ${compare}`}
      </p>
      {hasBuckets ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {tiles.map((t) =>
              t.b ? (
                <div
                  key={t.label}
                  style={{
                    background: t.on ? "var(--c-blue-tint)" : C.bg,
                    border: `1px solid ${t.on ? C.blue : "transparent"}`,
                    borderRadius: 12,
                    padding: "13px 15px",
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.on ? C.blue : C.ink }}>{t.label}</span>
                    <span style={{ fontSize: 11.5, color: C.faint }}>· {t.b.count}번</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 8 }}>{t.sub}</div>
                  <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.15 }}>
                    {fmtDur(t.b.medianRecovery)}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>회복 중앙값</div>
                </div>
              ) : null,
            )}
          </div>
          <p style={{ margin: "12px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.5 }}>과거 −15% 이상 하락을 속도로 나눈 회복 기간입니다.</p>
        </>
      ) : (
        <p style={{ margin: 0, color: C.muted, fontSize: 12, lineHeight: 1.6 }}>
          <Icon name="info" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} />
          이 기간엔 비교할 과거 하락이 부족합니다. 기간을 넓히면 급락형·완만형 회복을 비교할 수 있습니다.
        </p>
      )}
    </section>
  );
}

/* ── 테마 비교 ─────────────────────────────────────────────────── */
function Theme({ theme }: { theme: ThemeCmp }) {
  const worst = Math.max(...theme.peers.map((p) => Math.abs(p.dd)), 1);
  const self = theme.peers.find((p) => p.isSelf)!;
  // 깊게 빠진 순 등수 — dd 가 더 음수(깊음)인 종목 수 +1. 1위 = 가장 깊게 빠짐.
  const rank = theme.peers.filter((p) => p.dd < self.dd).length + 1;
  const lead =
    rank === 1
      ? "테마에서 가장 깊게 빠졌습니다."
      : rank === theme.peers.length
        ? "테마에서 가장 덜 빠졌습니다."
        : `테마 ${theme.peers.length}종목 중 낙폭 ${rank}위입니다.`;
  return (
    <section style={card}>
      <CardHead
        icon="hub"
        title={`${theme.name} 대표 ${theme.peers.length}종목 안에서`}
        sub={`${self.name}. ${lead}`}
        right={<Badge>평균 {fmtPct(theme.avgDd)}</Badge>}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {theme.peers.map((p) => (
          <BarRow
            key={p.code || p.name}
            label={p.name}
            pct={(Math.abs(p.dd) / worst) * 100}
            value={`${Math.round(p.dd)}%`}
            color={p.isSelf ? C.cold : C.track}
            strong={p.isSelf}
            labelWidth={104}
          />
        ))}
      </div>
    </section>
  );
}

/* ── 역대 낙폭 Top 5 ───────────────────────────────────────────── */
function TopDrawdowns({ eps }: { eps: Episode[] }) {
  const worst = Math.max(...eps.map((e) => Math.abs(e.depth)), 1);
  return (
    <section style={card}>
      <CardHead icon="leaderboard" title="역대 낙폭 Top 5" sub="이 기간에 가장 깊었던 하락과, 고점을 되찾기까지 걸린 시간입니다." />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {eps.map((e, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "22px minmax(0,1fr) 54px",
              alignItems: "center",
              gap: 10,
              padding: "9px 0",
              borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
            }}
          >
            <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 13, color: i === 0 ? C.cold : C.faint }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: C.sub }}>{e.peakDate} 고점</span>
                <span style={{ fontSize: 11.5, color: e.recovered ? C.faint : C.mania, fontWeight: e.recovered ? 400 : 700 }}>
                  {e.recovered ? `${fmtDur(e.days)} 만에 회복` : `${fmtDur(e.days)}째 미회복`}
                </span>
              </div>
              <span style={{ display: "block", height: 6, background: C.bg, borderRadius: 999, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(Math.abs(e.depth) / worst) * 100}%`, background: C.cold, opacity: e.recovered ? 0.55 : 1, borderRadius: 999 }} />
              </span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", color: C.cold, textAlign: "right" }}>
              {Math.round(e.depth)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 보조 ─────────────────────────────────────────────────────── */
function Skeleton() {
  // 실제 결과와 같은 골격(헤드라인 + 2열 카드)으로 깜빡여, 로딩 뒤 레이아웃이 튀지 않는다.
  const block = (h: number) => <div className="hz-shimmer" style={{ height: h, borderRadius: 10, background: C.bg }} />;
  return (
    <div className="mdd-grid">
      <div className="mdd-full">
        <section style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
          {block(22)}
          {block(54)}
          {block(176)}
        </section>
      </div>
      {[0, 1].map((i) => (
        <section key={i} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          {block(20)}
          {block(14)}
          {block(96)}
        </section>
      ))}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, color: C.sub, fontSize: 14 }}>
      <Icon name="error_outline" style={{ fontSize: 20, color: C.mania }} />
      {message}
    </div>
  );
}

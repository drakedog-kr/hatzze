"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CHARACTER_MIN_DD, CHARACTER_SPLIT_DAYS } from "@/lib/mdd";
import type { DepthBucket, DrawdownCharacter, Episode, MddAnalysis, RiskProfile as RiskProfileData, YearStat } from "@/lib/mdd";
import { gaSearchTerm, gaStockCode, track } from "@/lib/ga";
import { C, Icon, MONO, R } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { StockLogo } from "../StockLogo";

export type StockOption = { code: string; name: string; market: string | null };
/** 추천 종목 = 종목 + 오른쪽에 붙는 한 조각 근거(왜 지금 이게 떠 있나). */
export type Suggestion = StockOption & { note: string };
export type SuggestGroups = { surging: Suggestion[]; report: Suggestion[] };

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
/**
 * 가격 표기. 시장에 따라 통화가 갈린다.
 *
 * 미국은 소수 둘째 자리까지 쓴다 — 달러는 원과 달리 1달러 미만의 움직임이 뜻을 갖고,
 * 반올림해 정수로 두면 저가주가 전부 같은 값으로 보인다.
 */
const fmtPrice = (n: number, market: string | null | undefined) =>
  market === "US"
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${Math.round(n).toLocaleString("ko-KR")}원`;
/**
 * '시장'의 이름. 낙폭을 무엇과 견주고 있는지는 화면 곳곳에 글자로 나온다 —
 * 엔비디아 낙폭 옆에 "코스피"라고 적혀 있으면 그 문장은 통째로 거짓이 된다.
 * ⚠️ api/mdd 가 고르는 지수(^KS11 / ^GSPC)와 짝이다. 한쪽만 고치지 말 것.
 */
const benchName = (market: string | null | undefined) => (market === "US" ? "S&P500" : "코스피");
/** 시장 이름에 붙는 주격 조사. "코스피는" · "S&P500은"(오백 → ㄱ받침). */
const benchParticle = (market: string | null | undefined) => (market === "US" ? "은" : "는");
/**
 * "같은 기간 코스피는 −30.0%, 반도체 업종은 −35.3% ___" 의 마지막 동사.
 *
 * 예전엔 "빠졌습니다" 고정이었다. 국장은 이 문장이 뜨는 날 대부분 코스피도 같이
 * 빠져 있어 맞았지만, 미장을 들이자 바로 드러났다 — **"S&P500은 +3.4% 빠졌습니다"**.
 * 부호가 섞이는 경우까지 있어 세 갈래로 가른다(둘 다 하락 / 둘 다 상승 / 엇갈림).
 */
function benchVerb(market: number | null, theme: number | null): string {
  const vals = [market, theme].filter((v): v is number => v !== null);
  if (!vals.length) return "움직였습니다";
  if (vals.every((v) => v <= 0)) return "빠졌습니다";
  if (vals.every((v) => v >= 0)) return "올랐습니다";
  return "엇갈렸습니다";
}
/** 기간을 사람 단위로 짧게. 카드 안 큰 숫자는 이 형식으로 통일한다(1,733일 → 4.7년). */
const fmtDur = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)}년` : d >= 45 ? `${Math.round(d / 30)}개월` : `${Math.round(d)}일`);
const fmtDayCount = (d: number) => `${Math.round(d).toLocaleString("ko-KR")}일`;
/** 차트 축 라벨용 연·월. "2017-11-24" → "2017-11".
 *  연도를 두 자리로 줄이면("17-11") 연-월인지 월-일인지 분간이 안 된다. */
const fmtYm = (date: string) => date.slice(0, 7);

/* ── 색 축 ─────────────────────────────────────────────────────────
   이 페이지만 온도축을 **낙폭축**으로 다시 매핑한다.
     파랑 = 하락 · 낙폭 · 초과낙폭      빨강 = 회복 · 수익 · 상승
   시장 브리핑의 파랑(저온)·빨강(고온)과 방향은 같다 — 내려간 것이 파랑, 올라간 것이
   빨강이다. 그래서 전역 2색 체계와 어긋나지 않는다.

   ⚠️ 예전엔 '미회복'이 빨강이었다(경고 뜻). 여기서 빨강은 회복을 뜻하므로 그대로 두면
   못 돌아온 것이 돌아온 것과 같은 색이 된다. 미회복은 **채우지 않은 분홍 점선**으로
   "아직 오지 않았다"를 말한다. */
const DOWN = "var(--c-cold-ink)";
const UP = "var(--c-hot-ink)";
/** 하락 막대 서열(진한 → 옅은). 다크에선 1이 가장 밝다 — 순서가 뒤집힌다. */
const DOWN_BAR = ["var(--c-blue-1)", "var(--c-blue-2)", "var(--c-blue-3)", "var(--c-blue-4)", "var(--c-blue-5)"];
const UP_BAR = "var(--c-warm-1)";
const UP_BAR_SOFT = "var(--c-warm-3)";
/** 미회복 — 채우지 않은 분홍 점선. 위 색 축 주석 참고. */
const UNRECOVERED = `repeating-linear-gradient(90deg, ${UP_BAR_SOFT} 0 3px, transparent 3px 6px)`;

/** 시트 안쪽 본문 padding. 머리(.hz-sheet-head)의 22 와 좌우를 맞춘다. */
const PAD = "18px 22px";

export function MddExplorer({
  stocks,
  initial,
  suggestions,
}: {
  stocks: StockOption[];
  initial?: StockOption | null;
  suggestions?: SuggestGroups;
}) {
  // initial 은 URL(?code=…)로 지정된 종목. 없으면 기본 종목(삼성전자)으로 연다.
  const [selected, setSelected] = useState<StockOption>(initial ?? DEFAULT);
  const [years, setYears] = useState("10");
  const [data, setData] = useState<MddResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 자리표시자 배지 문구를 가르는 값 — 기간만 바꿨나(true), 아니면 첫 진입·종목 변경인가.
  // 이유는 Skeleton 주석에. 조회를 거는 두 입구에서 세워 두고 Skeleton 이 읽는다.
  const [periodOnly, setPeriodOnly] = useState(false);

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

  /* 폭 상한을 여기서 걸지 않는다 — **셸(AppShell)이 이미 1340 으로 잡는다.**
     세 페이지가 같은 상자를 쓰므로 여기에 또 두면 MDD 만 좁아진다.

     ⚠️ 예전의 `maxWidth:1180, margin:"0 auto"` 는 두 가지로 틀렸다.
       ① 1180 은 낡은 값이다. 셸이 1340 으로 넓어질 때(본문 폭을 목업 값으로 되돌린
          커밋) 이 사본이 안 따라와서 `/mdd` 만 160px 좁았다.
       ② 그보다 나쁜 건 `margin:0 auto` 다. 셸의 본문 상자가 **세로 flex** 라
          가로 margin:auto 가 `align-items:stretch` 를 꺼 버린다 — 상자가 늘어나지
          않고 **fit-content** 로 줄어든다(1920 실측 600px). 1440 에서는 남는 폭이
          없어 티가 안 나고 넓은 화면에서만 드러난다. */
  /* 세로 간격은 시트끼리의 간격(Results 의 gap 16)과 같은 값 하나로 둔다. 예전엔 여기만
     20 이라 조회 바 밑의 틈이 시트 사이보다 넓어, 조회 바가 결과에서 떨어져 보였다. */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 제목도 설명 문단도 여기서 안 그린다 — 셸의 본문 헤더(AppShell 의 PageHeader)가
          제목과 한 줄 부제를 이미 그린다. 예전엔 그 아래에 세 갈래 설명("얼마나 빠졌는지 ·
          얼마나 드문지 · 얼마나 걸렸는지")을 한 문단 더 뒀는데, 바로 아래 시트들이 같은
          말을 제목으로 다시 하고 있어 걷어냈다(2026-08-04). */}
      <Controls
        stocks={stocks}
        selected={selected}
        onSelect={(s) => {
          setPeriodOnly(false);
          setSelected(s);
        }}
        years={years}
        onYears={(y) => {
          setPeriodOnly(true);
          setYears(y);
        }}
        suggestions={suggestions}
      />

      {loading && <Skeleton periodOnly={periodOnly} />}
      {!loading && error && <ErrorCard message={error} />}
      {!loading && !error && data && <Results data={data} />}

      {/* 면책("재미·참고용이며 매수·매도 신호가 아닙니다")은 푸터가 전역으로 이미 말하므로 빼고,
          여기선 이 페이지에만 해당하는 데이터 기준만 밝힌다.
          출처 이름은 여기 안 적는다 — 데이터 출처는 푸터가 한곳에서 모아 밝히고, 이 줄은
          "이 숫자를 어떻게 읽어야 하나"(종가·수정주가·표본 크기)만 맡는다. */}
      <p style={{ margin: 0, color: C.muted, fontSize: 12, lineHeight: 1.7 }}>
        모든 수치는 <b style={{ color: C.sub }}>종가</b> 기준이며 액면분할·감자를 반영한 수정주가입니다.
        표본이 한 사이클 남짓이라 회복 기간은 <b style={{ color: C.sub }}>범위</b>로만 참고하십시오.
      </p>
    </div>
  );
}

/* ── 검색 순위 ─────────────────────────────────────────────────────
   부분일치만 하고 이름 가나다순으로 앞에서 여덟 개를 자르면 대표 종목이 밀려난다.
   실측(2026-07-26): "삼성" 22종목 중 앞 여덟에 삼성전자가 없었고(삼성E&A·삼성FN리츠·
   삼성SDI·삼성SDI우…가 먼저), "현대" 33종목 중 현대차는 24번째, "한화" 는 부분일치인
   대한화섬이 1위였다. 시총 1위와 자동차 1위를 이름으로 찾을 수 없었다는 뜻이다.

   그래서 자르기 전에 관련도로 세운다. 등급(낮을수록 먼저):
     0 이름·코드 완전일치 — "현대차"·"005930" 을 정확히 쳤으면 무조건 1위
     1 이름 접두일치      — "삼성" → 삼성전자·삼성물산…
     2 코드 접두일치      — "0059" → 005930
     3 이름 부분일치      — "한화" → 대한화섬. 접두일치를 이기지 못하게 뒤로 보낸다

   같은 등급 안에서는 보통주 → 대표 종목 → 이름 짧은 순 → 가나다순으로 가른다. */

/**
 * 시가총액 상위 KOSPI 보통주를 큰 것부터 손으로 고정한 목록(2026-07 기준).
 *
 * 관련도를 데이터로 뽑을 수 없어 손으로 둔다 — stocks 테이블에는 코드·종목명·종가만
 * 있고 시가총액도 상장주식수도 없다. 종가는 대용이 못 된다(삼성바이오로직스 한 주가
 * 삼성전자보다 열 배 넘게 비싸다). 검색창에 대표성을 주는 다른 신호가 없다.
 *
 * 하는 일은 하나다: "삼성"·"현대"처럼 그룹명이 겹쳐 수십 종목이 걸리는 질의에서 어느
 * 쪽을 먼저 보여줄지 가른다. 여기 없는 종목도 검색은 그대로 되고 이름 길이·가나다순으로
 * 뒤에 붙을 뿐이다. 순위가 낡아도 화면에 나오는 수치는 틀리지 않는다 — 후보를 세우는
 * 데만 쓰고 분석값에는 손대지 않기 때문이다. 그래서 시총이 바뀔 때마다 고칠 필요는 없고,
 * 새 대표주가 검색으로 안 나온다는 말이 나올 때 맨 앞쪽만 손보면 된다.
 *
 * 이름은 stocks 테이블(KRX 정식 종목명)과 정확히 같아야 맞는다 — "엔씨소프트"가 아니라
 * "NC", "네이버"가 아니라 "NAVER". lib/stock-themes.ts 의 테마 사전과 일부 겹치지만
 * 일부러 따로 둔다: 그쪽은 테마별 바스켓이라 안에 순서가 없고, 순서를 뜻하게 만들면
 * 테마 카드를 손볼 때 검색 순위가 조용히 따라 바뀐다.
 */
const MAJOR_NAMES = [
  "삼성전자", "SK하이닉스", "삼성바이오로직스", "LG에너지솔루션", "현대차", "기아",
  "두산에너빌리티", "한화에어로스페이스", "HD현대중공업", "셀트리온", "NAVER", "신한지주",
  "KB금융", "삼성물산", "현대모비스", "한국전력", "카카오", "하나금융지주", "메리츠금융지주",
  "HD한국조선해양", "삼성생명", "삼성화재", "POSCO홀딩스", "LG화학", "SK스퀘어", "한화오션",
  "삼성SDI", "크래프톤", "HMM", "하이브", "KT&G", "우리금융지주", "SK이노베이션",
  "삼성에스디에스", "한국항공우주", "한미반도체", "현대글로비스", "삼성중공업", "LG전자",
  "SK텔레콤", "KT", "기업은행", "대한항공", "유한양행", "삼양식품", "아모레퍼시픽", "삼성전기",
  "포스코퓨처엠", "현대건설", "HD현대", "HD현대일렉트릭", "한화시스템", "현대로템", "고려아연",
  "SK", "LG", "한화", "GS", "CJ", "두산", "삼성증권", "미래에셋증권", "DB손해보험", "현대해상",
  "LG유플러스", "롯데케미칼", "한진칼", "CJ제일제당", "이마트", "LS",
];
const MAJOR_RANK = new Map(MAJOR_NAMES.map((n, i) => [n, i]));

/**
 * 우선주 판별 — 뒤로 밀 대상. "삼성"을 친 사람이 찾는 건 삼성전자우가 아니고,
 * 실측상 삼성물산우B·현대차2우B·현대차3우B·현대차우 같은 것들이 앞자리를 먹었다.
 *
 * 판정은 코드로 한다. KRX 단축코드는 보통주가 0 으로 끝나고 우선주는 5·7·K·L 등으로
 * 끝난다. 코스피 944종목에 대보니 이 규칙이 우선주 110개를 하나도 놓치지 않았고,
 * 보통주를 잘못 집은 경우도 없었다. 이름 규칙(우·우B·2우B…)은 107개까지만 잡는다 —
 * CJ4우(전환)·DL이앤씨2우(전환)·아모레퍼시픽홀딩스3우C 를 놓친다.
 * 그래도 이름 규칙을 함께 두는 건, 코드 규칙에서 벗어난 종목이 들어와도 이름만으로
 * 걸러지게 하려는 이중 안전장치다.
 */
const isPreferredShare = (s: StockOption) => !s.code.endsWith("0") || /\d?우B?$/.test(s.name);

/**
 * 검색어에 맞는 종목을 관련도 순으로. 위 등급표를 그대로 옮긴 순수 함수다.
 * 검색어가 비면 빈 배열(입력 전에는 목록을 열지 않는다).
 */
export function rankStockMatches(stocks: StockOption[], query: string, limit = 8): StockOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { s: StockOption; tier: number; pref: number; major: number; len: number }[] = [];
  for (const s of stocks) {
    const name = s.name.toLowerCase();
    // 코드도 소문자로 — 우선주 코드에는 영문이 섞인다(예: 02826K).
    const code = s.code.toLowerCase();
    let tier: number;
    if (name === q || code === q) tier = 0;
    else if (name.startsWith(q)) tier = 1;
    else if (code.startsWith(q)) tier = 2;
    else if (name.includes(q)) tier = 3;
    else continue;
    scored.push({
      s,
      tier,
      pref: isPreferredShare(s) ? 1 : 0,
      major: MAJOR_RANK.get(s.name) ?? MAJOR_NAMES.length,
      len: s.name.length,
    });
  }

  // 마지막 가나다순까지 두어 같은 값이 남지 않게 한다 — 정렬이 흔들리지 않는다.
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.pref - b.pref ||
      a.major - b.major ||
      a.len - b.len ||
      a.s.name.localeCompare(b.s.name, "ko"),
  );
  return scored.slice(0, limit).map((r) => r.s);
}

/**
 * 추천 한 묶음. 행 구조는 [순위 · 로고 · 이름 · 근거] 네 칸이고, 근거는 오른쪽 정렬로
 * 세로줄을 맞춘다 — 숫자가 왼쪽 정렬이면 훑을 때 눈이 매번 다시 자리를 찾는다.
 * 순위 숫자는 tabular(MONO)로 둬야 두 자리가 돼도 이름 시작점이 안 밀린다.
 */
function SuggestSection({
  title,
  hint,
  items,
  onPick,
}: {
  title: string;
  hint: string;
  items: Suggestion[];
  onPick: (s: StockOption) => void;
}) {
  if (!items.length) return null;
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "0 10px 6px" }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>{title}</h3>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>{hint}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((s, i) => (
          <li key={s.code}>
            <button
              onClick={() => onPick(s)}
              className="hz-row-link hz-pick"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 10px",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                color: C.ink,
                fontSize: 14,
                textAlign: "left",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, width: 12, flexShrink: 0 }}>{i + 1}</span>
              <StockLogo code={s.code} name={s.name} market={s.market} />
              <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              {/* 코스닥은 표시해 준다 — 검색 목록에는 코스피만 있어서, 여기서만 만날 수 있는 종목이다. */}
              {s.market === "KOSDAQ" && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, background: C.bg, padding: "2px 5px", borderRadius: 4, flexShrink: 0 }}>
                  코스닥
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>{s.note}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── 조회 바: 종목 검색 + 기간 토글 ─────────────────────────────── */
function Controls({
  stocks,
  selected,
  onSelect,
  years,
  onYears,
  suggestions,
}: {
  suggestions?: SuggestGroups;
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

  const matches = useMemo(() => rankStockMatches(stocks, query), [query, stocks]);

  const suggest = suggestions ?? { surging: [], report: [] };
  const hasSuggest = suggest.surging.length > 0 || suggest.report.length > 0;
  // 검색어가 비었을 때만 추천을 보여준다. 한 글자라도 치면 그때부터는 매칭 결과다.
  const showSuggest = query.trim() === "";

  // 검색어는 타이핑이 멎은 뒤에만 한 번 보낸다. onChange 마다 쏘면 "삼성전자" 한 번
  // 치는 데 이벤트가 다섯 개 나가고, 그중 넷("삼", "삼성", …)은 의미가 없다.
  // matches=0 인 검색어가 이 데이터의 알맹이다 — 목록에 없는 종목을 찾고 있다는 뜻.
  // 그 알맹이가 정확히 깨지는 자리라 검색어도 gaSearchTerm 을 지난다: 검색 목록에는
  // 코스피만 실려 있어서, 코스닥 코드를 친 사람이 바로 matches=0 행이다.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => track("mdd_search", { query: gaSearchTerm(q), matches: matches.length }), 800);
    return () => clearTimeout(timer);
  }, [query, matches.length]);

  // source 를 받는 이유: 이 드롭다운은 두 얼굴이라(아래 주석) 추천 목록 클릭과 검색
  // 결과 클릭이 같은 pick 을 지난다. 값을 안 실으면 리포트에서 두 가지가 한 줄로 합쳐져
  // "무슨 종목을 검색해서 찾아봤나"를 답할 수 없다 — 추천에 올린 종목이 검색어 없이도
  // 상위를 채우기 때문에, 합쳐 놓으면 사실상 추천 목록을 되읽는 표가 된다.
  const pick = (s: StockOption, source: "search" | "suggest") => {
    // 파라미터 이름을 stock_*·select_* 으로 붙인다. GA4 의 맞춤 측정기준은 이벤트가
    // 아니라 속성 전체에서 이름 하나를 공유하므로, code/name/source 처럼 흔한 이름을
    // 쓰면 나중에 다른 이벤트가 같은 이름을 다른 뜻으로 보낼 때 한 측정기준에 섞인다.
    track("mdd_stock_select", { stock_code: gaStockCode(s.code), stock_name: s.name, select_source: source });
    onSelect(s);
    setQuery("");
    setOpen(false);
  };

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div ref={boxRef} style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
        {/* 검색창은 흰 상자가 아니라 '파인 회색 면'으로 둔다 — 눌러야 할 자리가 눈에 먼저
            들어온다.
            다만 --c-bg 를 그대로 쓰면 안 된다. 이 조회 바는 카드 안이 아니라 페이지 바탕
            위에 바로 얹혀 있어서, 바탕과 같은 값을 주면 입력창이 통째로 사라진다
            (실제로 그렇게 만들었다가 화면에서 안 보여 되돌렸다 — 계산된 색만 보면
            '#f2f4f6 맞음'이라 멀쩡해 보인다).
            그래서 바탕에서 한 칸 더 간 --c-track 을 쓴다. 라이트에서는 바탕보다 어둡고,
            다크에서는 바탕보다 밝다 — 두 테마 모두 '주변과 다른 면'이 된다.
            포커스 때는 파란 테두리 + 옅은 링으로 입력 중임을 분명히 한다. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: C.track,
            border: `1px solid ${focused ? C.blue : "transparent"}`,
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
        {/* 드롭다운은 두 얼굴이다.
              검색어가 있으면 → 매칭 결과
              검색어가 비어 있으면 → 추천(카더라의 급부상·주요 종목)
            빈 검색창에 아무것도 안 띄우면 "무슨 종목을 볼지" 부터 사용자가 떠올려야 한다.
            추천이 아예 없을 때만(텔레그램 데이터가 비었을 때) 닫아 둔다. */}
        {open && (showSuggest ? hasSuggest : matches.length > 0) && (
          <div
            style={{
              position: "absolute",
              top: 50,
              left: 0,
              right: 0,
              zIndex: 20,
              padding: showSuggest ? "14px 8px 8px" : 6,
              background: "var(--c-float)",
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              // 카드에는 그림자를 안 쓰지만 오버레이는 예외다 — 아래 내용을 실제로 가리고
              // 떠 있어서, 경계선만으로는 "위에 있다"가 안 읽힌다(globals.css 의 팝오버와 같은 규칙).
              boxShadow: "0 4px 16px var(--c-shadow-strong)",
              // 내용이 436px 이라 420 에서 스크롤이 생겼다. 여유를 둬서 스크롤을 없앤다 —
              // 좁은 폭에서 안내 문구가 두 줄로 접히는 경우까지 감안한 값이다.
              // 상한 자체는 남겨 둔다(작은 화면에서 패널이 화면 밖으로 자라면 안 된다).
              maxHeight: 480,
              overflowY: "auto",
            }}
          >
            {showSuggest ? (
              <>
                {/* 두 묶음 사이는 넉넉히 벌린다. 붙여 두면 아래 묶음의 제목이 위 묶음의
                    마지막 줄처럼 읽혀서 어디까지가 '급부상'인지 헷갈린다. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <SuggestSection title="급부상 종목" hint="평소 대비 언급 급증" items={suggest.surging} onPick={(s) => pick(s, "suggest")} />
                  <SuggestSection title="주요 종목" hint="최근 주목도 상위" items={suggest.report} onPick={(s) => pick(s, "suggest")} />
                </div>
                <p style={{ margin: "10px 10px 2px", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                  텔레그램에서 많이 언급된 종목입니다. 매수·매도 신호가 아닙니다.
                </p>
              </>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {matches.map((s) => (
                  <li key={s.code}>
                    <button
                      onClick={() => pick(s, "search")}
                      className="hz-row-link hz-pick"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, cursor: "pointer", color: C.ink, fontSize: 14, textAlign: "left" }}
                    >
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{s.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 기간 토글 — 낱개 알약 5개 대신 하나의 세그먼티드 컨트롤로 묶는다(한 덩어리로 읽힘).
          선택된 칸만 파란 면 + 흰 글자다. 예전엔 흰 면 + 파란 글자였는데, 검색창과 이
          컨트롤이 둘 다 회색 면이라 '지금 고른 것'이 면이 아니라 글자색으로만 갈렸다. */}
      <div style={{ display: "flex", gap: 2, background: C.track, borderRadius: 9, padding: 3 }}>
        {PERIODS.map((p) => {
          const on = p.key === years;
          return (
            <button
              key={p.key}
              onClick={() => {
                track("mdd_period_change", { years: p.key });
                onYears(p.key);
              }}
              aria-pressed={on}
              className="mdd-period-btn"
              style={{
                padding: "7px 13px",
                borderRadius: 6,
                border: "none",
                background: on ? "var(--c-cold-ink)" : "transparent",
                /* 글자를 #ffffff 로 박으면 안 된다. --c-cold-ink 는 라이트에서 진한 파랑
                   (#1b6fb8)이지만 다크에서는 **밝은** 파랑(#6bb6f8)이라, 흰 글자가 그 위에서
                   명암비 2.17 이 된다. 카드색을 쓰면 두 테마가 저절로 반대로 간다. */
                color: on ? C.card : C.label,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
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
/** 시트 묶음 앞의 구간 이름 — 배지 + 시트 수.
    생김새도 간격도 .hz-section-badge(globals.css) — 시장 브리핑·카더라의 같은 줄과
    한 벌이다. 이 컨테이너의 gap 이 16 이라 클래스 기본값을 그대로 쓰면 위 30 이 된다. */
function GroupLabel({ title, count }: { title: string; count: number }) {
  return (
    <div className="hz-section-badge">
      <span>{title}</span>
      <span className="hz-section-badge-n">{count}</span>
    </div>
  );
}

/** 50:50 두 시트가 나란히 서는 줄. 좁아지면 한 장씩 접힌다. */
function Pair({ children }: { children: React.ReactNode }) {
  return <div className="mdd-pair">{children}</div>;
}

function Results({ data }: { data: MddResult }) {
  const a = data.analysis;
  const periodLabel = periodLabelOf(data);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HeroStrip data={data} periodLabel={periodLabel} />
      <Underwater a={a} periodLabel={periodLabel} market={data.market} />

      {data.risk ? (
        <RiskProfile r={data.risk} periodLabel={periodLabel} market={data.market} />
      ) : (
        <AbsentSheet
          icon="monitoring"
          title="리스크 프로필"
          sub="이 종목을 들고 있으면 어떤 위험을 감수하게 되는지, 세 가지 각도로 봅니다"
          body="상장한 지 얼마 되지 않아 연도별 성적과 큰 하락을 낼 만큼 이력이 쌓이지 않았습니다."
        />
      )}

      <GroupLabel title="과거 낙폭 사례" count={2} />
      {/* 시트는 데이터가 없어도 자리를 지킨다 — 이유는 AbsentSheet 주석 참고.
          짝의 칸 수도 그대로 유지해야 50:50 이 안 어긋난다. */}
      <Pair>
        {a.topDrawdowns.length > 0 ? (
          <TopDrawdowns eps={a.topDrawdowns} />
        ) : (
          <AbsentSheet
            icon="history"
            title="역대 낙폭 Top 5"
            sub="이만큼 빠졌던 구간과 회복까지 걸린 기간"
            body="이 기간엔 순위를 매길 만한 하락이 없었습니다. 기간을 넓히면 더 나올 수 있습니다."
          />
        )}
        {a.recovery ? (
          <Recovery a={a} periodLabel={periodLabel} />
        ) : (
          <AbsentSheet
            icon="schedule"
            title="회복까지 걸린 기간"
            sub="과거 사례로 본 회복 소요 기간"
            body="지금은 고점 부근이라 회복을 기다릴 하락이 없습니다."
          />
        )}
      </Pair>

      <GroupLabel title="이 하락의 정체" count={3} />
      <Pair>
        {data.attribution ? (
          <Attribution
            attr={data.attribution}
            stockName={data.name}
            themeName={data.theme?.name ?? null}
            themePeers={data.theme?.peers.filter((p) => !p.isSelf).map((p) => p.name) ?? []}
            market={data.market}
          />
        ) : (
          <AbsentSheet
            icon="call_split"
            title="시장 탓일까, 종목 탓일까"
            sub="지수·업종과 견줘 이 종목만의 낙폭이 얼마인지"
            body={
              a.currentDd > -1
                ? "지금은 고점 부근이라 원인을 나눌 하락이 없습니다."
                : `고점(${a.athDate}) 무렵의 ${benchName(data.market)} 기록이 없어 같은 기간을 나란히 놓지 못했습니다.`
            }
          />
        )}
        <Character ch={a.character} currentDd={a.currentDd} />
      </Pair>
      {data.theme ? (
        <Theme theme={data.theme} />
      ) : (
        <AbsentSheet
          icon="hub"
          title="테마 비교"
          sub="같은 테마 대표 종목들과 지금 낙폭을 나란히 놓습니다"
          body="이 종목이 묶인 테마를 찾지 못했습니다. 테마 대표 종목 목록에 등록된 종목에서만 비교가 나옵니다."
        />
      )}
    </div>
  );
}

/**
 * "최근 10년" / "상장 이후·약 6년" — 화면 곳곳이 같은 말을 써야 해서 한곳에서 만든다.
 * 요청한 기간보다 상장 이력이 짧으면 "최근 10년"은 거짓이 되므로 실제 구간으로 바꾼다.
 */
function periodLabelOf(data: MddResult): string {
  const a = data.analysis;
  const approxYears = (Date.parse(a.asOf) - Date.parse(a.firstDate)) / (365 * 86_400_000);
  const requested = data.years === "all" ? Infinity : Number(data.years);
  const truncated = data.years !== "all" && approxYears < requested - 0.5;
  return data.years === "all" || truncated ? `상장 이후·약 ${Math.max(1, Math.round(approxYears))}년` : `최근 ${data.years}년`;
}

/* ── 공통 프리미티브 ───────────────────────────────────────────────
   카드마다 제각각이던 머리·타일·막대를 셋으로 통일한다. 페이지 전체가 같은
   리듬(파란 아이콘 → 제목 → 한 줄 설명 → 데이터)으로 읽히게 하는 게 목적이다. */

/**
 * 시트 — 흰 판 + 헤어라인 + radius 14, **그림자 없음**. 시장 브리핑·카더라와 같은 판이다.
 * 세로 flex 라 각주 띠(Foot)가 늘 바닥에 붙고, 나란히 놓인 두 시트의 밑단이 맞는다.
 */
function Sheet({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section className="hz-sheet" style={{ display: "flex", flexDirection: "column", ...style }}>
      {children}
    </section>
  );
}

/**
 * 시트 바닥 각주 띠. 높이는 클래스가 39 로 못박는다 — 나란한 시트끼리 바닥 두께가
 * 다르면 같은 줄이 층진 것처럼 보인다(globals.css 의 .hz-sheet-foot 주석 참고).
 */
function Foot({ children }: { children: React.ReactNode }) {
  return (
    <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
      <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub, padding: "9px 0", wordBreak: "keep-all" }}>{children}</span>
    </div>
  );
}

/**
 * 데이터가 없어 본문을 못 채우는 시트의 공통 껍데기.
 *
 * 시트를 통째로 숨기지 않는다. 종목을 바꿀 때마다 격자에서 빠지면 (1) 2열 짝이 어긋나
 * 옆 시트 가운데가 텅 비고, (2) 문턱이 절벽이라 시트가 깜빡인다 — 성격 시트는 −8% 문턱이라
 * KB금융(−7.9%)이 0.1%p 차이로 사라져, 하루 사이 생겼다 없어지면 "어제 있던 게 왜 없지"가
 * 된다. 자리를 지키고 왜 못 보여주는지를 적는다.
 */
function AbsentSheet({ icon, title, sub, body }: { icon: string; title: string; sub: string; body: string }) {
  return (
    <Sheet>
      <SectionHead icon={icon} title={title} desc={sub} />
      <div style={{ padding: PAD }}>
        <p style={{ margin: 0, color: C.muted, fontSize: 12, lineHeight: 1.7, wordBreak: "keep-all" }}>
          <Icon name="info" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} />
          {body}
        </p>
      </div>
    </Sheet>
  );
}

/** 히어로 셀·성격 시트 바닥의 3분할 통계 한 칸 — 라벨 / 값 / 보조. */
function StatCell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <strong style={{ fontSize: 15, fontWeight: 800, color: tone ?? C.ink, letterSpacing: "-.02em" }}>{value}</strong>
      {sub && <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
    </div>
  );
}

/** 시트 머리 오른쪽 알약. 띠 위에 얹히므로 카드색 + 헤어라인이다(SectionHead 주석 참고). */
function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: R.pill,
        background: C.card,
        border: `1px solid ${C.line}`,
        color: tone ?? C.sub,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/**
 * 이름 | 트랙 막대 | 값 한 줄. 원인 분해·테마 비교·낙폭 구간 분포가 공유한다.
 *
 * ⚠️ 라벨·값 칸은 고정폭이고 막대만 flex:1 이다. 라벨에 minWidth:0 이 없으면 긴 종목명이
 * 말줄임 대신 칸을 밀어 막대를 좁힌다 — 1440 에서는 안 보이고 좁은 폭에서만 드러난다.
 */
function MeterRow({
  label,
  pct,
  value,
  color,
  strong,
  help,
  ink,
  labelWidth = 104,
  valueWidth = 48,
}: {
  label: string;
  pct: number;
  value: string;
  color: string;
  /** 강조 줄의 **글자**색. 없으면 막대색을 쓴다(둘이 같아도 되는 자리를 위해). */
  ink?: string;
  strong?: boolean;
  help?: string;
  labelWidth?: number;
  valueWidth?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: labelWidth, flex: "none", display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: strong ? 800 : 600,
            color: strong ? C.ink : C.sub,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {label}
        </span>
        {help && (
          <span className="hz-tip hz-tip-wide" data-tip={help} style={{ flexShrink: 0, display: "inline-flex", cursor: "help", color: C.hint }}>
            <Icon name="help" style={{ fontSize: 13 }} />
          </span>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0, height: 11, background: C.track, borderRadius: 4, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: color, borderRadius: 4 }} />
      </span>
      <span
        style={{
          width: valueWidth,
          flex: "none",
          textAlign: "right",
          fontFamily: MONO,
          fontSize: 11.5,
          fontWeight: strong ? 800 : 700,
          /* 막대색을 글자에 그대로 쓰면 안 된다. 램프의 --c-blue-1(#1b7fd4)은 흰 위
             명암비 4.17 이라 11.5px 값이 안 읽힌다 — 채우는 색과 읽는 색은 다른 물건이다
             (시장 브리핑의 --card-accent-ink 와 같은 규칙). */
          color: strong ? (ink ?? color) : C.sub,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── 거울 막대 ─────────────────────────────────────────────────────
   리스크 프로필 세 패널이 공유하는 한 줄. 0선을 가운데 두고 왼쪽(파랑=하락)과
   오른쪽(빨강=회복·수익)으로 갈라 "어느 쪽이 긴가"만 보면 읽히게 한다.

   막대 폭은 **반폭 기준**이다 — |값| / 최댓값 × 50%. 한쪽이 최댓값이면 그 반쪽을 꽉 채운다.

   ⚠️ 기간처럼 자릿수 차가 큰 값(33일 ~ 1,387일)은 선형 눈금이면 짧은 막대가 1%로
   사라진다. 제곱근 눈금과 min-width 5px 을 함께 쓴다(각주에 제곱근임을 밝힌다). */
/* 라벨 칸 폭. 가장 긴 라벨이 `2026.12`(10px/700 실측 42.1px)라 44 로 잡는다.
   예전 34 는 네 자리 연도에 월을 붙이면 넘쳐서, 월이 붙는 줄만 `26.2` 로 줄여 쓰게 했다 —
   한 화면에서 연도 표기가 두 벌이 되는 값이라 칸을 넓히는 쪽으로 되돌렸다(2026-08-04).
   늘어난 10px 은 가운데 막대 칸(flex:1)에서 나온다. 3열이 가장 좁아지는 1000px 에서도
   막대 칸이 181 → 171 이라 반쪽 막대가 85px 씩 남는다. */
const MIRROR_LABEL_W = 44;
const MIRROR_LEFT_W = 40;
const MIRROR_RIGHT_W = 44;

function MirrorRow({
  label,
  left,
  right,
}: {
  label: string;
  left: { pct: number; value: string; color: string; ink: string };
  right: { pct: number; value: string; color: string; ink: string; dashed?: boolean };
}) {
  const bar: React.CSSProperties = { position: "absolute", top: 3, height: 8, minWidth: 5 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: MIRROR_LABEL_W, flex: "none", fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.sub2, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ width: MIRROR_LEFT_W, flex: "none", textAlign: "right", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: left.ink }}>
        {left.value}
      </span>
      <div style={{ position: "relative", flex: 1, minWidth: 0, height: 14 }}>
        <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1.5, background: C.line }} />
        <span style={{ ...bar, right: "50%", width: `${left.pct}%`, borderRadius: "3px 0 0 3px", background: left.color }} />
        <span style={{ ...bar, left: "50%", width: `${right.pct}%`, borderRadius: "0 3px 3px 0", background: right.dashed ? UNRECOVERED : right.color }} />
      </div>
      <span style={{ width: MIRROR_RIGHT_W, flex: "none", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: right.ink }}>{right.value}</span>
    </div>
  );
}

/** 거울 막대 위의 축 라벨. **값 열에 맞춘다** — 막대 위가 아니라 숫자 위에 서야 읽힌다. */
function MirrorAxis({ left, right }: { left: string; right: string }) {
  const s: React.CSSProperties = { flex: "none", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: C.sub };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: MIRROR_LABEL_W, flex: "none" }} />
      <span style={{ ...s, width: MIRROR_LEFT_W, textAlign: "right" }}>{left}</span>
      <div style={{ flex: 1, minWidth: 0 }} />
      <span style={{ ...s, width: MIRROR_RIGHT_W }}>{right}</span>
    </div>
  );
}

/** 범례 한 줄 — 색 조각 + 이름. */
function Legend({ items }: { items: { label: string; background: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: C.sub2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: it.background, flex: "none" }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ── 이 하락의 맥락 ────────────────────────────────────────────────
   히어로 셋째 셀의 해설 문단. **LLM 을 쓰지 않는다** — 전부 이 페이지가 이미 가진 수치를
   문장으로 옮긴 것이라, 반짝 아이콘도 AI 고지도 붙이지 않는다.

   ⚠️ 문단마다 재료가 없을 수 있다(테마 미등록·회복 전례 없음·상장 직후). 없으면 그 문단만
   빠지고 나머지는 남는다 — 셋을 한 덩이로 묶으면 하나가 비어도 셋이 다 사라진다. */
function Reading({ data, periodLabel }: { data: MddResult; periodLabel: string }) {
  const a = data.analysis;
  const p: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.7, color: C.inkSoft, wordBreak: "keep-all" };
  const b = (color?: string) => ({ fontWeight: 800, color: color ?? C.ink });
  const paras: React.ReactNode[] = [];

  // 1 — 얼마나 드문 깊이인가.
  const bigDrops = a.depthBuckets.reduce((s, d) => s + d.count, 0);
  if (bigDrops > 0) {
    paras.push(
      <p key="depth" style={p}>
        {periodLabel} 동안 <b style={b()}>−20%보다 깊이</b> 잠긴 구간은 {bigDrops}번이었고, 가장 깊었던 때는{" "}
        <b style={b()}>{fmtPct(a.mdd)}</b>였습니다.
        {a.recovery && a.recovery.similarCount > 0 && (
          <> 지금만큼 깊었던 적은 그중 {a.recovery.similarCount}번입니다.</>
        )}
      </p>,
    );
  }

  // 2 — 시장·업종으로 설명되는 몫과 안 되는 몫.
  const attr = data.attribution;
  if (attr) {
    const bench = attr.theme ?? attr.market;
    const themeName = data.theme?.name;
    const gap = bench !== null ? attr.stock - bench : null;
    paras.push(
      <p key="attr" style={p}>
        {/* ⚠️ 기준 지수가 **올랐을 때**를 빼먹으면 안 된다. 국장은 이 문장이 쓰이는
            대부분의 날에 코스피도 같이 빠져 있어 "빠졌습니다"가 맞았는데, 미장을 들이자
            바로 드러났다 — "S&P500은 +3.4% 빠졌습니다"(실측). 부호로 동사를 가른다. */}
        같은 기간 {benchName(data.market)}
        {benchParticle(data.market)}{" "}
        {attr.market !== null ? fmtPct(attr.market) : "기록이 없고"}
        {attr.theme !== null && <>, {themeName ?? "테마"} 업종은 {fmtPct(attr.theme)}</>}{" "}
        {benchVerb(attr.market, attr.theme)}.
        {gap !== null &&
          (gap < 0 ? (
            <>
              {" "}
              시장·업종으로 설명되지 않는 <b style={b(DOWN)}>{fmtPct(gap)}p</b>가 이 종목 고유의 낙폭입니다.
            </>
          ) : (
            <>
              {" "}
              이 종목은 오히려 <b style={b(UP)}>{fmtPct(gap)}p</b> 덜 빠졌습니다.
            </>
          ))}
      </p>,
    );
  }

  // 3 — 과거엔 회복까지 얼마나 걸렸나.
  const r = a.recovery;
  if (r) {
    paras.push(
      <p key="rec" style={p}>
        {r.recoveredCount >= 2 ? (
          <>
            과거 {r.recoveredCount}번의 회복은 <b style={b()}>중앙값 {fmtDur(r.medianDays!)}</b>({fmtDur(r.minDays!)}~
            {fmtDur(r.maxDays!)})이 걸렸습니다.
          </>
        ) : r.recoveredCount === 1 ? (
          <>
            고점을 되찾은 전례는 <b style={b()}>{fmtDur(r.medianDays!)}</b> 걸린 한 번뿐이라, 기간은 범위로만 참고하십시오.
          </>
        ) : (
          <>
            이만큼 깊게 빠진 뒤 <b style={b()}>회복한 전례가 없습니다</b>. 지금이 이 종목의 역대 최대 낙폭입니다.
          </>
        )}
      </p>,
    );
  }

  // 정직성 경고 — 겹쳐 쌓지 않고 필요한 것만.
  const approxYears = (Date.parse(a.asOf) - Date.parse(a.firstDate)) / (365 * 86_400_000);
  const caution =
    data.years === "all"
      ? "전체 구간에는 합병·감자·액면병합이 섞여 있어, 아주 오래된 낙폭은 지금의 회사와 다를 수 있습니다."
      : approxYears < 2
        ? "표본이 짧아 더 오래된 종목과 같은 무게로 보지 마십시오."
        : null;

  return (
    <>
      {paras}
      {caution && (
        <p style={{ ...p, fontSize: 11, color: C.muted, marginTop: "auto" }}>
          <Icon name="info" style={{ fontSize: 13, verticalAlign: -2, marginRight: 4 }} />
          {caution}
        </p>
      )}
    </>
  );
}

/* ── 히어로 스트립 ─────────────────────────────────────────────────
   시트 하나를 flex-wrap 으로 3분할한다. **고정 3열 그리드를 쓰면 안 된다** — 좁은 폭에서
   세 칸이 합쳐 컨테이너를 넘긴다. 셀마다 flex-basis 를 주고 알아서 접히게 둔다. */
function HeroStrip({ data, periodLabel }: { data: MddResult; periodLabel: string }) {
  const a = data.analysis;
  const atHigh = a.currentDd > -1;
  const sincePeak = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);
  const fromLow = a.low > 0 ? (a.price / a.low - 1) * 100 : 0;

  /* 셀 경계는 셀이 자기 **오른쪽·아래** 두 곳에 inset 으로 긋는다(globals.css 의
     .hz-cellgrid 와 같은 방식). 오른쪽만 그으면 좁은 폭에서 세 셀이 세로로 쌓일 때
     경계가 통째로 사라지고(실측 820px: 셀 셋이 각각 554px 전폭), 그 선은 시트
     오른쪽 테두리와 겹쳐 버린다.

     아래 감싸는 div 의 margin-bottom:-1px 이 짝이다 — 모든 셀이 아랫선을 그으면
     마지막 줄의 선이 시트 바닥 테두리와 겹쳐 2px 로 두꺼워지는데, 1px 짧게 잡아
     시트 밖으로 밀면 overflow:hidden 이 잘라 준다. 셀 개수를 안 세도 된다. */
  const cell: React.CSSProperties = {
    minWidth: 0,
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: `inset -1px 0 0 ${C.line}, inset 0 -1px 0 ${C.line}`,
  };

  return (
    <section className="hz-sheet">
      <div style={{ display: "flex", flexWrap: "wrap", marginBottom: -1 }}>
      {/* 1 — 분석 종목 */}
      <div style={{ ...cell, flex: "1 1 290px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>분석 종목</span>
          {data.market && <Pill>{data.market}</Pill>}
        </div>
        {/* 로고는 글자 기준선이 아니라 가운데에 맞아야 한다 — baseline 이면 정사각형
            타일이 글자 밑선에 걸려 위로 떠 보인다. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <StockLogo code={data.code} name={data.name} market={data.market} size={30} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <strong style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.03em", color: C.ink }}>{data.name}</strong>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{data.code}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <strong style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, letterSpacing: "-.03em", color: C.ink }}>{fmtPrice(a.price, data.market)}</strong>
          {a.changePct !== null && (
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: a.changePct >= 0 ? UP : DOWN }}>{fmtPct(a.changePct)}</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <PriceRow label="전고점" date={a.athDate} value={fmtPrice(a.ath, data.market)} />
          <PriceRow label="저점" date={a.lowDate} value={fmtPrice(a.low, data.market)} />
        </div>
      </div>

      {/* 2 — 지금 낙폭 */}
      <div style={{ ...cell, flex: "1.05 1 300px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>지금 낙폭</span>
            <span
              className="hz-tip hz-tip-wide hz-tip-start"
              data-tip={`전고점(${fmtPrice(a.ath, data.market)}) 대비 현재가가 얼마나 내려와 있는지입니다`}
              style={{ display: "inline-flex", cursor: "help" }}
            >
              <Icon name="help" style={{ fontSize: 14, color: C.hint }} />
            </span>
          </span>
          {/* 오른쪽 위에 있던 '상위 11%' 배지는 걷었다(2026-08-04). 바로 아래 타일이 같은
              것을 이미 말하는데다, '상위 N%' 자체가 무엇의 상위인지 한 번 더 생각하게 했다. */}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong
            style={{ fontFamily: MONO, fontSize: 40, fontWeight: 800, lineHeight: 0.78, letterSpacing: "-.04em", color: atHigh ? C.ink : DOWN }}
          >
            {atHigh ? "신고가 부근" : fmtPct(a.currentDd)}
          </strong>
          {!atHigh && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>전고점 대비</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub }}>
                저점 대비 <b style={{ color: fromLow >= 0 ? UP : DOWN, fontWeight: 800 }}>{fmtPct(fromLow)}</b>
              </span>
            </div>
          )}
        </div>
        {!atHigh && <DrawdownGauge current={a.currentDd} mdd={a.mdd} periodLabel={periodLabel} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginTop: "auto", paddingTop: 14, borderTop: `1px solid ${C.sheetRow}` }}>
          {/* 보조 줄에 조회 기간 이름("최근 10년")은 안 붙인다 — '전체' 조회에서
              "상장 이후·약 27년 6,646일 중"이 되어 칸을 넘겼다(실측 121 > 115px).
              옆 칸 '기간 최저점'도 기간을 안 적고, 기간은 바로 위 토글이 말한다. */}
          <StatCell label="이보다 깊었던 날" value={deeperLabel(a)} sub={`${fmtDayCount(a.tradingDays)} 중`} />
          <StatCell label="기간 최저점" value={fmtPct(a.mdd)} sub={a.mddDate} tone={DOWN} />
          <StatCell label="고점 이후" value={fmtDayCount(sincePeak)} sub={`${a.athDate}부터`} />
        </div>
      </div>

      {/* 3 — 이 하락의 맥락. LLM 을 쓰지 않는다(반짝 아이콘·AI 고지 없음). */}
      <div style={{ ...cell, flex: "1.3 1 300px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: C.blueTint,
              color: DOWN,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            <Icon name="insights" style={{ fontSize: 14 }} />
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>이 하락의 맥락</span>
        </div>
        <Reading data={data} periodLabel={periodLabel} />
      </div>
      </div>
    </section>
  );
}

/** 히어로 1번 셀의 전고점·저점 두 줄. 위 칸부터 선을 그어 값이 표처럼 읽히게 한다. */
function PriceRow({ label, date, value }: { label: string; date: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.sheetRow}` }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub, minWidth: 0 }}>
        {label} <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{date}</span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.ink, flex: "none" }}>{value}</span>
    </div>
  );
}

/**
 * 지금 낙폭이 이 기간에서 얼마나 드문 깊이인가 — **날수로** 적는다.
 *
 * 예전엔 "상위 11%" 였는데(2026-08-04 교체), 무엇의 상위인지 한 번 더 생각해야 했다.
 * 백분위는 아래 보조 줄(`2,445일 중`)이 분모를 대면서 저절로 나온다. 날수는 곧바로
 * 손에 잡히고("280일이면 1년 남짓"), 같은 창을 쓰는 다른 시트와 단위도 맞는다.
 */
function deeperLabel(a: MddAnalysis): string {
  if (a.deeperThanNowDays === 0) return "없음";
  return fmtDayCount(a.deeperThanNowDays);
}

/**
 * 0 ~ −100% 게이지. 현재 위치에 마커를, 기간 최대 낙폭에 기준선을 세운다.
 * 두 눈금이 겹칠 만큼 가까우면(지금이 곧 역대 최저) 기준선을 접는다 — 같은 자리에
 * 선 두 개가 겹쳐 마커가 두꺼워 보일 뿐이다.
 */
function DrawdownGauge({ current, mdd, periodLabel }: { current: number; mdd: number; periodLabel: string }) {
  const at = Math.min(100, Math.abs(current));
  const worst = Math.min(100, Math.abs(mdd));
  const showWorst = Math.abs(worst - at) > 3;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 마커 위에 있던 값 라벨("−33.8%")은 걷었다(2026-08-04). 바로 위에 같은 값이 40px 로
          서 있어서 한 셀에서 같은 숫자를 두 번 읽게 했다. 대신 짝대기 머리에 **빈 동그라미**를
          얹어 핀 모양으로 만든다 — 시장 브리핑 히어로 게이지와 같은 장치이고, 라벨 없이도
          "여기를 가리킨다"가 남는다. paddingTop 도 라벨 자리(16)에서 동그라미 자리(12)로 줄인다. */}
      <div style={{ position: "relative", paddingTop: 12 }}>
        <div style={{ height: 9, borderRadius: 3, background: `linear-gradient(90deg, ${C.track}, ${DOWN_BAR[2]} 60%, ${DOWN_BAR[0]})` }} />
        {/* 짝대기 — 띠 위아래로 4px 씩 삐져나온다. 흰 링(box-shadow) 이 있어야 어느 색 위에
            서든 띠와 안 섞인다. */}
        <span
          style={{
            position: "absolute",
            left: `${at}%`,
            top: 8,
            transform: "translateX(-50%)",
            width: 2,
            height: 17,
            borderRadius: 1,
            background: C.ink,
            boxShadow: `0 0 0 2px ${C.card}`,
          }}
        />
        {/* 핀 머리. 속을 카드색으로 채워 **비어 보이게** 한다 — 꽉 찬 점은 띠 위의 데이터
            점처럼 읽히는데, 이건 값이 아니라 '가리키는 자리'다. 짝대기(top 8)의 첫 1px 을
            이 원이 덮어 이음매가 안 보인다. */}
        <span
          style={{
            position: "absolute",
            left: `${at}%`,
            top: 0,
            transform: "translateX(-50%)",
            width: 9,
            height: 9,
            borderRadius: "50%",
            border: `2px solid ${C.ink}`,
            background: C.card,
            boxSizing: "border-box",
          }}
        />
        {showWorst && (
          <span style={{ position: "absolute", left: `${worst}%`, top: 8, transform: "translateX(-50%)", width: 1, height: 13, background: C.muted }} />
        )}
      </div>
      <div style={{ position: "relative", height: 13 }}>
        <span style={{ position: "absolute", left: 0, top: 0, fontSize: 11, fontWeight: 600, color: C.sub }}>0%</span>
        {showWorst && (
          <span
            style={{
              position: "absolute",
              left: `${worst}%`,
              top: 0,
              transform: "translateX(-50%)",
              fontSize: 11,
              fontWeight: 600,
              color: C.sub,
              whiteSpace: "nowrap",
            }}
          >
            {periodLabel} 최대 {fmtPct(mdd)}
          </span>
        )}
        <span style={{ position: "absolute", right: 0, top: 0, fontSize: 11, fontWeight: 600, color: C.sub }}>−100%</span>
      </div>
    </div>
  );
}

/* 고점 대비 낙폭 곡선(언더워터). dd 는 0 이하이고 아래로 갈수록 깊다. */
function Underwater({ a, periodLabel, market }: { a: MddAnalysis; periodLabel: string; market: string | null }) {
  const series = a.underwater;
  const mdd = a.mdd;
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

  /* 확대 보기. 폰에서 이 차트는 뷰박스 720 units 가 화면 폭(≈350)으로 눌려 **절반 축척**이
     된다 — 연도·퍼센트 라벨이 11 units 라 실제 5~6px 로 찍혀 안 읽힌다.
     오버레이에서 무대 폭을 100vh 로 잡고 90도 돌리면 화면의 긴 변을 쓰게 되어 폰에서
     2배 남짓 커진다(393×830 기준 350 → 830). 같은 SVG 를 그대로 다시 그리므로
     곡선·눈금·라벨이 갈릴 일이 없다. */
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  /* 크로스헤어 띠 — 보이지 않는 세로 띠가 눌리면 기준선(hz-vline)과 툴팁(hz-tip)을 낸다.
     위치를 **뷰박스 비율(%)**로 잡는다. 예전엔 카드 padding(22/20/42 px)을 기준으로 잡아
     그 카드 안에서만 맞았는데, 확대 보기는 padding 이 달라서 그대로 두면 곡선과 어긋난다.
     뷰박스는 `0 -6 720 202` 이고 플롯은 y 0~176 · x 36~720 이므로 비율은 이렇게 떨어진다. */
  const crosshair = (extraClass: string) => (
    <div
      className={`mdd-crosshair${extraClass}`}
      style={{
        position: "absolute",
        top: `${(6 / (H + 26)) * 100}%`,
        left: `${(PAD_L / W) * 100}%`,
        right: 0,
        bottom: `${(20 / (H + 26)) * 100}%`,
      }}
    >
      {series.map((p, i) => {
        const at = n <= 1 ? 0 : i / (n - 1);
        const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
        return (
          <div
            key={i}
            className={`hz-tip hz-vline${edge}`}
            data-tip={`${p.date} · ${fmtPrice(p.close, market)} · 고점 대비 ${fmtPct(p.dd)}`}
            style={{ flex: 1, position: "relative" }}
          />
        );
      })}
    </div>
  );

  const chartOnly = (
      <svg
      viewBox={`0 -6 ${W} ${H + 26}`}
      width="100%"
      style={{ overflow: "visible" }}
      role="img"
      aria-label={`고점 대비 낙폭 곡선. 현재 ${fmtPct(series[n - 1].dd)}, 기간 최저 ${fmtPct(mdd)}`}
    >
      <line x1={PAD_L} y1="0" x2={W} y2="0" stroke={C.line} strokeWidth="1" />
      {rows.slice(1).map((dd, i) => (
        <line key={i} x1={PAD_L} y1={y(dd)} x2={W} y2={y(dd)} stroke={C.line} strokeWidth="1" strokeDasharray="2 5" />
      ))}
      <path d={area} fill={DOWN_BAR[1]} fillOpacity="0.14" />
      <path d={line} fill="none" stroke={DOWN_BAR[1]} strokeWidth="1.6" strokeLinejoin="round" />
      {/* 기간 최저점 표시 — **빈 동그라미만**. 현재 지점에도 속 찬 점을 찍었었는데 뺐다:
          선이 끝나는 자리가 곧 현재이고, 그 값은 히어로가 이미 크게 말한다. */}
      <circle cx={x(ti)} cy={y(series[ti].dd)} r="3.5" fill={C.card} stroke={DOWN} strokeWidth="1.6" />
      {rows.map((dd, i) => (
        <text key={i} x={PAD_L - LABEL_GAP} y={y(dd) + 4} fontSize="11" fill={C.muted} textAnchor="end">
          {Math.round(dd)}%
        </text>
      ))}
      {ticks.map((t, i) => (
        <text key={i} x={t.x} y={H + 16} fontSize="11" fill={C.muted} textAnchor="middle">
          {t.year}
        </text>
      ))}
    </svg>
  );

  /* svg 와 띠를 한 상자에 묶는다 — 띠가 svg 박스 기준으로 앉아야 어디에 놓든 안 어긋난다. */
  const chartWith = (extraClass: string) => (
    <div style={{ position: "relative" }}>
      {chartOnly}
      {crosshair(extraClass)}
    </div>
  );

  return (
    <Sheet>
      <SectionHead
        icon="show_chart"
        title="언더워터 차트"
        desc="전고점을 0으로 두고 그 아래로 얼마나 잠겼는지"
        note={periodLabel}
      />
      <div style={{ padding: "20px 22px 16px", position: "relative" }}>
      {/* overflow:visible — 최저점 표시가 하필 마지막 지점일 때(지금이 역대 최저인
          종목) 뷰박스 오른쪽 끝에 놓여 기본값(hidden)이면 반지름만큼 잘린다. 뷰박스를
          넓히는 대신 넘침만 허용한다 — 넓히면 아래 크로스헤어 띠(퍼센트로 잡은 위치)가
          곡선과 어긋난다. */}
      {chartWith("")}
      {/* 확대 버튼 — 차트 오른쪽 아래. 리스크 프로필의 '전체보기'(.hz-yrpop-btn)와 같은
          아이콘·같은 자리 어법이라 새 언어를 안 만든다. 폰에서만 뜬다(CSS). */}
      <button
        type="button"
        className="mdd-zoom-btn"
        aria-label="언더워터 차트 확대해서 보기"
        onClick={() => setZoom(true)}
      >
        <Icon name="open_in_full" style={{ fontSize: 15 }} />
      </button>
      </div>
      <Foot>0%가 전고점입니다. 아래로 갈수록 그 고점에서 멀어져 있다는 뜻이며, 선이 0에 닿은 날이 고점을 되찾은 날입니다.</Foot>
      {zoom && (
        /* 스크림을 눌러도 닫힌다. 무대는 90도 돌려 화면의 긴 변을 쓴다. */
        /* ⚠️ 닫기 판정은 target 으로 한다. 무대에 stopPropagation 을 걸면 편하지만, 그러면
           document 에 걸린 툴팁 탭 리스너(app/TipTap.tsx)까지 막혀서 곡선을 짚어도
           설명이 안 뜬다 — 확대해 놓고 정작 값을 못 보는 꼴이 된다. */
        <div className="mdd-zoom-scrim" role="dialog" aria-modal="true" aria-label="언더워터 차트 확대" onClick={(e) => { if (e.target === e.currentTarget) setZoom(false); }}>
          <button type="button" className="mdd-zoom-close" aria-label="닫기" onClick={() => setZoom(false)}>
            <Icon name="close" style={{ fontSize: 20 }} />
          </button>
          <div className="mdd-zoom-stage">
            {chartWith(" mdd-crosshair-zoom")}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ── 리스크 프로필 ─────────────────────────────────────────────────
   세 타일이 완전히 같은 문법을 쓴다: [범례] → [연도 + 막대 2줄 + 값 2개] × 최대 4줄 →
   [요약 한 줄]. 타일마다 구조가 다르면 종목을 바꿀 때마다 길이가 들쭉날쭉해진다.
   요약 한 줄은 줄 수가 모자라도 타일 맨 아래에 붙는다 — 표본이 얇은 종목(네이버 등)에서
   요약이 막대를 따라 위로 딸려 올라가면 세 타일의 밑단이 어긋나 보인다. */
const RISK_ROWS = 5; // 모든 타일이 쓰는 고정 줄 수(연도 5개 · 사건 5건)

/** 타일 본문 — 막대 영역(viz)과 맨 아래에 고정되는 요약 한 줄(foot)을 따로 들고 있는다. */
type TileBody = { head: React.ReactNode; viz: React.ReactNode; foot: React.ReactNode; more?: React.ReactNode };

/** 패널 머리의 큰 수치 둘 — 19px/800 + 작은 라벨. 세 패널이 같은 자리에 쓴다. */
function TileHead({ items }: { items: { value: string; label: string; tone: string }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <strong style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, color: it.tone }}>
            {it.value}
          </strong>
          <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * '전체보기' — 막대에 안 깔린 해까지 조회 기간 전체를 펼친다.
 *
 * PC 는 마우스오버, 모바일은 탭으로 열린다. 여는 장치는 CSS 하나뿐이라(:hover 와
 * :focus-within, globals.css 의 .hz-yrpop) 상태도 이벤트 핸들러도 없다 — 카더라
 * 테마 로테이션의 .hz-theme-pop 과 같은 어법이다. 버튼이라 탭하면 포커스가 잡혀 열리고,
 * 딴 데를 누르면 포커스가 빠져 닫힌다.
 *
 * ⚠️ .hz-tip 은 :hover 전용이라 여기 못 쓴다(모바일에서 안 열린다).
 */
function YearsPopover({ years, label }: { years: YearStat[]; label: string }) {
  // 위로 편다 — 타일 맨 아래라 아래로 열면 카드 밖으로 나간다. 오른쪽 끝에 맞춰 세 번째
  // 타일에서도 카드 오른쪽으로 안 넘친다(넘치면 페이지에 가로 스크롤이 생긴다).
  const max = Math.max(...years.flatMap((y) => [Math.abs(y.ret), Math.abs(y.mdd)]), 1);
  return (
    <span className="hz-yrpop-host">
      {/* 글자 없이 아이콘만. 제목 줄에 "전체보기" 넉 자를 얹으면 부제와 부딪혀 제목이
          좁아진다. 뜻은 aria-label 이 지고, 커서·호버 색이 누를 수 있음을 알린다. */}
      <button type="button" className="hz-yrpop-btn" aria-label={`${label} 연도별 성적 보기`}>
        <Icon name="open_in_full" style={{ fontSize: 15 }} />
      </button>
      <span className="hz-yrpop" role="group">
        <span className="hz-yrpop-head">
          {label} 연도별 성적
        </span>
        {/* 오래된 해가 위, 올해가 맨 아래. 타일 막대와 같은 순서라 펼쳤을 때 눈이
            같은 자리를 짚는다(막대도 2022→2026 으로 내려온다).

            한 해의 두 줄도 타일과 같은 순서로 **낙폭이 먼저, 수익이 두 번째**다.
            타일의 범례("그 해 최악 낙폭 · 그 해 수익")도, 거울 막대의 좌우(왼쪽 낙폭 ·
            오른쪽 수익)도 그 순서라, 여기만 뒤집혀 있으면 펼칠 때마다 읽는 순서가
            바뀐다(2026-08-04 에 바로잡음). */}
        {years.map((y) => (
          <span key={y.year} className="hz-yrpop-row">
            <span className="hz-yrpop-year">{y.year}</span>
            <span className="hz-yrpop-bars">
              <span className="hz-yrpop-bar" style={{ width: `${Math.max(2, (Math.abs(y.mdd) / max) * 100)}%`, background: C.cold, opacity: 0.45 }} />
              <span className="hz-yrpop-bar" style={{ width: `${Math.max(2, (Math.abs(y.ret) / max) * 100)}%`, background: y.ret >= 0 ? C.mania : C.cold }} />
            </span>
            <span className="hz-yrpop-val">
              <span style={{ color: C.cold, opacity: 0.75 }}>{`${Math.round(y.mdd)}%`}</span>
              <span style={{ color: y.ret >= 0 ? C.mania : C.cold }}>{`${y.ret >= 0 ? "+" : "−"}${Math.abs(Math.round(y.ret))}%`}</span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

function RiskProfile({ r, periodLabel, market }: { r: RiskProfileData; periodLabel: string; market: string | null }) {
  const yrs = Math.max(1, Math.round(r.years));
  const alone = r.withMarket === null ? 0 : r.bigDropCount - r.withMarket;
  /* 두 벌을 구분해서 든다.
       scoped — **조회 기간 전체**의 해들. 요약 문장과 큰 수치가 세는 창이고,
                '전체보기' 팝오버가 펴는 것도 이것이다.
       yearly — 그중 막대로 깔 최근 RISK_ROWS 줄. 자리 때문에 자른 것뿐이다.

     ⚠️ `r.yearly` 를 그대로 쓰면 안 된다. yearlyStats 는 거래일이 20일 넘는 해를 다 세므로
     10년 조회에 11개(2016~2026)가 나온다 — 시작 해의 토막을 한 해로 세기 때문이다. 조회
     기간만큼(`-yrs`) 잘라야 "최근 10년"이라 적어 놓고 11년을 세는 일이 없다. */
  const scoped = r.yearly.slice(-yrs);
  const yearly = scoped.slice(-RISK_ROWS);
  const events = r.events.slice(-RISK_ROWS);

  // 뒤 두 타일의 한 줄은 '연도'가 아니라 '큰 하락 한 건'이라, 같은 해에 두 번 났으면
  // 연도만으로는 두 줄이 구분되지 않는다(삼성전자 2026 이 그렇다). 그런 해에만 고점 월을
  // 붙인다 — 한 번뿐인 해까지 붙이면 축이 괜히 시끄러워진다.
  const eventYearCount = new Map<number, number>();
  for (const e of events) eventYearCount.set(e.year, (eventYearCount.get(e.year) ?? 0) + 1);
  /* 연도는 네 자리 그대로 적는다. 예전엔 월이 붙는 줄만 두 자리로 줄였는데("2026.2" →
     "26.2"), 같은 축에서 `2024` 와 `26.2` 가 나란히 서니 무슨 해인지 한 번 더 세어야 했다.
     라벨 칸(MIRROR_LABEL_W)을 넓혀 두 자리로 줄이는 이유를 없앴다(2026-08-04). */
  const eventLabels = events.map((e) => ((eventYearCount.get(e.year) ?? 0) > 1 ? `${e.year}.${e.month}` : `${e.year}`));

  /* 타일 제목 옆 괄호. 두 타일과 한 타일이 서로 다른 것을 적는데, 다르게 적을 이유가 있다.
     기준은 하나다 — **괄호가 가리키는 것에 화면에서 닿을 수 있나.**

     뒤 두 타일(속도·동반성)은 막대 RISK_ROWS 줄이 전부라, 닿을 수 있는 건 그 줄들뿐이다.
     그래서 **실제 줄 수**를 적는다. 예전에 전체 건수(bigDropCount)를 적어 봤는데 SK하이닉스가
     "(최근 7건)"인데 5줄만 깔려서, 읽는 사람이 "7건을 보여준다"로 읽고 두 줄을 찾게 됐다.
     7 이라는 숫자는 그 타일 요약이 "7번 중 2번은…"으로 스스로 밝히니 잃지 않는다.

     앞 타일(보상)은 전체보기가 붙어 **조회 기간 전체에 실제로 닿는다.** 그래서 조회 기간을
     적는다. 막대는 최근 5줄이지만 나머지 해는 전체보기 안에 있고, 요약도 "최근 10년 해마다
     …"로 같은 창을 말한다. 셋이 같은 기간을 가리킨다.

     ⚠️ 이 타일에서 전체보기를 걷어내면 괄호도 같이 손봐야 한다. 그러면 10년이라 적고 5년만
     보여주는 상태로 되돌아간다(2026-07-30 에 실제로 그래서 어색했다). */
  const yearScope = yearly.length ? ` (최근 ${yrs}년)` : "";
  const eventScope = events.length ? ` (최근 ${events.length}건)` : "";

  const empty = (text: string) => <p style={{ margin: 0, fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>{text}</p>;
  const rows = (children: React.ReactNode) => <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
  const summary = (text: string) => <p style={{ margin: 0, fontSize: 11, color: C.sub2, lineHeight: 1.55, wordBreak: "keep-all" }}>{text}</p>;
  /** 거울 막대의 반쪽 폭 — 최댓값이 반폭(50%)을 꽉 채운다. */
  const half = (v: number, max: number) => (Math.abs(v) / max) * 50;
  /**
   * 제곱근 눈금(반폭 기준). 한 값이 나머지를 압도할 때 쓴다.
   *
   * 실측(SK하이닉스 10년): 2025년 수익 +280%가 축을 다 먹어 낙폭 막대가 6~20px 로
   * 뭉갰다(2023년 −17%는 6px). 제곱근은 짧은 쪽을 벌리면서 **순서와 좌우 비교를 지킨다**
   * — 단조 증가라 sqrt(a) > sqrt(b) 와 a > b 가 같은 뜻이고, 이 패널이 묻는 "어느 쪽이
   * 긴가"가 그대로 남는다. 대신 길이 '비율'은 실제보다 눌리므로 각주에 밝힌다.
   */
  const halfSqrt = (v: number, max: number) => Math.sqrt(Math.abs(v) / max) * 50;

  /* 1 — 낙폭 대비 보상: 해마다 '그 해 최악 낙폭'(왼쪽·파랑)과 '그 해 수익'(오른쪽·빨강).
         손실인 해는 수익도 하락이므로 오른쪽이지만 파랑으로 칠한다. */
  /* 큰 수치와 요약은 **조회 기간 전체**(scoped)로 센다. 막대에 깔린 최근 다섯 해가 아니다.
     예전엔 이 둘만 5년이라, 옆에 선 연평균(복리)은 10년인데 평균 낙폭은 5년이었고 그 둘을
     나눈 '보상 배수'는 창이 섞인 값이었다. 제목의 "(최근 10년)"·전체보기와도 어긋났다.
     (삼성전자 10년 실측: 평균 낙폭 −29% → −26%, 보상 0.78배 → 0.88배, 5년 중 3년 →
     10년 중 6년.) 2026-08-04.
     ⚠️ 여기 적힌 '보상 배수'도 '5년 중 3년'도 지금 화면에 없다. 둘 다 읽히지 않아
     걷어냈다(아래 foot 주석). 창을 맞춰야 하는 이유는 그대로다 — 남은 평균 낙폭이
     여전히 scoped 를 세고, 옆에 선 연평균(복리)과 같은 창이어야 한다. */
  const avgYearMdd = scoped.length ? scoped.reduce((s, y) => s + y.mdd, 0) / scoped.length : 0;
  const tile1: TileBody =
    yearly.length === 0
      ? { head: null, viz: empty("연도별 표본이 부족합니다."), foot: null }
      : {
          head: (
            <TileHead
              items={[
                { value: `${Math.abs(r.annualReturn).toFixed(1)}%`, label: `연평균(복리) ${r.annualReturn >= 0 ? "수익" : "손실"}`, tone: r.annualReturn >= 0 ? UP : DOWN },
                { value: `${Math.round(avgYearMdd)}%`, label: "해마다 겪은 평균 낙폭", tone: DOWN },
              ]}
            />
          ),
          viz: (
            <>
              <Legend
                items={[
                  { label: "그 해 최악 낙폭", background: DOWN_BAR[2] },
                  { label: "그 해 수익", background: UP_BAR_SOFT },
                ]}
              />
              <div style={{ margin: "11px 0 8px" }}>
                <MirrorAxis left="낙폭" right="수익" />
              </div>
              {rows(
                (() => {
                  const max = Math.max(...yearly.flatMap((y) => [Math.abs(y.ret), Math.abs(y.mdd)]), 1);
                  return yearly.map((y) => (
                    <MirrorRow
                      key={y.year}
                      label={`${y.year}`}
                      left={{ pct: halfSqrt(y.mdd, max), value: `${Math.round(y.mdd)}%`, color: DOWN_BAR[2], ink: DOWN }}
                      right={{
                        pct: halfSqrt(y.ret, max),
                        value: `${y.ret >= 0 ? "+" : "−"}${Math.abs(Math.round(y.ret))}%`,
                        color: y.ret >= 0 ? UP_BAR_SOFT : DOWN_BAR[2],
                        ink: y.ret >= 0 ? UP : DOWN,
                      }}
                    />
                  ));
                })(),
              )}
            </>
          ),
          /* "연 +20.8%" 는 연도별 수익률을 그냥 평균 낸 값으로 읽히기 쉬운데, riskProfile 이
             내는 건 시작가·끝가만 쓰는 복리 연평균(CAGR)이다. 삼성전자 10년으로 재면 산술
             평균 +25.6% vs CAGR +20.8% 로 4.8%p 갈린다. 어느 쪽인지 이름으로 밝힌다.

             '최악'은 뺐다. 그 값은 **조회 기간 전체**의 최대 낙폭(고점이 해를 넘어간다)인데
             바로 위 막대는 **그 해 안에서** 다시 잡은 고점 대비라, 한 상자에 잣대가 둘이었다.
             삼성전자 10년이면 −45.2%(2021-01-11 → 2024-11-14)라 적히는데 막대의 어느 해에도
             그만큼 깊은 해가 없어(가장 깊은 2024년이 −43.2%) 읽는 사람이 찾다 만다.
             기간 전체 최저점은 헤드라인 카드가 '기간 최저점'으로 이미 크게 적는다. */
          /* 여기만 fmtPct 를 안 쓴다. 그 함수는 부호(+/−)를 붙이는데, 뒤에 '수익/손실'을
             달면 "−6.0% 손실"이 되어 부호와 낱말이 같은 말을 두 번 한다. 꼼꼼히 읽는
             사람은 "손실이 마이너스면 이득인가" 하고 한 번 멈춘다. 낱말이 부호보다 빨리
             읽히니 낱말을 남기고 부호를 뺀다. */
          /* 비율("위험 1을 견딜 때 보상 0.89배")도, 이긴 해 수("10년 중 6년은 보상이
             낙폭보다 컸습니다")도 걷어냈다. 남은 건 두 수치를 그대로 말하는 한 문장이다.

             비율을 버린 이유. '배'는 사람들이 원금 배수를 말할 때 쓰는 낱말이라 1 미만이면
             **손해로 먼저 읽힌다.** 삼성전자 0.89배가 실제로 그렇게 읽혔다 — 그 10년에
             7.9배가 된 종목인데 "0.89배면 손해 아닌가"가 첫 반응이었다. 앞에 "복리로는"을
             붙여 기준을 밝혀도 숫자 생김새가 이긴다. 라벨로는 안 고쳐지는 종류다.

             이긴 해 수를 버린 이유. 0.89 는 복리(CAGR)로 낸 값인데 "6년은 컸다"는 해마다의
             단순 수익이라, 한 문장 안에서 잣대가 둘이었다. 변동이 크면 복리가 산술평균보다
             낮아 둘이 어긋난다(삼성전자 10년: 산술 29.7% vs CAGR 22.9% → 같은 분모로
             1.15 와 0.89). "6/10 인데 왜 0.89인가"에서 멈추는 자리가 정확히 여기였다.
             비율만 걷어내도 표면은 가려지지만, 두 창이 섞여 있다는 사실 자체는 남는다.

             수익은 머리 수치와 같은 소수 한 자리로 적는다. 반올림해 "23%"로 적으면 두 줄
             위 "22.9%"와 어긋나 같은 상자에서 숫자가 둘이 된다.

             부호(−/+)를 붙인다. 바로 위 머리 수치는 낱말('수익'·'평균 낙폭')이 방향을
             말하니 부호를 뺐지만, 여기는 두 수치가 한 문장에 붙어 흐르므로 눈이 훑을 때
             방향을 잡아 줄 표시가 따로 필요하다. '낙폭'·'벌었습니다'와 뜻이 겹치는 건
             알고 넣은 것이다. 마이너스는 house 글리프인 U+2212(−)를 쓴다 — fmtPct 와
             막대 라벨이 그것이고, ASCII 하이픈을 섞으면 폭·높이가 갈린다.

             ⚠️ 해마다의 승패는 이제 문장이 아니라 **막대와 전체보기**에만 있다. 이 각주를
             다시 손댈 때 그 둘을 같이 지우면 연도별 대비가 화면에서 통째로 사라진다. */
          foot: summary(
            r.annualReturn >= 0 && avgYearMdd < 0
              ? `최근 ${yrs}년 해마다 −${Math.abs(Math.round(avgYearMdd))}% 낙폭을 견디고 연 +${r.annualReturn.toFixed(1)}%를 벌었습니다`
              : `최근 ${yrs}년은 연평균(복리) ${Math.abs(r.annualReturn).toFixed(1)}% 손실이라 견딘 위험을 보상하지 못했습니다`,
          ),
          /* 막대는 자리 때문에 최근 RISK_ROWS 줄뿐인데 제목·요약은 조회 기간 전체를 말한다.
             나머지 해를 여기서 펼쳐, 적어 둔 기간에 실제로 닿게 한다. 펴는 것은 요약이 세는
             것과 **같은 목록**(scoped)이라, 손으로 세어 봐도 문장과 맞는다.

             막대가 이미 전부면(조회 기간이 짧아 잘릴 게 없으면) 버튼을 안 만든다. */
          more: scoped.length > yearly.length ? <YearsPopover years={scoped} label={`최근 ${yrs}년`} /> : null,
        };

  /* 2 — 하락 vs 회복 속도: 큰 하락마다 '빠지는 데'(왼쪽)와 '되돌아오는 데'(오른쪽).
         ⚠️ 기간은 33일 ~ 1,387일처럼 자릿수 차가 커서 선형 눈금이면 짧은 막대가 사라진다.
         제곱근 눈금을 쓰고 각주에 밝힌다(MirrorRow 주석 참고). */
  const tile2: TileBody =
    events.length === 0
      ? { head: null, viz: empty("큰 하락 표본이 얇습니다."), foot: null }
      : {
          head: (
            <TileHead
              items={[
                { value: r.dropDaysMedian !== null ? fmtDur(r.dropDaysMedian) : "—", label: "하락 기간 중앙값", tone: DOWN },
                { value: r.recoverDaysMedian !== null ? fmtDur(r.recoverDaysMedian) : "—", label: "회복 기간 중앙값", tone: UP },
              ]}
            />
          ),
          viz: (
            <>
              <Legend
                items={[
                  { label: "빠지는 데", background: DOWN_BAR[2] },
                  { label: "되돌아오는 데", background: UP_BAR_SOFT },
                  { label: "미회복", background: UNRECOVERED },
                ]}
              />
              <div style={{ margin: "11px 0 8px" }}>
                <MirrorAxis left="하락" right="회복" />
              </div>
              {rows(
                (() => {
                  const max = Math.max(...events.map((e) => Math.max(e.dropDays, e.recoverDays ?? 0)), 1);
                  return events.map((e, i) => (
                    <MirrorRow
                      key={i}
                      label={eventLabels[i]}
                      left={{ pct: halfSqrt(e.dropDays, max), value: fmtDur(e.dropDays), color: DOWN_BAR[2], ink: DOWN }}
                      right={{
                        // 미회복은 '지금까지 걸린 시간'이 아직 안 끝났다는 뜻이라 짧은 점선만 둔다.
                        pct: e.recoverDays === null ? 4 : halfSqrt(e.recoverDays, max),
                        value: e.recoverDays === null ? "미회복" : fmtDur(e.recoverDays),
                        color: UP_BAR_SOFT,
                        ink: e.recoverDays === null ? C.sub2 : UP,
                        dashed: e.recoverDays === null,
                      }}
                    />
                  ));
                })(),
              )}
            </>
          ),
          foot: summary(
            r.dropDaysMedian !== null && r.recoverDaysMedian !== null
              ? `보통 ${fmtDur(r.dropDaysMedian)} 빠지고 ${fmtDur(r.recoverDaysMedian)} 만에 되돌아왔습니다`
              : "되찾은 큰 하락 표본이 얇습니다",
          ),
        };

  /* 3 — 혼자 빠지나, 같이 빠지나: 큰 하락마다 이 종목과 코스피의 낙폭. */
  const tile3: TileBody =
    events.length === 0
      ? { head: null, viz: empty("큰 하락이 없었습니다."), foot: null }
      : !events.some((e) => e.market !== null)
        ? { head: null, viz: empty(`${benchName(market)} 데이터가 없습니다.`), foot: null }
        : {
            /* 양쪽 다 낙폭이라 **둘 다 파랑**이다 — 여기서 빨강을 쓰면 코스피 하락이
               회복으로 읽힌다. 어느 쪽인지는 명도로 가른다. */
            head: (
              <TileHead
                items={[
                  { value: `${r.bigDropCount}번`, label: "큰 하락", tone: DOWN },
                  { value: `${alone}번`, label: "이 종목만 빠짐", tone: C.ink },
                ]}
              />
            ),
            viz: (
              <>
                <Legend
                  items={[
                    { label: "이 종목", background: DOWN_BAR[0] },
                    { label: benchName(market), background: DOWN_BAR[3] },
                  ]}
                />
                <div style={{ margin: "11px 0 8px" }}>
                  <MirrorAxis left="이 종목" right={benchName(market)} />
                </div>
                {rows(
                  (() => {
                    const max = Math.max(...events.flatMap((e) => [Math.abs(e.stock), e.market !== null ? Math.abs(e.market) : 0]), 1);
                    return events.map((e, i) => (
                      <MirrorRow
                        key={i}
                        label={eventLabels[i]}
                        left={{ pct: half(e.stock, max), value: `${Math.round(e.stock)}%`, color: DOWN_BAR[0], ink: DOWN }}
                        right={{
                          pct: e.market === null ? 0 : half(e.market, max),
                          value: e.market === null ? "—" : `${Math.round(e.market)}%`,
                          color: DOWN_BAR[3],
                          ink: C.sub,
                        }}
                      />
                    ));
                  })(),
                )}
              </>
            ),
            foot: summary(
              r.withMarket === null
                ? `${benchName(market)} 데이터가 없습니다`
                : alone > 0
                  ? `${r.bigDropCount}번 중 ${alone}번은 이 종목만 빠졌습니다`
                  : `큰 하락 때마다 ${benchName(market)}도 함께 빠졌습니다`,
            ),
          };

  const tiles: { icon: string; label: string; sub: string; body: TileBody }[] = [
    { icon: "balance", label: "낙폭 대비 보상", sub: `감수한 위험만큼 돌려받았나${yearScope}`, body: tile1 },
    { icon: "speed", label: "하락 vs 회복 속도", sub: `빠지는 데 vs 되돌아오는 데${eventScope}`, body: tile2 },
    { icon: "sync", label: "혼자 빠지나, 같이 빠지나", sub: `큰 하락 때 ${benchName(market)}도 같이 빠졌나${eventScope}`, body: tile3 },
  ];

  return (
    <Sheet>
      <SectionHead
        icon="monitoring"
        title="리스크 프로필"
        desc="이 종목을 들고 있으면 어떤 위험을 감수하게 되는지, 세 가지 각도로 봅니다"
        note={periodLabel}
      />
      {/* 세 패널이 [머리말][큰 수치][막대][요약] 네 행을 공유한다(subgrid). 부제 길이가
          패널마다 달라 어떤 폭에서는 두 줄, 어떤 폭에서는 한 줄이 되는데, 패널마다 제
          높이를 쓰면 그만큼 막대 시작 줄이 어긋난다. 행을 공유해 구조로 맞춘다.
          ⚠️ minmax(min(280px,100%), 1fr) — 280px 를 그냥 두면 좁은 폭에서 트랙이
          컨테이너보다 넓어진다. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
          gridTemplateRows: "auto auto 1fr auto",
          alignItems: "stretch",
          // 아래 셀들이 긋는 마지막 줄 아랫선을 시트 밖으로 밀어 잘라낸다(위 히어로와 같은 짝).
          marginBottom: -1,
        }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              display: "grid",
              gridTemplateRows: "subgrid",
              gridRow: "span 4",
              rowGap: 0,
              padding: "18px 22px",
              minWidth: 0,
              // 오른쪽·아래 두 곳에 긋는다 — 좁은 폭에서 1열로 접히면 세로선은 시트
              // 테두리와 겹치고 패널 사이를 가르는 건 아랫선이다(히어로 cell 주석 참고).
              boxShadow: `inset -1px 0 0 ${C.line}, inset 0 -1px 0 ${C.line}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 13 }}>
              <Icon name={t.icon} style={{ fontSize: 17, color: C.muted, marginTop: 1, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "-.01em", color: C.ink, wordBreak: "keep-all" }}>{t.label}</span>
                <span style={{ fontSize: 11, lineHeight: 1.5, color: C.muted, wordBreak: "keep-all" }}>{t.sub}</span>
              </div>
            </div>
            <div style={{ marginBottom: 13 }}>{t.body.head}</div>
            <div>{t.body.viz}</div>
            {/* 요약과 전체보기가 한 줄을 나눠 쓴다. 팝오버가 이 칸 기준으로 위로 펴지므로
                relative 가 여기 있어야 한다(패널에 주면 요약 줄 위로 안 붙는다). */}
            {/* 요약은 폭을 가리지 않고 왼쪽이다(.mdd-tile-foot). '전체보기'가 있으면
                그것만 오른쪽 끝으로 밀린다. */}
            <div className="mdd-tile-foot" style={{ position: "relative", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.sheetRow}` }}>
              {/* foot 은 <p> 라 <span> 으로 감싸면 안 된다(span 은 phrasing content 만 받는다). */}
              <div style={{ minWidth: 0 }}>{t.body.foot}</div>
              {t.body.more}
            </div>
          </div>
        ))}
      </div>
      {/* 한 줄에 들어가야 바닥 띠가 39 로 선다. 보상이 조회 기간에 딸린다는 말은 패널
          제목 옆 괄호가 이미 하고 있어 여기서 뺐다. */}
      <Foot>
        파랑은 하락, 빨강은 회복·수익입니다. 큰 하락은 고점 대비 −20% 이상 기준이고 막대는 최근 {RISK_ROWS}건까지, 앞 두 패널은 제곱근 눈금입니다.
      </Foot>
    </Sheet>
  );
}

/* ── 원인 분해 ─────────────────────────────────────────────────── */
function Attribution({
  attr,
  stockName,
  themeName,
  themePeers,
  market,
}: {
  attr: Attribution;
  stockName: string;
  themeName: string | null;
  themePeers: string[];
  market: string | null;
}) {
  const rows: { label: string; v: number; self: boolean; color: string; help?: string }[] = [];
  if (attr.market !== null) rows.push({ label: benchName(market), v: attr.market, self: false, color: DOWN_BAR[4] });
  if (attr.theme !== null)
    rows.push({
      label: `${themeName ?? "테마"} 업종`,
      v: attr.theme,
      self: false,
      color: DOWN_BAR[2],
      // "○○ 업종"이 어떤 종목인지 툴팁으로 밝힌다 — 이 종목은 뺀 나머지 대표 종목 평균이다.
      help: themePeers.length ? `${themePeers.join(" · ")}. 이 테마 대표 종목의 평균입니다 (이 종목 제외).` : undefined,
    });
  rows.push({ label: stockName, v: attr.stock, self: true, color: DOWN_BAR[0] });
  const worst = Math.max(...rows.map((r) => Math.abs(r.v)), 1);

  /* 기준은 업종(없으면 시장). 종목이 기준보다 얼마나 더/덜 빠졌나.
     gap 이 음수면 종목이 더 빠진 것 = 설명되지 않는 초과낙폭.

     ⚠️ **gap 이 양수인 경우가 드물지 않다.** 업종보다 덜 빠진 종목이 절반쯤 되고
     (2026-08 실측: 삼성전자 −33.9% vs 반도체 −40.6%), 그때 '종목 탓 %'를 그대로 내면
     음수가 된다("종목 탓 −20%"). 비율 자체를 뒤집지 않고 **문장과 막대의 주인공을
     바꾼다** — 초과낙폭이 아니라 '덜 빠진 몫'을 말한다. */
  const bench = attr.theme ?? attr.market;
  const gap = bench !== null && attr.stock !== 0 ? attr.stock - bench : null;
  const excess = gap !== null && gap < 0;
  const benchLabel = attr.theme !== null ? "업종" : benchName(market);

  return (
    <Sheet>
      <SectionHead icon="call_split" title="시장 탓일까, 종목 탓일까" desc="지수·업종과 견줘 이 종목만의 낙폭이 얼마인지" note="같은 기간" />
      <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* 큰 수치는 **아래 각주·히어로 해설과 같은 값·같은 단위**여야 한다(2026-08-04).
            예전엔 여기만 '몫'(|gap| ÷ 자기 낙폭 = 14%)이라, 한 시트 안에서 14% 와 4.9%p 가
            같은 것을 말하는 듯 다르게 적혔다. 게다가 그 14% 는 아래 막대 어디에도 안 보이는
            숫자였다 — 지금 값(gap)은 업종 막대와 종목 막대의 차이로 눈에 그대로 잡힌다.

            단위는 %p 로 둔다. 두 낙폭률의 **차이**라 % 로 적으면 틀린 말이 된다
            (−38.7% 대비 −33.8% 는 '4.9% 덜'이 아니라 '12.7% 덜'이다).

            색은 온도색을 안 쓴다. 이 값은 오르내림이 아니라 '견줘서 얼마나 벌어졌나'인데
            34px 짜리 빨강이 경보처럼 읽혔다. 방향은 낱말('종목 탓'/'덜 빠진 폭')이 지고,
            온도색은 아래 막대와 각주가 맡는다. */}
        {gap !== null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <strong style={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1, color: C.ink }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{excess ? "종목 탓 " : "덜 빠진 폭 "}</span>
              {Math.abs(gap).toFixed(1)}
              <span style={{ fontSize: 17, fontWeight: 700 }}>%p</span>
            </strong>
            <span style={{ fontSize: 11.5, color: C.sub2 }}>{benchLabel} 평균보다 {excess ? "깊은" : "얕은"} 하락</span>
          </div>
        )}
        {/* 옆 시트(이 하락의 성격)에 맞춰 늘어나는데 여긴 막대 셋뿐이라 가운데가 빈다.
            줄 간격을 벌려 채우지는 않는다 — 길이를 견주는 차트라 막대끼리 멀어지면
            비교가 어려워진다. 묶음을 붙여 둔 채 남는 공간을 위아래로 가른다.
            (아래 결론 노트는 margin-top:auto 라 그대로 바닥에 붙는다.) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, justifyContent: "center" }}>
          {rows.map((r) => (
            // 고점 이후 수익률이라 시장·업종은 상승(+)일 수도 있다 — 그때만 빨강으로 가른다.
            <MeterRow
              key={r.label}
              label={r.label}
              pct={(Math.abs(r.v) / worst) * 100}
              value={fmtPct(r.v)}
              color={r.v >= 0 ? UP_BAR : r.color}
              ink={r.v >= 0 ? UP : DOWN}
              strong={r.self}
              help={r.help}
              labelWidth={82}
            />
          ))}
        </div>
        {/* 결론 노트는 **항상 시트 바닥**에 붙는다. 위 컨테이너에 flex:1 이 있어야
            margin-top:auto 가 먹는다(옆 시트에 맞춰 늘어난 만큼 아래가 비기 때문). */}
        {gap !== null && (
          <div style={{ marginTop: "auto", display: "flex", gap: 9, background: C.soft, borderRadius: 10, padding: "12px 13px" }}>
            <Icon name="bolt" style={{ fontSize: 15, color: C.hint, flex: "none", marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: C.inkSoft, wordBreak: "keep-all" }}>
              {excess ? (
                <>
                  시장·업종으로 설명되지 않는 <b style={{ fontWeight: 800, color: DOWN }}>{fmtPct(gap)}p</b>가 이 종목 고유의 낙폭입니다.
                </>
              ) : (
                <>
                  이 종목은 {benchLabel} 평균보다 <b style={{ fontWeight: 800, color: UP }}>{fmtPct(gap)}p</b> 덜 빠졌습니다. 하락은 대체로 {benchLabel} 전체가 함께 겪은 것입니다.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ── 회복까지 걸린 기간 ─────────────────────────────────────────── */
/**
 * 위: 회복 기간의 중앙값과 범위. 아래: 낙폭 구간별로 몇 번 있었나.
 *
 * ⚠️ 두 그래픽은 **서로 다른 표본**을 센다. 위는 `recovery.samples`(지금보다 깊었던
 * 사건만)이고 아래는 `analysis.depthBuckets`(−20% 이상 전부)다. 낙폭이 깊은 종목일수록
 * 위쪽 표본이 급격히 줄어드는데(SK하이닉스 −46%면 13건 중 2건), 아래쪽 분포까지 같이
 * 줄면 "이 정도 하락이 얼마나 흔한가"를 아예 못 그린다. 그래서 아래는 서버가 따로
 * 세어 보낸다(lib/mdd.ts 의 depthHistogram 주석 참고). 창이 다르니 화면에도 밝힌다.
 */
function Recovery({ a, periodLabel }: { a: MddAnalysis; periodLabel: string }) {
  const r = a.recovery!;
  /* 회복 표본이 하나면 중앙값 = 최단 = 최장이라 범위 선이 한 점으로 뭉갠다. 둘 이상일
     때만 선과 중앙값 마커를 둔다. 표본 하나는 곧 '회복한 전례가 한 번뿐'인 종목이다. */
  const hasRange = r.recoveredCount >= 2 && r.minDays !== null && r.maxDays !== null && r.maxDays > r.minDays;
  const sincePeak = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);

  const buckets = a.depthBuckets;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const inBucket = (b: DepthBucket) => a.currentDd <= b.from && (b.to === null || a.currentDd > b.to);
  const bucketLabel = (b: DepthBucket) => (b.to === null ? `${b.from}% 이하` : `${b.from} ~ ${b.to}%`);
  const here = buckets.find(inBucket);

  return (
    <Sheet>
      <SectionHead
        icon="schedule"
        title="회복까지 걸린 기간"
        desc="과거 사례로 본 회복 소요 기간"
        note={r.recoveredCount > 0 ? `표본 ${r.recoveredCount}회` : "전례 없음"}
      />

      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <strong style={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1, color: r.recoveredCount > 0 ? C.ink : DOWN }}>
            {r.recoveredCount > 0 ? fmtDur(r.medianDays!) : fmtDayCount(sincePeak)}
          </strong>
          <span style={{ fontSize: 11.5, color: C.sub2, wordBreak: "keep-all" }}>
            {r.recoveredCount === 0
              ? "째 회복 못 함 · 이만큼 깊게 빠진 뒤 되찾은 전례가 없습니다"
              : hasRange
                ? `중앙값 · 범위 ${fmtDur(r.minDays!)}~${fmtDur(r.maxDays!)}`
                : "고점을 되찾은 전례는 이 한 번뿐입니다"}
          </span>
        </div>
        {hasRange && <RecoveryRange min={r.minDays!} median={r.medianDays!} max={r.maxDays!} />}
      </div>

      {/* flex:1 + 가운데 정렬 — 옆 시트(역대 낙폭 Top 5)가 다섯 줄이라 이 시트가 그 높이로
          늘어나는데 여긴 네 줄뿐이다. 줄 간격을 벌려 채우지는 않는다(길이를 견주는 막대라
          서로 멀어지면 비교가 어려워진다). 묶음을 붙여 둔 채 남는 공간을 위아래로 가른다. */}
      <div style={{ flex: 1, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>낙폭 구간별 발생 횟수 · {periodLabel}</span>
        {buckets.map((b) => {
          const on = inBucket(b);
          return (
            <MeterRow
              key={b.from}
              label={bucketLabel(b)}
              pct={(b.count / maxCount) * 100}
              value={`${b.count}회`}
              color={on ? DOWN_BAR[0] : DOWN_BAR[3]}
              ink={DOWN}
              strong={on}
              labelWidth={74}
              valueWidth={26}
            />
          );
        })}
      </div>
      <Foot>
        {here && here.count > 0
          ? `지금 낙폭(${fmtPct(a.currentDd)})은 ${periodLabel} ${here.count}번이던 구간에 들어 있습니다`
          : `구간별 횟수는 −20% 이상 하락 ${buckets.reduce((s, b) => s + b.count, 0)}건 전부를 세지만, 위 중앙값은 지금보다 깊었던 ${r.similarCount}건만 씁니다`}
      </Foot>
    </Sheet>
  );
}

/** 최단~최장 범위 선 위에 중앙값 마커. 색은 회복이므로 빨강이다. */
function RecoveryRange({ min, median, max }: { min: number; median: number; max: number }) {
  const at = ((median - min) / (max - min)) * 100;
  const dot: React.CSSProperties = {
    position: "absolute",
    top: 2,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: C.card,
    border: `2px solid ${UP_BAR_SOFT}`,
    boxSizing: "border-box",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ position: "relative", height: 12 }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: 5, height: 2, borderRadius: 99, background: UP_BAR_SOFT }} />
        <span style={{ ...dot, left: 0 }} />
        <span style={{ ...dot, right: 0 }} />
        <span style={{ position: "absolute", left: `${at}%`, top: 0, width: 12, height: 12, marginLeft: -6, borderRadius: "50%", background: UP }} />
      </div>
      {/* 라벨은 양 끝을 안쪽으로 붙인다 — 중앙값이 끝에 가까우면 겹치지만, 셋 다 값이
          숫자로 적혀 있어 읽는 데 지장이 없다. */}
      <div style={{ position: "relative", height: 14 }}>
        <span style={{ position: "absolute", left: 0, top: 0, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.muted }}>{fmtDur(min)}</span>
        <span
          style={{
            position: "absolute",
            left: `${at}%`,
            top: 0,
            transform: "translateX(-50%)",
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 800,
            color: UP,
            whiteSpace: "nowrap",
          }}
        >
          중앙값 {fmtDur(median)}
        </span>
        <span style={{ position: "absolute", right: 0, top: 0, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.muted }}>{fmtDur(max)}</span>
      </div>
    </div>
  );
}

/* ── 이 하락의 성격 ─────────────────────────────────────────────── */
/* ch 가 null 이어도 카드를 지우지 않고 "왜 못 따지는지"를 남긴다.
   예전엔 통째로 숨겼는데, 문턱(−8%)이 절벽이라 카드가 깜빡였다 — KB금융은 −7.9% 라
   0.1%p 차이로 사라져서, 하루 사이 생겼다 없어졌다 하면 "어제 있던 게 왜 없지"가 된다.
   2열 그리드에서 짝이 어긋나 옆 카드 가운데가 텅 비던 것도 같이 사라진다. */
function Character({ ch, currentDd }: { ch: DrawdownCharacter | null; currentDd: number }) {
  if (!ch) return <CharacterAbsent currentDd={currentDd} />;
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
  // 하루 평균 낙폭 — "201일에 걸쳐 −42.5%"가 하루치로는 얼마인지.
  const perDay = ch.currentTroughDays > 0 ? ch.currentTroughDepth / ch.currentTroughDays : null;

  return (
    <Sheet>
      <SectionHead
        icon="bolt"
        title="이 하락의 성격"
        desc="같은 깊이라도 빨리 빠진 하락과 오래 흘러내린 하락은 회복 양상이 다릅니다"
        note={curLabel}
      />
      <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        {hasBuckets ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 10 }}>
            {tiles.map((t) =>
              t.b ? (
                /* 선택된 유형만 파란 틴트 + inset 링. 테두리 대신 inset box-shadow 를 쓰는
                   이유는 1.5px 링이 칸 크기를 바꾸지 않아 두 칸의 밑선이 어긋나지 않기
                   때문이다(테두리면 선택된 칸만 3px 커진다). */
                <div
                  key={t.label}
                  style={{
                    background: t.on ? C.blueTint : C.soft,
                    boxShadow: t.on ? `inset 0 0 0 1.5px ${DOWN_BAR[1]}` : "none",
                    borderRadius: R.control,
                    padding: "13px 14px",
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {/* 틴트 위에는 강조색(--c-blue)을 쓰지 않는다 — 명암비 2.2 라 안 읽힌다. */}
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: t.on ? DOWN : C.ink }}>{t.label}</span>
                    <span style={{ fontSize: 11, color: t.on ? C.sub : C.muted }}>· {t.b.count}회</span>
                  </div>
                  <span style={{ fontSize: 11, color: t.on ? C.sub : C.sub2 }}>{t.sub}</span>
                  <strong style={{ fontFamily: MONO, fontSize: 21, fontWeight: 800, letterSpacing: "-.03em", color: C.ink, marginTop: 2 }}>
                    {fmtDur(t.b.medianRecovery)}
                  </strong>
                  <span style={{ fontSize: 11, color: t.on ? C.sub : C.sub2 }}>회복 중앙값</span>
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <p style={{ margin: 0, color: C.muted, fontSize: 11.5, lineHeight: 1.6, wordBreak: "keep-all" }}>
            <Icon name="info" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} />
            이 기간엔 비교할 과거 하락이 부족합니다. 기간을 넓히면 급락형·완만형 회복을 비교할 수 있습니다.
          </p>
        )}
        <span style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.7, wordBreak: "keep-all" }}>
          지금은 <b style={{ fontWeight: 800, color: DOWN }}>{curLabel}</b>입니다. {fmtDayCount(ch.currentTroughDays)}에 걸쳐 {fmtPct(ch.currentTroughDepth)}
          {perDay !== null && <>, 하루 평균 {fmtPct(perDay)}</>}입니다.
          {compare && ` ${compare}`}
        </span>
        <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, paddingTop: 14, borderTop: `1px solid ${C.sheetRow}` }}>
          <StatCell label="하락 기간" value={fmtDayCount(ch.currentTroughDays)} sub="고점에서 저점까지" />
          <StatCell
            label="하락일 비중"
            value={ch.currentDownDayRatio !== null ? `${Math.round(ch.currentDownDayRatio)}%` : "—"}
            sub={ch.currentDownDayRatio !== null ? `10일 중 ${(ch.currentDownDayRatio / 10).toFixed(1)}일` : "표본 부족"}
          />
          <StatCell label="저점 깊이" value={fmtPct(ch.currentTroughDepth)} sub="고점 대비" tone={DOWN} />
        </div>
      </div>
      <Foot>고점→저점이 {CHARACTER_SPLIT_DAYS}일 이하면 급락형, 넘으면 완만형입니다. 비교 막대는 과거 −15% 이상 하락만 셉니다.</Foot>
    </Sheet>
  );
}

/** 성격을 못 따지는 경우의 같은 자리 시트. 문턱을 넘겼는지에 따라 이유가 다르다. */
function CharacterAbsent({ currentDd }: { currentDd: number }) {
  return (
    <AbsentSheet
      icon="bolt"
      title="이 하락의 성격"
      sub="같은 깊이라도 빨리 빠진 하락과 오래 흘러내린 하락은 회복 양상이 다릅니다"
      body={
        currentDd > -1
          ? "지금은 고점 부근이라 성격을 따질 하락이 없습니다."
          : `지금 하락은 ${fmtPct(currentDd)}입니다. 고점 대비 ${Math.abs(CHARACTER_MIN_DD)}% 이상 빠졌을 때부터 급락형과 완만형을 나눕니다. 이보다 얕은 눌림은 속도로 성격을 가리기 어렵습니다.`
      }
    />
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
    <Sheet>
      <SectionHead
        icon="hub"
        title={`${theme.name} 대표 ${theme.peers.length}종목 안에서`}
        desc={`${self.name}, ${lead}`}
        note={`평균 ${fmtPct(theme.avgDd)}`}
      />
      <div style={{ padding: "18px 22px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
        {theme.peers.map((p) => (
          // 이 종목만 진한 파랑, 나머지는 옅은 파랑 — 전부 낙폭이라 빨강은 쓰지 않는다.
          <MeterRow
            key={p.code || p.name}
            label={p.name}
            pct={(Math.abs(p.dd) / worst) * 100}
            value={`${Math.round(p.dd)}%`}
            color={p.isSelf ? DOWN_BAR[0] : DOWN_BAR[4]}
            ink={DOWN}
            strong={p.isSelf}
            valueWidth={46}
          />
        ))}
      </div>
    </Sheet>
  );
}

/* ── 역대 낙폭 Top 5 ─────────────────────────────────────────────
   표다. **낙폭 깊은 순**으로 세우고(이미 그렇게 정렬돼 온다), 진행 중인 구간은 순서상
   제자리에 두되 파랑으로 강조한다 — 맨 위로 끌어올리면 '가장 깊은 하락'이라는 순위의
   뜻이 깨진다. */
function TopDrawdowns({ eps }: { eps: Episode[] }) {
  const worst = Math.max(...eps.map((e) => Math.abs(e.depth)), 1);
  /* 열 폭은 .mdd-top-row(globals.css)가 잡는다. 인라인으로 두면 좁은 폭의 미디어쿼리를
     이겨서 열이 안 줄어든다. */
  return (
    <Sheet>
      <SectionHead icon="history" title="역대 낙폭 Top 5" desc="이만큼 빠졌던 구간과 회복까지 걸린 기간" note="−20% 이상" />
      <div className="hz-thead mdd-top-row">
        <span>구간</span>
        <span>낙폭</span>
        <span style={{ textAlign: "right" }}>회복</span>
        <span className="mdd-top-status" style={{ textAlign: "right" }}>
          상태
        </span>
      </div>
      {eps.map((e, i) => (
        <div key={i} className="hz-trow mdd-top-row" style={{ padding: "11px 22px", background: e.recovered ? undefined : C.soft }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: e.recovered ? 700 : 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fmtYm(e.peakDate)} ~ {e.recovered ? fmtYm(e.recoveryDate!) : "진행 중"}
            </span>
            {/* 이 줄도 말줄임을 걸어야 한다 — 안 걸면 "저점 2026-07-30"이 열보다 넓어
                부모를 밀어낸다(위 형제만 자르면 소용없다). */}
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              저점 {e.troughDate}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ flex: 1, minWidth: 20, height: 8, borderRadius: 99, background: C.track, overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  width: `${(Math.abs(e.depth) / worst) * 100}%`,
                  height: "100%",
                  borderRadius: 99,
                  background: e.recovered ? DOWN_BAR[2] : DOWN_BAR[0],
                }}
              />
            </span>
            <span style={{ width: 44, flex: "none", fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: e.recovered ? C.ink : DOWN }}>
              {fmtPct(e.depth)}
            </span>
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: e.recovered ? C.sub : C.muted, textAlign: "right" }}>
            {e.recovered ? fmtDayCount(e.days) : "—"}
          </span>
          <span className="mdd-top-status" style={{ fontSize: 11, fontWeight: e.recovered ? 700 : 800, color: e.recovered ? C.sub : DOWN, textAlign: "right" }}>
            {e.recovered ? "회복" : "진행 중"}
          </span>
        </div>
      ))}
      {/* 각주는 **한 줄 안에** 둔다 — 두 줄이 되면 이 시트의 바닥 띠만 두꺼워져 옆
          시트(회복까지 걸린 기간)와 밑단이 어긋난다. 지금 낙폭은 히어로가 이미 크게 적는다. */}
      <Foot>
        막대는 {eps.length}개 구간 공통 눈금(최대 {fmtPct(-worst)}) · 회복은 고점에서 되찾기까지 걸린 날수입니다
      </Foot>
    </Sheet>
  );
}

/* ── 보조 ─────────────────────────────────────────────────────── */
/**
 * 이 페이지의 **두 번째** 로딩이다. 첫 번째는 app/mdd/loading.tsx(라우트가 열릴 때까지),
 * 여기는 그 뒤 /api/mdd 로 낙폭을 받아올 때까지 — 그리고 종목·기간을 바꿀 때마다 다시 뜬다.
 *
 * 배지를 여기도 두는 이유: 둘은 회색 골격이 거의 똑같이 생겼는데 배지만 도중에 사라지면
 * **아직 오는 중인데 다 온 것처럼 보이는 구간**이 생긴다. 배지를 넣은 목적이 "멈춘 건지
 * 오는 중인지"를 가르는 것이었으니, 기다림이 더 긴 이쪽에 없으면 앞뒤가 안 맞는다.
 *
 * 문구는 **무엇이 바뀌어서 다시 뜨느냐로 갈린다**(Hun 결정, 2026-08-02).
 *  - 첫 진입 · 종목 변경 — "10년치 들춰보는 중". 종목이 바뀌면 그 종목의 시세를 처음부터
 *    들춰 오는 것이라 1단계와 같은 일이다. 특히 첫 진입은 1단계 배지 바로 뒤에 이어
 *    붙으므로 **글자 그대로 같아야 한다** — 다르면 1.5초 안에 글자가 갈아끼워져 진행이
 *    아니라 깜빡임으로 읽힌다.
 *  - 기간 변경 — "고점부터 되짚는 중". 종목은 그대로고 창만 달라져 고점을 다시 잡는
 *    일이라 말이 다르다. 1년·3년을 골라 놓고 "10년치"라고 하면 거짓말이 되기도 한다.
 *
 * 가르는 값은 `data` 유무가 아니라 **조작 자체**다(아래 onSelect/onYears). 종목과 기간을
 * 구분해야 하는데 결과 유무로는 둘이 같아 보인다.
 */
function Skeleton({ periodOnly }: { periodOnly: boolean }) {
  // 실제 결과와 같은 골격(히어로 스트립 + 전폭 차트 + 50:50 짝)으로 깜빡여, 로딩 뒤
  // 레이아웃이 튀지 않는다.
  const block = (h: number) => <div className="hz-shimmer" style={{ height: h, borderRadius: 8, background: C.bg }} />;
  const body = (children: React.ReactNode) => (
    <div style={{ padding: PAD, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
  );
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-hidden>
        <section className="hz-sheet" style={{ display: "flex", flexWrap: "wrap" }}>
          {[290, 300, 300].map((basis, i) => (
            <div key={i} style={{ flex: `1 1 ${basis}px`, minWidth: 0, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {block(14)}
              {block(38)}
              {block(48)}
            </div>
          ))}
        </section>
        <section className="hz-sheet">{body(block(201))}</section>
        <div className="mdd-pair">
          {[0, 1].map((i) => (
            <section key={i} className="hz-sheet">
              {body(
                <>
                  {block(16)}
                  {block(112)}
                </>,
              )}
            </section>
          ))}
        </div>
      </div>

      <div className="hz-loading-float" aria-hidden>
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
          {periodOnly ? "고점부터 되짚는 중" : "10년치 들춰보는 중"}
        </span>
      </div>

      {/* 화면에는 안 보이고 스크린리더에만 읽힌다(전용 유틸 클래스가 레포에 없어 인라인).
          종목·기간을 바꿀 때마다 다시 마운트되므로 바뀐 것도 그때그때 읽힌다. */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        낙폭을 계산하는 중입니다.
      </span>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Sheet>
      <div style={{ padding: PAD, display: "flex", alignItems: "center", gap: 10, color: C.sub, fontSize: 13 }}>
        <Icon name="error_outline" style={{ fontSize: 20, color: C.mania }} />
        {message}
      </div>
    </Sheet>
  );
}

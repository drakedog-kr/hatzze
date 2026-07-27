"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CHARACTER_MIN_DD } from "@/lib/mdd";
import type { DrawdownCharacter, DrawdownPoint, Episode, MddAnalysis, RiskProfile as RiskProfileData } from "@/lib/mdd";
import { track } from "@/lib/ga";
import { C, Icon, MONO } from "../ui";
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
const fmtWon = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
/** 기간을 사람 단위로 짧게. 카드 안 큰 숫자는 이 형식으로 통일한다(1,733일 → 4.7년). */
const fmtDur = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)}년` : d >= 45 ? `${Math.round(d / 30)}개월` : `${Math.round(d)}일`);
const fmtDayCount = (d: number) => `${Math.round(d).toLocaleString("ko-KR")}일`;
/** 차트 축 라벨용 연·월. "2017-11-24" → "2017-11".
 *  연도를 두 자리로 줄이면("17-11") 연-월인지 월-일인지 분간이 안 된다. */
const fmtYm = (date: string) => date.slice(0, 7);

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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.ink }}>MDD 정밀분석</h1>
          <div style={{ height: 1, flex: 1, background: C.line }} />
        </div>
        <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 14, lineHeight: 1.6 }}>
          종목이 고점에서 <b style={{ color: C.ink }}>얼마나 빠졌는지</b>, 이만큼 빠진 적이 <b style={{ color: C.ink }}>얼마나 드문지</b>, 과거엔 회복까지 <b style={{ color: C.ink }}>얼마나 걸렸는지</b>를 봅니다.
        </p>
      </header>

      <Controls stocks={stocks} selected={selected} onSelect={setSelected} years={years} onYears={setYears} suggestions={suggestions} />

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
        <span style={{ fontSize: 11, fontWeight: 600, color: C.faint, whiteSpace: "nowrap" }}>{hint}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((s, i) => (
          <li key={s.code}>
            <button
              onClick={() => onPick(s)}
              className="hz-row-link"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 10px",
                border: "none",
                background: "transparent",
                borderRadius: 8,
                cursor: "pointer",
                color: C.ink,
                fontSize: 14,
                textAlign: "left",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint, width: 12, flexShrink: 0 }}>{i + 1}</span>
              <StockLogo code={s.code} name={s.name} market={s.market} />
              <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              {/* 코스닥은 표시해 준다 — 검색 목록에는 코스피만 있어서, 여기서만 만날 수 있는 종목이다. */}
              {s.market === "KOSDAQ" && (
                <span style={{ fontSize: 10, fontWeight: 600, color: C.faint, background: C.bg, padding: "2px 5px", borderRadius: 4, flexShrink: 0 }}>
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
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => track("mdd_search", { query: q, matches: matches.length }), 800);
    return () => clearTimeout(timer);
  }, [query, matches.length]);

  const pick = (s: StockOption) => {
    // 파라미터 이름을 stock_* 으로 붙인다. GA4 의 맞춤 측정기준은 이벤트가 아니라
    // 속성 전체에서 이름 하나를 공유하므로, code/name 처럼 흔한 이름을 쓰면 나중에
    // 다른 이벤트가 같은 이름을 다른 뜻으로 보낼 때 한 측정기준에 섞인다.
    track("mdd_stock_select", { stock_code: s.code, stock_name: s.name });
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
              maxHeight: 420,
              overflowY: "auto",
            }}
          >
            {showSuggest ? (
              <>
                {/* 두 묶음 사이는 넉넉히 벌린다. 붙여 두면 아래 묶음의 제목이 위 묶음의
                    마지막 줄처럼 읽혀서 어디까지가 '급부상'인지 헷갈린다. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <SuggestSection title="급부상 종목" hint="평소 대비 언급 급증" items={suggest.surging} onPick={pick} />
                  <SuggestSection title="주요 종목" hint="최근 주목도 상위" items={suggest.report} onPick={pick} />
                </div>
                <p style={{ margin: "10px 10px 2px", fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
                  텔레그램에서 많이 언급된 종목입니다. 매수·매도 신호가 아닙니다.
                </p>
              </>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {matches.map((s) => (
                  <li key={s.code}>
                    <button
                      onClick={() => pick(s)}
                      className="hz-row-link"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 10px", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: C.ink, fontSize: 14, textAlign: "left" }}
                    >
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>{s.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 기간 토글 — 낱개 알약 5개 대신 하나의 세그먼티드 컨트롤로 묶는다(한 덩어리로 읽힘). */}
      <div style={{ display: "flex", gap: 2, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 999, padding: 3 }}>
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
              style={{
                padding: "7px 15px",
                borderRadius: 999,
                border: "none",
                background: on ? C.card : "transparent",
                color: on ? C.blue : C.sub,
                fontSize: 13,
                fontWeight: 700,
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
      {/* 카드는 데이터가 없어도 자리를 지킨다 — 이유는 AbsentCard 주석 참고.
          full/half 칸 수도 그대로 유지해야 2열 짝이 안 어긋난다. */}
      <div className="mdd-full">
        {data.risk ? (
          <RiskProfile r={data.risk} />
        ) : (
          <AbsentCard
            icon="insights"
            title="리스크 프로필"
            sub="이 종목을 들고 있으면 어떤 위험을 감수하게 되는지, 세 가지 각도로 봅니다."
            body="상장한 지 얼마 되지 않아 연도별 성적과 큰 하락을 낼 만큼 이력이 쌓이지 않았습니다."
          />
        )}
      </div>
      {data.attribution ? (
        <Attribution
          attr={data.attribution}
          themeName={data.theme?.name ?? null}
          themePeers={data.theme?.peers.filter((p) => !p.isSelf).map((p) => p.name) ?? []}
          athDate={a.athDate}
        />
      ) : (
        <AbsentCard
          icon="call_split"
          title="이 하락, 시장 탓일까 종목 탓일까"
          sub="고점 이후 같은 기간을 시장·테마와 나란히 놓고 비교합니다."
          body={
            a.currentDd > -1
              ? "지금은 고점 부근이라 원인을 나눌 하락이 없습니다."
              : `고점(${a.athDate}) 무렵의 코스피·테마 기록이 없어 같은 기간을 나란히 놓지 못했습니다.`
          }
        />
      )}
      <Character ch={a.character} currentDd={a.currentDd} />
      {a.recovery ? (
        <Recovery a={a} />
      ) : (
        <AbsentCard
          icon="history"
          title="회복까지 걸린 시간"
          sub="과거 이만큼 빠졌을 때 고점을 되찾기까지 걸린 기간입니다."
          body="지금은 고점 부근이라 회복을 기다릴 하락이 없습니다."
        />
      )}
      {a.topDrawdowns.length > 0 ? (
        <TopDrawdowns eps={a.topDrawdowns} />
      ) : (
        <AbsentCard
          icon="leaderboard"
          title="역대 낙폭 Top 5"
          sub="이 기간에 가장 깊었던 하락과, 고점을 되찾기까지 걸린 시간입니다."
          body="이 기간엔 순위를 매길 만한 하락이 없었습니다. 기간을 넓히면 더 나올 수 있습니다."
        />
      )}
      <div className="mdd-full">
        {data.theme ? (
          <Theme theme={data.theme} />
        ) : (
          <AbsentCard
            icon="hub"
            title="테마 비교"
            sub="같은 테마 대표 종목들과 지금 낙폭을 나란히 놓습니다."
            body="이 종목이 묶인 테마를 찾지 못했습니다. 테마 대표 종목 목록에 등록된 종목에서만 비교가 나옵니다."
          />
        )}
      </div>
    </div>
  );
}

/* ── 공통 프리미티브 ───────────────────────────────────────────────
   카드마다 제각각이던 머리·타일·막대를 셋으로 통일한다. 페이지 전체가 같은
   리듬(파란 아이콘 → 제목 → 한 줄 설명 → 데이터)으로 읽히게 하는 게 목적이다. */

// padding 은 폭에 따라 24 → 18 (globals.css 의 --hz-card-pad).
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: "var(--hz-card-pad)", minWidth: 0 };

/** 카드 머리 — 시장 브리핑(TitleRow)·카더라(SectionHead)와 같은 구조. 아이콘은 파랑 고정. */
function CardHead({ icon, title, sub, right }: { icon: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink, display: "flex", alignItems: "center", gap: 10, lineHeight: 1.25 }}>
          <Icon name={icon} style={{ fontSize: 22, color: C.blue, flexShrink: 0 }} />
          <span style={{ wordBreak: "keep-all" }}>{title}</span>
        </h2>
        {sub && <p style={{ margin: "7px 0 0", fontSize: 12.5, color: C.sub, lineHeight: 1.55, wordBreak: "keep-all" }}>{sub}</p>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

/**
 * 데이터가 없어 본문을 못 채우는 카드의 공통 껍데기.
 *
 * 카드를 통째로 숨기지 않는다. 종목을 바꿀 때마다 격자에서 카드가 빠지면 (1) 2열 짝이
 * 어긋나 옆 카드 가운데가 텅 비고, (2) 문턱이 절벽이라 카드가 깜빡인다 — 성격 카드는
 * −8% 문턱이라 KB금융(−7.9%)이 0.1%p 차이로 사라져, 하루 사이 생겼다 없어지면
 * "어제 있던 게 왜 없지"가 된다. 자리를 지키고 왜 못 보여주는지를 적는다.
 */
function AbsentCard({ icon, title, sub, body }: { icon: string; title: string; sub: string; body: string }) {
  return (
    <section style={card}>
      <CardHead icon={icon} title={title} sub={sub} />
      <p style={{ margin: 0, color: C.muted, fontSize: 12.5, lineHeight: 1.7, wordBreak: "keep-all" }}>
        <Icon name="info" style={{ fontSize: 14, verticalAlign: -2, marginRight: 4 }} />
        {body}
      </p>
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "blue" | "warn" }) {
  const bg = tone === "blue" ? "var(--c-blue-tint)" : tone === "warn" ? "var(--c-mania-tint, rgba(220,80,80,.12))" : C.bg;
  const fg = tone === "blue" ? C.blue : tone === "warn" ? C.mania : C.sub;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" }}>
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
      <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", color, lineHeight: 1.15 }}>{value}</div>
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
  dim = !strong,
}: {
  label: string;
  pct: number;
  value: string;
  color: string;
  strong?: boolean;
  help?: string;
  labelWidth?: number;
  /** 강조색(cold/mania)을 옅게 깔아 자기 종목 줄만 튀게 하는 장치. 색 자체가 이미
   *  중립색(C.bar)이면 여기서 또 반투명을 먹이면 트랙에 묻으니 끈다. */
  dim?: boolean;
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
        <span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: color, opacity: dim ? 0.5 : 1, borderRadius: 999 }} />
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
        {/* 로고는 글자 기준선(baseline)이 아니라 가운데에 맞아야 해서 이 줄만 center 로
            둔다. baseline 이면 정사각형 타일이 글자 밑선에 걸려 위로 떠 보인다. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StockLogo code={data.code} name={data.name} market={data.market} size={30} />
          <span style={{ fontSize: 21, fontWeight: 700, color: C.ink }}>{data.name}</span>
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
          <span style={{ fontFamily: MONO, fontSize: 54, fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.035em", color: atHigh ? C.ink : C.cold }}>
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
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub }}>고점 대비 낙폭 추이</span>
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
      {/* overflow:visible — 최저점 표시가 하필 마지막 지점일 때(지금이 역대 최저인
          종목) 뷰박스 오른쪽 끝에 놓여 기본값(hidden)이면 반지름만큼 잘린다. 뷰박스를
          넓히는 대신 넘침만 허용한다 — 넓히면 아래 크로스헤어 띠(퍼센트로 잡은 위치)가
          곡선과 어긋난다. */}
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
        <path d={area} fill={C.cold} fillOpacity="0.14" />
        <path d={line} fill="none" stroke={C.cold} strokeWidth="1.6" strokeLinejoin="round" />
        {/* 기간 최저점 표시. 현재 지점에도 속 찬 점을 찍었었는데 뺐다 — 선이 끝나는
            자리가 곧 현재이고, 그 값은 헤드라인(고점 대비 −31.2%)이 이미 크게 말한다.
            오른쪽 끝에 점 하나가 더 있으면 눈만 끌 뿐이었다. */}
        <circle cx={x(ti)} cy={y(series[ti].dd)} r="3.5" fill={C.card} stroke={C.cold} strokeWidth="1.6" />
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
          // 툴팁이 넓어서(날짜·가격·낙폭) 가운데 정렬이면 끝쪽 지점에서 컨테이너를
          // 벗어난다 — 오른쪽으로 벗어나면 페이지에 가로 스크롤까지 생긴다.
          // 경계를 15/85 에서 25/75 로 넓혔다. 모바일에선 카드가 285px 로 좁아져 툴팁이
          // 폭의 3/4를 차지하는 탓에, 85% 를 안 넘는 지점(실측 0.78)도 화면 밖으로 나갔다.
          // 안쪽으로 열리는 구간이 넓어져도 넓은 화면에선 툴팁이 살짝 옆으로 붙을 뿐이다.
          const at = n <= 1 ? 0 : i / (n - 1);
          const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
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

  // 범례는 막대 두 줄이 각각 뭔지 알려주는 유일한 단서다 — 이걸 못 읽으면 타일이
  // 통째로 안 읽힌다. sub(11px)로는 타일 배경 위에서 흐려서 ink-soft 로 한 단계 올린다.
  const legend = (items: { label: string; color: string; opacity?: number }[]) => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--c-ink-soft)" }}>
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
    <div key={key} style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr)", alignItems: "center", gap: 8 }}>
      {/* 연도는 이 줄이 언제 얘기인지를 말하는 축이라 faint 로는 흐리다. muted 로는 부족했다 —
          라이트에서 명암비가 2.59 → 2.96 으로 거의 안 움직인다(두 토큰이 라이트에선 붙어
          있다). sub 까지 올려야 3.30/7.32 로 실제로 한 단계 밝아진다. 범례(ink-soft)보다는
          여전히 한 단계 아래라 위계는 그대로다. */}
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub }}>{year}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[a, b].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ display: "block", flex: 1 }}>
              <span style={{ display: "block", height: 6, width: `${Math.max(2, Math.min(100, s.pct))}%`, background: s.color, opacity: s.opacity, borderRadius: 999 }} />
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: C.sub, width: 42, textAlign: "right" }}>{s.value}</span>
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
          { label: "코스피", color: C.bar },
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
                  color: C.bar,
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
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3, wordBreak: "keep-all" }}>{t.label}</span>
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
    <section style={{ ...card, display: "flex", flexDirection: "column" }}>
      <CardHead
        icon="call_split"
        title="이 하락, 시장 탓일까 종목 탓일까"
        sub={`고점(${athDate}) 이후 ${attr.sincePeakDays.toLocaleString("ko-KR")}일, 같은 기간을 나란히 놓고 비교합니다.`}
      />
      <p style={{ margin: "0 0 16px", color: C.ink, fontSize: 15, fontWeight: 600, lineHeight: 1.6, wordBreak: "keep-all" }}>{verdict}</p>
      {/* 옆 카드(이 하락의 성격)에 맞춰 늘어나는데 여긴 막대 셋뿐이라 바닥이 비었다.
          줄 간격을 벌려 채우지는 않는다 — 이건 목록이 아니라 길이를 견주는 차트라,
          막대가 서로 멀어지면 비교가 어려워진다. 묶음을 붙여 둔 채 세로 가운데로 둬
          남는 공간이 위아래로 갈리게 한다. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, justifyContent: "center" }}>
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
/* 줄 레이아웃 = [날짜칸] gap [막대 트랙] gap [값칸]. 중앙값 눈금이 트랙 위에 절대배치로
   얹히면서 같은 폭을 다시 쓰기 때문에 상수로 묶는다. 예전엔 grid 문자열에 박아 두고
   눈금 쪽에 51/71 을 손으로 적어 놨는데, 날짜칸을 넓히자(42→50) 눈금만 8px 어긋나
   막대가 선을 넘어 보였다. */
const REC_DATE_W = 50;
const REC_VALUE_W = 62;
const REC_GAP = 9;
/* 막대의 최소 폭. 눈금도 같은 하한을 쓴다 — 중앙값이 이 폭 안쪽에 떨어지는 종목
   (KB금융처럼 최장 표본이 중앙값의 30배가 넘는 경우)에서 눈금만 막대 뭉치 안에
   박혀 모든 막대가 선을 넘어 보이던 것을 막는다. */
const REC_BAR_MIN_W = 18;

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

  // 눈금 상한은 표본 중 가장 긴 기간. 미회복 건은 '지금까지 걸린 시간'이라 같은 축에 놓인다.
  const longest = Math.max(1, ...r.samples.map((s) => s.days));

  /* 제곱근 눈금. 선형으로 그리면 최장 표본 하나가 축을 다 먹는다 — KB금융은 6.1년 한 건
     때문에 나머지 13건(11일~5개월)이 전부 최소 폭 18px 에 붙어 버려 서로 구분이 안 됐다.
     제곱근은 짧은 쪽을 벌리면서 순서와 "길수록 오래"라는 직관을 지킨다(로그와 달리
     0 근처가 발산하지 않는다). 대신 길이 비율은 실제 비율보다 눌리므로, 정확한 값은
     오른쪽 숫자로 읽게 하고 카드 아래에 그렇게 적어 둔다. */
  const barPct = (days: number) => Math.sqrt(days / longest) * 100;

  return (
    <section style={{ ...card, display: "flex", flexDirection: "column" }}>
      <CardHead
        icon="history"
        title="회복까지 걸린 시간"
        sub={`지금(${fmtPct(a.currentDd)}) 이상 빠졌던 ${r.similarCount}번 중 ${r.recoveredCount}번이 고점을 되찾았습니다.`}
      />
      {/* 예전엔 최단·중앙값·최장·미회복을 타일 네 개로만 뒀는데, 숫자 넷으로는 "4.7년"이
          유난히 길었던 한 번인지 늘 그 정도인지 알 수 없었다(카드도 아래가 비었다).
          회차별 막대로 분포를 그리고, 중앙값을 세로선으로 얹어 기준을 준다. */}
      {/* 옆 카드(역대 낙폭 Top 5)가 5줄이라 이 카드가 그 높이로 늘어나는데 표본은 보통
          3~4건이다. 원인 분해 카드와 같은 이유로 간격을 벌리지 않고 묶음을 가운데 둔다 —
          회차별 길이를 견주는 차트라 막대끼리 붙어 있어야 읽힌다. 범례·중앙값 선도 이
          안쪽 묶음에 넣어야 막대와 같이 움직인다(밖에 두면 선이 차트 위아래로 삐져나온다). */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* 리스크 프로필 범례와 같은 위계로 맞춘다(ink-soft) — 두 카드가 같은 성격의
            범례를 다른 밝기로 쓰면 한쪽이 덜 중요한 것처럼 읽힌다. */}
        <div style={{ display: "flex", gap: 14, marginBottom: 12, fontSize: 11, color: "var(--c-ink-soft)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C.cold }} />
            고점 되찾음
          </span>
          {r.unrecoveredCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: C.mania }} />
              아직 회복 못 함
            </span>
          )}
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 9 }}>
        {r.samples.map((s) => (
          <div key={s.peakDate} style={{ display: "grid", gridTemplateColumns: `${REC_DATE_W}px minmax(0,1fr) ${REC_VALUE_W}px`, alignItems: "center", gap: REC_GAP }}>
            {/* 리스크 프로필의 연도 축과 같은 밝기(sub)로 맞춘다. */}
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub, whiteSpace: "nowrap" }}>{fmtYm(s.peakDate)}</span>
            {/* 껍데기를 둘로 나눈다. 툴팁(.hz-tip::after)은 position:absolute; bottom:100% 로
                요소 박스 '바깥 위쪽'에 그려지는데, 막대 둥근 모서리를 자르는 overflow:hidden 이
                같은 요소에 있으면 툴팁이 통째로 잘려 영영 안 보인다(커서만 물음표로 바뀌어
                있지도 않은 설명을 약속한다). 바깥은 툴팁 기준점, 안쪽은 클리핑 담당. */}
            <span
              className="hz-tip hz-tip-wide hz-tip-end"
              data-tip={`${s.peakDate} 고점에서 ${fmtPct(s.depth)}까지 빠졌고, ${s.recovered ? `${fmtDayCount(s.days)} 만에 고점을 되찾았습니다` : `${fmtDayCount(s.days)}째 회복 중입니다`}.`}
              style={{ display: "block" }}
            >
              <span style={{ display: "block", height: 10, background: C.bg, borderRadius: 999, overflow: "hidden" }}>
                {/* minWidth 18px — 36일 vs 4.7년처럼 차이가 크면 비율만으로는 폭이 몇 px 라
                    둥근 모서리에 먹혀 점 하나처럼 보인다(렌더 오류로 오해하기 쉽다).
                    높이(10)보다 넉넉히 넓어야 원이 아니라 짧은 막대로 읽힌다. */}
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${barPct(s.days)}%`,
                    minWidth: REC_BAR_MIN_W,
                    background: s.recovered ? C.cold : C.mania,
                    borderRadius: 999,
                  }}
                />
              </span>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, textAlign: "right", color: s.recovered ? C.sub : C.mania }}>
              {fmtDur(s.days)}
            </span>
          </div>
        ))}
        {/* 중앙값 눈금 — 막대 칸(가운데 트랙)에만 걸치도록 좌우 여백을 맞춘다.
            트랙의 좌우 바깥은 [날짜칸 + gap] 과 [값칸 + gap] 이다. */}
        <div style={{ position: "absolute", left: REC_DATE_W + REC_GAP, right: REC_VALUE_W + REC_GAP, top: 0, bottom: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              left: `max(${REC_BAR_MIN_W}px, ${barPct(r.medianDays!)}%)`,
              top: -4,
              bottom: -4,
              width: 1,
              background: C.faint,
            }}
          />
        </div>
        </div>
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        회복한 {r.recoveredCount}번의 중앙값은 <b style={{ color: C.sub }}>{fmtDur(r.medianDays!)}</b>(세로선), 가장 빠른 때가{" "}
        <b style={{ color: C.sub }}>{fmtDur(r.minDays!)}</b>, 가장 오래 걸린 때가 <b style={{ color: C.sub }}>{fmtDur(r.maxDays!)}</b>였습니다.
        {" "}막대 길이는 짧은 기간도 구분되도록 눌러 그렸으니 정확한 값은 오른쪽 숫자로 보십시오.
      </p>
    </section>
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
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.on ? C.blue : C.ink }}>{t.label}</span>
                    <span style={{ fontSize: 11.5, color: C.faint }}>· {t.b.count}회</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 8 }}>{t.sub}</div>
                  <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.15 }}>
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

/** 성격을 못 따지는 경우의 같은 자리 카드. 문턱을 넘겼는지에 따라 이유가 다르다. */
function CharacterAbsent({ currentDd }: { currentDd: number }) {
  return (
    <AbsentCard
      icon="bolt"
      title="이 하락의 성격"
      sub="같은 깊이라도 빨리 빠진 하락과 오래 흘러내린 하락은 회복 양상이 다릅니다."
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
            color={p.isSelf ? C.cold : C.bar}
            strong={p.isSelf}
            dim={false}
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
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: i === 0 ? C.cold : C.faint }}>{i + 1}</span>
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
            <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: C.cold, textAlign: "right" }}>
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

"use client";

// 종목 검색·기간 고르기·추천 종목. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import { useEffect, useMemo, useRef, useState } from "react";
import { gaSearchTerm, gaStockCode, track } from "@/lib/ga";
import { C, Icon, MONO } from "../ui";
import { SectionIntro } from "../SectionIntro";
import { StockLogo } from "../StockLogo";
import { PERIODS, marketBadge, benchName } from "./shared";
import type { StockOption, Suggestion, SuggestGroups, MddResult } from "./shared";
import { periodLabelOf, AbsentSheet } from "./sheet";
import { HeroStrip, Underwater } from "./Hero";
import { RiskProfile } from "./RiskProfile";
import { Attribution, Recovery, Character, Theme, TopDrawdowns } from "./sheets";

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
    // 별칭(미국 정식 영문명)은 국내 종목엔 없다 — 아래 판정이 통째로 건너뛴다.
    // ⚠️ SEC 표기는 회사 형태가 꼬리에 붙는다("Tesla, Inc." · "NVIDIA CORP").
    //    그래서 **접두일치**가 실제로 걸리는 경로다("tesla" → "tesla, inc.").
    const alias = (s.alias ?? "").toLowerCase();
    let tier: number;
    if (name === q || code === q || alias === q) tier = 0;
    else if (name.startsWith(q)) tier = 1;
    else if (code.startsWith(q)) tier = 2;
    // 별칭 접두일치는 코드 접두일치 **다음**이다. "TS" 를 치면 티커 TSLA·TSM 이
    // "Taiwan Semiconductor…" 보다 먼저 와야 한다 — 티커가 더 짧고 정확한 신호다.
    else if (alias.startsWith(q)) tier = 2.5;
    else if (name.includes(q)) tier = 3;
    else if (alias.includes(q)) tier = 3.5;
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
        <h3 style={{ margin: 0, fontSize: "var(--fs-13)", fontWeight: 700, color: C.ink }}>{title}</h3>
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>{hint}</span>
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
                fontSize: "var(--fs-14)",
                textAlign: "left",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", color: C.muted, width: 12, flexShrink: 0 }}>{i + 1}</span>
              <StockLogo code={s.code} name={s.name} market={s.market} />
              <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              {/* 코스피가 아닌 것만 표시한다. 코스닥은 검색 목록에 없어 여기서만 만나고,
                  미국은 이름만으로는 국내 종목과 구별이 안 된다("애플"·"메타").

                  ⚠️ 배경이 --c-bg(화면 바닥)였다. 라이트에서는 흰 카드와 1.05 라 칩이
                  아예 안 보였고, **다크에서는 뜨는 판(--c-float #2c2c35)보다 어두워서
                  (#101013) 알약이 아니라 판에 뚫린 구멍처럼 보였다.** 라이트에서 두 값이
                  거의 같아 여태 안 드러났던 것이다. 회색 알약은 --c-chip 이 제 값이다
                  (다크에서 판보다 한 단 밝다). 글자도 같이 --c-sub 로 올린다 — chip 위
                  4.55/4.98 로 AA 를 넘고, muted 였으면 3.8 로 떨어졌다. */}
              {marketBadge(s.market) && (
                <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub, background: C.chip, padding: "2px 5px", borderRadius: 4, flexShrink: 0 }}>
                  {marketBadge(s.market)}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: "var(--fs-12)", fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>{s.note}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── 조회 바: 종목 검색 + 기간 토글 ─────────────────────────────── */
export function Controls({
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
          <Icon name="search" style={{ fontSize: "var(--fs-20)", color: focused ? C.blue : C.sub }} />
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
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: C.ink, fontSize: "var(--fs-15)", minWidth: 0 }}
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
              /* 14 였다. 2026-09-04 눈금 재정렬에서 카드 16 · 타일/오버레이 12 로 통일했다 —
                 토스 실측이 카드 16 다수, 컨트롤 10~12 다. 14 는 어느 쪽도 아니었다. */
              borderRadius: 12,
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
                <p style={{ margin: "10px 10px 2px", fontSize: "var(--fs-11)", color: C.muted, lineHeight: 1.5 }}>
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
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 10px", border: "none", borderRadius: 8, cursor: "pointer", color: C.ink, fontSize: "var(--fs-14)", textAlign: "left" }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </span>
                        {marketBadge(s.market) && (
                          <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub, background: C.chip, padding: "2px 5px", borderRadius: 4, flexShrink: 0 }}>
                            {marketBadge(s.market)}
                          </span>
                        )}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", color: C.muted, flexShrink: 0 }}>{s.code}</span>
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
                fontSize: "var(--fs-11-5)",
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
/* 구간 제목. 설명은 달지 않는다 — **하는 일은 이름 짓기가 아니라 박자 만들기**다
   (insider 의 GroupTitle 주석과 같은 판단). 아래 시트마다 제목과 부제가 이미 있어서,
   그 위에 또 한 줄을 얹으면 같은 말이 두 번 난다. 생김새는 공용 SectionIntro 다.
   `n` 은 장 번호다 — 이 화면은 두 장이라 01·02 로 읽는 순서를 말해 준다. */

function GroupLabel({ n, title }: { n: number; title: string }) {
  return <SectionIntro n={n} title={title} />;
}

/** 50:50 두 시트가 나란히 서는 줄. 좁아지면 한 장씩 접힌다. */
function Pair({ children }: { children: React.ReactNode }) {
  return <div className="mdd-pair">{children}</div>;
}

export function Results({ data }: { data: MddResult }) {
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

      {/* ⚠️ 부제가 바로 아래 시트("역대 낙폭 Top 5")의 부제와 **글자까지 같았다.** 구간 부제는
          그 아래 시트들을 아우르는 말이라야 한다 — 한 시트의 말을 그대로 올리면 되풀이다. */}
      <GroupLabel n={1} title="과거 낙폭 사례" />
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
            /* ⚠️ 아래 실제 시트(`Recovery`)와 **같은 아이콘**이어야 한다 — 같은 자리에 번갈아 선다. */
            icon="timer"
            title="회복까지 걸린 기간"
            sub="과거 사례로 본 회복 소요 기간"
            body="지금은 고점 부근이라 회복을 기다릴 하락이 없습니다."
          />
        )}
      </Pair>

      <GroupLabel n={2} title="이 하락의 정체" />
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

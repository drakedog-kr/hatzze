"use client";

// 종목 검색·기간 고르기·추천 종목. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import { useEffect, useMemo, useRef, useState } from "react";
import { gaSearchTerm, gaStockCode, track } from "@/lib/ga";
import { C, Icon, MONO } from "../ui";
import { StockLogo } from "../StockLogo";
import { MAJOR_NAMES, PERIODS, marketBadge, benchName, fmtDay } from "./shared";
import type { StockOption, Suggestion, SuggestGroups, MddResult } from "./shared";
import { periodLabelOf, AbsentSheet } from "./sheet";
import { HeroStrip, Underwater } from "./Hero";
import { AttributionModule, CasesTable, LadderModule, LastDropModule, MddCover, RecoveryModule, ThemeModule, YearVsMarketModule, YearsModule } from "./V2Sheets";

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
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 500, color: C.muted, whiteSpace: "nowrap" }}>{hint}</span>
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
              {/* 순위는 시장마다 따로(국내 1~3 · 미국 1~2) — 이어 매기면 '3 삼성전기 99회 → 4 마이크론 709회'처럼 값과 어긋났다(2026-10-04 점검). */}
              <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", color: C.muted, width: 12, flexShrink: 0 }}>
                {items.slice(0, i + 1).filter((x) => (x.market === "US") === (s.market === "US")).length}
              </span>
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
              <span style={{ marginLeft: "auto", fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, whiteSpace: "nowrap" }}>{s.note}</span>
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
            // v2: 흰 판 + 1px 테두리 + 모서리 6 — 모듈과 같은 면(2026-10-03). 고를 때만 파란 테두리.
            background: "var(--t-card)",
            border: `1px solid ${focused ? "var(--t-down)" : "var(--t-frame)"}`,
            boxShadow: focused ? `0 0 0 3px var(--t-down-weak)` : "none",
            borderRadius: 6,
            padding: "0 12px",
            height: 41,
            transition: "border-color .15s, box-shadow .15s",
          }}
        >
          <Icon name="search" style={{ fontSize: 18, color: focused ? "var(--t-down)" : "var(--t-ink3)" }} />
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
            // 이름을 모르는 코드(없는 종목)면 코드가 이름처럼 박혔다('999999 · 다른 종목 검색', 2026-10-05 점검).
            placeholder={selected.name === selected.code ? "종목 이름 · 코드 검색" : `${selected.name} · 다른 종목 검색`}
            className="mdd-search-input"
            style={{ flex: 1, alignSelf: "stretch", border: "none", outline: "none", background: "transparent", color: C.ink, minWidth: 0 }}
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

      {/* 기간 토글 — 다른 화면의 기간 탭과 같은 .hz-seg(회색 트랙 + 고른 칸만 흰 칩)다(2026-09-23).
          예전엔 고른 칸을 파랗게 채웠다. 흰 칩은 면(흰색 vs 회색)으로 '지금 고른 것'을 가르므로
          예전 흰 면 + 파란 글자 시절의 문제(글자색으로만 갈림)는 생기지 않는다. 호버는 .hz-seg-hover(tx.css). */}
      <div className="hz-seg hz-seg-hover mdd-period" role="group" aria-label="조회 기간">
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
/* 구간 제목(SectionIntro '01 과거 낙폭 사례' · '02 이 하락의 정체')은 v2 에서 걷었다(2026-10-03) — 모듈 머리 띠가 이름을 말하고,
   v2 화면(카더라 · 시장 브리핑)엔 큰 구간 제목이 없다. */


export function Results({ data, onPick }: { data: MddResult; onPick: (s: StockOption) => void }) {
  const a = data.analysis;
  const periodLabel = periodLabelOf(data);
  // 사례 표에서 고른 하락 — 물속 차트에 그 구간을 칠한다(판정표 9). 결과가 새로 서면(종목 · 기간 변경) 이 컴포넌트가 새로 서서 풀린다.
  const [focus, setFocus] = useState<string | null>(null);
  const ep = focus ? (a.topDrawdowns.find((e) => e.peakDate === focus) ?? null) : null;
  const onFocus = (peakDate: string | null) => {
    setFocus(peakDate);
    // 차트가 화면 밖이면 보이는 데까지만 올린다(이미 보이면 그대로 — block:nearest).
    if (peakDate) document.getElementById("mdd-uw")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  return (
    // v2: 모듈 사이 간격은 v2 한 값(12). 구간 제목('01 과거 낙폭 사례' · '02 이 하락의 정체')은 걷었다 — 모듈 머리가 이름을 말한다.
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 첫 줄 띠(판정표 7) — 같은 기간 지수 · 다른 화면 링크 · 종가 기준일. */}
      <MddCover data={data} periodLabel={periodLabel} />
      <HeroStrip data={data} periodLabel={periodLabel} />
      <div id="mdd-uw">
        <Underwater
          a={a}
          periodLabel={periodLabel}
          market={data.market}
          focus={ep ? { from: ep.peakDate, to: ep.recoveryDate } : null}
          focusPeak={focus}
          cases={a.topDrawdowns}
          onCase={(peakDate) => onFocus(focus === peakDate ? null : peakDate)}
          benchSeries={data.benchUnderwater ?? null}
        />
      </div>

      {/* v2(2026-10-03 판정표 1단계) — 독자 질문 순서: 얼마나 빠졌나(위 둘) → 흔한가 · 언제 되찾나 → 왜(시장) · 장기 성적 → 업종 → 다른 종목.
          옛 Top 5 · 리스크 '하락 vs 회복' · '혼자 빠지나' · 성격 타일은 같은 사건을 네 군데서 말해 사례 표 하나 + 회복 칸으로 합쳤다.
          시트는 자료가 없어도 자리를 지킨다(AbsentSheet 주석) — 짝의 칸 수가 그대로여야 줄이 안 어긋난다. */}
      <div className="v2-md-row is-21 is-quad">
        {a.topDrawdowns.length > 0 ? (
          <CasesTable a={a} periodLabel={periodLabel} market={data.market} focus={focus} onFocus={onFocus} />
        ) : (
          <AbsentSheet title="역대 하락 사례" body="이 기간엔 순위를 매길 만한 하락이 없었습니다." className="v2-md-cases-mod" />
        )}
        {a.recovery ? (
          <RecoveryModule a={a} />
        ) : a.lastDrop ? (
          <LastDropModule d={a.lastDrop} asOf={a.asOf} />
        ) : (
          <AbsentSheet title="회복까지" body="지금은 고점 부근이라 회복을 기다릴 하락이 없습니다." />
        )}

        {/* 해마다 | 시장 탓 — 위 줄(사례 2 : 회복 1)과 한 격자에 둬 칸 경계도 높이도 같다(2026-10-03 "위와 같은 크기로"). */}
        {data.risk ? (
          <YearsModule r={data.risk} periodLabel={periodLabel} asOf={a.asOf} firstDate={a.firstDate} />
        ) : (
          <AbsentSheet title="해마다" body="상장한 지 얼마 되지 않아 연도별 성적을 낼 만큼 이력이 쌓이지 않았습니다." className="v2-md-years" />
        )}
        {data.attribution ? (
          <AttributionModule
            attr={data.attribution}
            stockName={data.name}
            themeName={data.theme?.name ?? null}
            market={data.market}
            since={fmtDay(a.athDate, a.asOf)}
          />
        ) : data.yearCmp ? (
          <YearVsMarketModule c={data.yearCmp} stockName={data.name} market={data.market} />
        ) : (
          <AbsentSheet
            title="시장 탓 · 종목 탓"
            body={
              a.currentDd > -1
                ? "지금은 고점 부근이라 원인을 나눌 하락이 없습니다."
                : // 일시 실패(야후 제한·타임아웃)를 자료 부재로 설명하지 않는다 — 응답의 partial 이 가른다(api/mdd).
                  data.partial?.market
                  ? `${benchName(data.market)} 시세를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.`
                  : `고점(${a.athDate}) 무렵의 ${benchName(data.market)} 기록이 없어 같은 기간을 나란히 놓지 못했습니다.`
            }
          />
        )}
      </div>

      {/* 업종 안에서 | 수익 · 손실 비율 — 위 두 줄과 같은 2 : 1 격자라 칸 경계가 위아래로 맞는다(2026-10-04 "위 두 카드와 같은 크기로").
          키는 업종 칸(대표 종목 줄 수)이 정하고 수익 · 손실 칸은 그 키를 다 받는다.
          업종 칸 줄을 누르면 그 종목으로 바뀌고 맨 위로 올라간다(MddExplorer pickFromResults).
          '많이 빠진 대형주'(종목과 상관없는 시총 상위 고정 목록)였던 자리다 — 2026-10-03 "투자자가 궁금해할 것"으로 바꿨다. */}
      <div className="v2-md-row is-21">
        {data.theme ? (
          <ThemeModule theme={data.theme} onPick={onPick} />
        ) : (
          <AbsentSheet
            title="업종 안에서"
            body={
              data.partial && (data.partial.lookupFailed || data.partial.peersRequested > 0)
                ? "테마 대표 종목의 시세를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오."
                : "이 종목이 묶인 테마를 찾지 못했습니다."
            }
          />
        )}
        {data.ladder ? (
          <LadderModule ladder={data.ladder} market={data.market} />
        ) : (
          <AbsentSheet title="수익 · 손실 비율" body="거래량 기록이 짧아 가격대를 나누지 못했습니다." />
        )}
      </div>
      {/* 대표 종목 일부만 받았으면 그렇다고 적는다 — 평균이 몇 종목으로 낸 것인지 읽는 사람이 알아야 한다. */}
      {data.theme && data.partial && data.partial.peersOk < data.partial.peersRequested && (
        <p style={{ margin: "-6px 4px 0", fontSize: "var(--fs-11)", color: C.muted }}>
          대표 {data.partial.peersRequested}종목 중 {data.partial.peersOk}종목만 불러와 비교했습니다. 잠시 뒤 다시 열면 채워질 수 있습니다.
        </p>
      )}
    </div>
  );
}

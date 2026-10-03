"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT, DEFAULT_YEARS, mddQuery, normalizeYears } from "./shared";
import type { StockOption, SuggestGroups, MddResult } from "./shared";

// page.tsx 가 여기서 가져가던 타입. 파일을 나누면서 shared 로 갔지만 바깥 import 는 그대로 둔다.
export type { StockOption, SuggestGroups, Suggestion } from "./shared";
import { Controls, Results } from "./Controls";
import { Skeleton, ErrorCard } from "./sheet";

export function MddExplorer({
  stocks,
  initial,
  initialYears = DEFAULT_YEARS,
  suggestions,
}: {
  stocks: StockOption[];
  initial?: StockOption | null;
  /** 주소의 ?years= (page.tsx 가 normalizeYears 로 거른 값). */
  initialYears?: string;
  suggestions?: SuggestGroups;
}) {
  // initial 은 URL(?code=…)로 지정된 종목. 없으면 기본 종목(삼성전자)으로 연다.
  const [selected, setSelected] = useState<StockOption>(initial ?? DEFAULT);
  const [years, setYears] = useState(initialYears);
  const [data, setData] = useState<MddResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 자리표시자 배지 문구를 가르는 값 — 기간만 바꿨나(true), 아니면 첫 진입·종목 변경인가.
  // 이유는 Skeleton 주석에. 조회를 거는 두 입구에서 세워 두고 Skeleton 이 읽는다.
  const [periodOnly, setPeriodOnly] = useState(false);

  /**
   * ## 고른 종목·기간을 주소에 남긴다 (2026-09-30)
   *
   * 예전엔 useState 에만 있어, SK하이닉스 5년을 본 뒤 주소를 복사하면 `/mdd`(삼성전자·10년)가 공유되고 새로고침도
   * 삼성전자로 돌아갔다. 이 화면의 핵심 쓰임새인 "이 종목 낙폭 봐 봐" 공유가 끊겨 있었다(mdd#3).
   *
   * 고를 때마다 `history.pushState` 로 `?code=…&market=…&years=…` 를 남긴다 — 서버를 다시 부르지 않는다(Next 문서
   * 01-getting-started/04-linking-and-navigating.md: 네이티브 pushState 가 라우터와 맞물린다). 뒤로·앞으로 가기는
   * popstate 에서 주소를 읽어 되돌린다. 주소에 이름은 없으니, 이미 본 종목(seen)과 검색 목록에서 찾고 못 찾으면
   * 코드를 이름 자리에 쓴다(page.tsx resolveInitial 과 같은 폴백).
   */
  const seen = useRef(new Map<string, StockOption>());
  const remember = (s: StockOption) => seen.current.set(s.code, s);
  const pushUrl = (s: StockOption, y: string) => {
    const q = mddQuery(s, y);
    if (q !== window.location.search) window.history.pushState(null, "", `${window.location.pathname}${q}`);
  };
  useEffect(() => {
    remember(initial ?? DEFAULT);
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      const code = p.get("code");
      const next = !code
        ? (initial ?? DEFAULT)
        : (seen.current.get(code) ?? stocks.find((s) => s.code === code) ?? { code, name: code, market: p.get("market") });
      setPeriodOnly(false);
      setSelected(next);
      setYears(normalizeYears(p.get("years")));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // 목록과 초기값은 한 화면 동안 바뀌지 않는다(바뀌면 page.tsx 의 key 가 이 컴포넌트를 새로 세운다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const pick = (s: StockOption) => {
    setPeriodOnly(false);
    setSelected(s);
    remember(s);
    pushUrl(s, years);
  };
  /* 화면 아래쪽(업종 칸)에서 종목을 누르면 맨 위로 올린다 — 결과가 자리표시자로 바뀌며 키가 줄어,
     그 자리에 머물면 바닥(푸터)만 보인다. 본문 스크롤은 셸의 main.hz-scroll 이 맡는다(폰은 창). */
  const pickFromResults = (s: StockOption) => {
    pick(s);
    const main = document.querySelector<HTMLElement>("main.hz-scroll");
    if (main && main.scrollHeight > main.clientHeight) main.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    // 뿌리의 hz-tx 가 이번 리디자인을 켠다(globals.css). 세로 간격도 그쪽 값(18)을 쓴다.
    // v2(2026-10-03) — 카더라 · 시장 브리핑의 v2 규칙을 옮겼다. v2-kd 는 v2 토큰 · 폭 단계, v2-md 는 이 화면 전용 덮기(v2.css).
    <div className="hz-tx v2-kd v2-md">
      {/* 제목도 설명 문단도 여기서 안 그린다 — 셸의 본문 헤더(AppShell 의 PageHeader)가
          제목과 한 줄 부제를 이미 그린다. 예전엔 그 아래에 세 갈래 설명("얼마나 빠졌는지 ·
          얼마나 드문지 · 얼마나 걸렸는지")을 한 문단 더 뒀는데, 바로 아래 시트들이 같은
          말을 제목으로 다시 하고 있어 걷어냈다(2026-08-04). */}
      <Controls
        stocks={stocks}
        selected={selected}
        onSelect={pick}
        years={years}
        onYears={(y) => {
          setPeriodOnly(true);
          setYears(y);
          pushUrl(selected, y);
        }}
        suggestions={suggestions}
      />

      {loading && <Skeleton periodOnly={periodOnly} />}
      {!loading && error && <ErrorCard message={error} />}
      {!loading && !error && data && <Results data={data} onPick={pickFromResults} />}
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

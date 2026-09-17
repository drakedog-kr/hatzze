"use client";

import { useEffect, useState } from "react";
import { C } from "../ui";
import { DEFAULT } from "./shared";
import type { StockOption, SuggestGroups, MddResult } from "./shared";

// page.tsx 가 여기서 가져가던 타입. 파일을 나누면서 shared 로 갔지만 바깥 import 는 그대로 둔다.
export type { StockOption, SuggestGroups, Suggestion } from "./shared";
import { Controls, Results } from "./Controls";
import { Skeleton, ErrorCard } from "./sheet";

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
    // 뿌리의 hz-tx 가 이번 리디자인을 켠다(globals.css). 세로 간격도 그쪽 값(18)을 쓴다.
    <div className="hz-tx">
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
      <p style={{ margin: 0, color: C.muted, fontSize: "var(--fs-12)", lineHeight: 1.7 }}>
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

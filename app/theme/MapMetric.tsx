"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 테마 점유율 지도 머리 오른쪽의 고르기 — 언급률 · 거래대금(2026-10-21 "트리맵 우측 상단에 토글 · 기본은 언급률").
 *
 * 지도 · 폰 막대 · 머리 근거 글은 **서버가 두 벌 다 그려 둔다**(ThemeIndexView · 크롤러도 첫 HTML 에서 둘 다 읽는다). 이 단추는 모듈
 * 상자(.v2-tm-map)에 data-metric 을 달고 떼기만 하고, 어느 쪽을 보일지는 CSS 가 가른다(v2.css '지도 기준 고르기'). 통화 스위치
 * (AppShell)와 같은 수다 — 지도를 클라이언트로 끌어오지 않는다. 고른 것은 남기지 않는다(올 때마다 언급률).
 */
export type MapMetricKey = "mention" | "trade";

const OPTIONS: { key: MapMetricKey; label: string }[] = [
  { key: "mention", label: "언급률" },
  { key: "trade", label: "거래대금" },
];

export function MapMetric() {
  const [metric, setMetric] = useState<MapMetricKey>("mention");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const mod = ref.current?.closest(".v2-tm-map");
    if (!mod) return;
    if (metric === "trade") mod.setAttribute("data-metric", "trade");
    else mod.removeAttribute("data-metric");
  }, [metric]);
  return (
    <span ref={ref} className="hz-seg hz-seg-hover" role="group" aria-label="지도 기준">
      {OPTIONS.map((o) => (
        <button key={o.key} type="button" aria-pressed={metric === o.key} onClick={() => setMetric(o.key)} data-ga={`theme_map_${o.key}`}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

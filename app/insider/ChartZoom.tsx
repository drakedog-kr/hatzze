"use client";

import { useState } from "react";

import { Icon } from "../ui";
import { ZoomDialog } from "../ZoomDialog";

/**
 * 폰에서 차트를 화면 긴 변으로 눕혀 크게 보는 껍데기.
 *
 * MDD 언더워터 차트가 먼저 쓰던 것을 그대로 가져왔다(`.hz-zoom-*`, globals.css). 폰에서
 * 뷰박스 720 units 가 화면 폭(≈350)으로 눌리면 축 라벨이 5~6px 로 찍혀 안 읽힌다. 무대를
 * 90도 돌려 긴 변을 쓰면 393×830 폰에서 350 → 830 으로 2배 남짓 커진다.
 *
 * ⭐ **같은 children 을 두 번 그린다.** 확대용 차트를 따로 만들지 않는 게 핵심이다 —
 * 두 벌을 두면 눈금·말풍선이 언젠가 갈린다. 감싸는 차트가 뷰박스 위에 퍼센트로 오버레이를
 * 얹는 구조라(PriceChart · 언더워터 둘 다) 무대 크기만 달라져도 곡선과 어긋나지 않는다.
 *
 * 판은 app/ZoomDialog.tsx(Base UI Dialog — 초점 가두기·되돌리기·스크롤 잠금·Esc)가 그린다.
 *
 * ⚠️ 버튼은 CSS 가 폰(≤560)에서만 보인다. 넓은 화면은 이미 충분히 크다.
 */
export function ChartZoom({ label, children }: { label: string; children: React.ReactNode }) {
  const [zoom, setZoom] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      {children}
      <button
        type="button"
        className="hz-zoom-btn"
        aria-label={`${label} 확대해서 보기`}
        onClick={() => setZoom(true)}
      >
        <Icon name="open_in_full" style={{ fontSize: "var(--fs-15)" }} />
      </button>
      <ZoomDialog open={zoom} onOpenChange={setZoom} label={`${label} 확대`}>
        {children}
      </ZoomDialog>
    </div>
  );
}

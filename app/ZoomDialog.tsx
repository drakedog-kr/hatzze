"use client";

import { Dialog } from "@base-ui/react/dialog";

import { Icon } from "./ui";

/**
 * 차트 확대 보기의 대화상자 — 폰에서 차트를 90도 눕혀 화면 긴 변으로 보는 판(모양은 mobile.css 의 `.hz-zoom-*`).
 *
 * shadcn Dialog 와 같은 바탕(Base UI Dialog)이다(2026-09-26). 예전엔 내부자 종목 차트(app/insider/ChartZoom.tsx)와
 * MDD 언더워터 차트(app/mdd/Hero.tsx)가 `role="dialog"` 상자를 각자 손으로 짜서, Esc 만 받고 나머지가 빠져 있었다:
 * 초점이 판 안으로 안 들어가고(Tab 이 뒤 화면으로 샜다), 닫으면 초점이 확대 단추로 안 돌아왔고, 뒤 화면이 스크롤됐다.
 * 셋 다 Base UI 가 맡는다.
 *
 * shadcn 의 `components/ui/dialog.tsx` 를 안 쓰는 이유: 그 파일은 가운데 뜨는 카드 모양(rhea)과 클래스 덮어쓰기용 `cn`
 * (gzip 19.6KB)을 함께 싣는다. 이 판은 화면을 통째로 덮는 불투명 무대라 모양이 전혀 다르고, 차트 화면마다 `cn` 을 싣게 된다.
 *
 * ⚠️ 판(Popup)이 화면 전체라 판 바깥 누르기가 생기지 않는다. 여백(무대 밖)을 누르면 닫히는 것은 예전처럼
 *    `e.target === e.currentTarget` 으로 판단한다 — 무대에 stopPropagation 을 걸면 document 에 걸린 툴팁 탭 리스너
 *    (app/TipTap.tsx)까지 막혀 곡선을 짚어도 설명이 안 뜬다(MDD 에서 겪은 것).
 */
export function ZoomDialog({
  open,
  onOpenChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 판의 접근성 이름(예: "언더워터 차트 확대"). */
  label: string;
  /** 무대에 그릴 차트. */
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Popup
          className="hz-zoom-scrim"
          aria-label={label}
          // Base UI 는 뒤 화면을 aria-hidden 으로 가리지만 판에 aria-modal 은 안 붙인다. 예전 판과 같게 둔다.
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
        >
          <Dialog.Close className="hz-zoom-close" aria-label="닫기">
            <Icon name="close" style={{ fontSize: "var(--fs-20)" }} />
          </Dialog.Close>
          <div className="hz-zoom-stage">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

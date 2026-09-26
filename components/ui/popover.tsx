"use client";

/**
 * shadcn/ui Popover(Base UI 바탕, 2026-09 레지스트리 rhea)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의 `cn-popover-content`.
 *
 * 원본과 다른 점.
 * - 판에 클래스를 넘기면 rhea 기본 모양 대신 그 클래스만 쓴다 — MDD '연도별 성적'(.hz-yrpop)처럼 이미 다듬어 둔 판이 있다.
 * - 판 쪽 모양만 옮겼다(제목·설명 조각은 쓰는 곳이 생기면 옮긴다). 클래스 합치기는 `cx`(lib/cx.ts).
 *
 * 동작은 Base UI 가 맡는다: 단추에 aria-expanded·aria-haspopup 이 붙고, 누르면 여닫히며 Esc·바깥 누르기로 닫힌다.
 * `openOnHover` 를 주면 마우스를 올려도 열린다(단추와 판 사이를 건너는 동안 안 닫힌다).
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

type WithClass<P> = Omit<P, "className"> & { className?: string };

function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionAvoidance,
  collisionPadding,
  ...props
}: WithClass<PopoverPrimitive.Popup.Props> &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "collisionAvoidance" | "collisionPadding">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionAvoidance={collisionAvoidance}
        collisionPadding={collisionPadding}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup data-slot="popover-content" className={className ?? "cn-popover-content flex w-72 flex-col outline-hidden"} {...props} />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };

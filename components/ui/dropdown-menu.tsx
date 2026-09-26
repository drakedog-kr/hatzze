"use client";

/**
 * shadcn/ui DropdownMenu(Base UI Menu 바탕, 2026-09 레지스트리 rhea)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의 `cn-menu-*`.
 *
 * 원본과 다른 점.
 * - 이 사이트가 쓰는 조각만 옮겼다(뿌리·단추·판·항목·묶음 이름). 체크·라디오 항목과 하위 메뉴는 쓰는 곳이 생기면 옮긴다.
 * - 짚은 항목은 rhea 의 bg-accent 가 아니라 파란 틴트다 — accent(--c-hover)는 흰 판 위에서 1.06 이라 어디를 짚었는지
 *   안 보인다(검색창 목록에서 이미 겪었다, shadcn.css 의 .cn-command-item).
 * - 클래스 합치기는 `cx`(lib/cx.ts).
 *
 * 동작은 Base UI 가 맡는다: 단추에 aria-haspopup·aria-expanded 가 붙고, ↑↓ 로 항목을 옮기며 Enter 로 고르고 Esc 로 닫는다.
 */
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cx } from "@/lib/cx";

type WithClass<P> = Omit<P, "className"> & { className?: string };

function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: WithClass<MenuPrimitive.Popup.Props> & Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="isolate z-50 outline-none" align={align} alignOffset={alignOffset} side={side} sideOffset={sideOffset}>
        <MenuPrimitive.Popup data-slot="dropdown-menu-content" className={cx("cn-menu-content outline-none", className)} {...props} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({ className, ...props }: WithClass<MenuPrimitive.GroupLabel.Props>) {
  return <MenuPrimitive.GroupLabel data-slot="dropdown-menu-label" className={cx("cn-menu-label", className)} {...props} />;
}

function DropdownMenuItem({ className, ...props }: WithClass<MenuPrimitive.Item.Props>) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item" className={cx("cn-menu-item relative flex items-center select-none", className)} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem };

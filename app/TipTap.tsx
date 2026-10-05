"use client";

import { useEffect } from "react";

/**
 * 터치 기기에서 툴팁을 **탭으로** 연다.
 *
 * 왜 필요한가. 툴팁(.hz-tip)은 여는 규칙이 `:hover` 하나뿐인데 터치에는 호버가 없다.
 * 그래서 폰에서는 지표 뜻풀이·계산 근거·기준선 설명·"?" 도움말이 통째로 안 열렸다
 * (2026-08-05 실측: 시장 브리핑 한 화면에 data-tip 158개 중 **157개가 열 방법 없음**).
 * 초보자에게 가장 필요한 글이 전부 PC 전용이었던 셈이다.
 *
 * 왜 JS 인가. 이 저장소의 툴팁은 CSS-only(::after + opacity)이고 그 원칙은 지킬 값어치가
 * 있다. 다만 '여는 사건'만은 CSS 로 못 만든다. 대안이 둘 있었는데 둘 다 더 나빴다.
 *   - 전부 tabindex 를 줘 :focus-within 으로 열기 → 키보드 탭 정거장이 157개 생긴다.
 *     (.hz-dist-row 처럼 **원래 눌러야 하는** 요소 몇 개에 주는 건 옳지만, 설명 딱지
 *      157개에 주면 키보드 사용자에게 오히려 손해다.)
 *   - 폰에서 설명을 카드 안에 펼쳐 두기 → 카드가 길어지고 무엇을 남길지 고르는 일이 커진다.
 * 그래서 여는 사건만 여기서 만들고, 보이고 숨기는 일은 그대로 CSS 에 맡긴다.
 *
 * hz-tip-tap 이 붙은 것(✨ AI 표시)은 건드리지 않는다 — 그쪽은 안에 진짜 <button> 이
 * 있어 :focus-within 으로 이미 열린다.
 *
 * ⚠️ 호버가 되는 기기에서는 리스너를 아예 안 건다. 마우스로 쓰는 화면에서 클릭마다
 * 클래스가 붙었다 떨어지는 일이 없어야 한다.
 *
 * ## 끌어 읽기(2026-10-05 모바일 점검)
 * 차트의 세로 칸(.hz-vline)은 6~11px 라 원하는 날을 탭으로 집기 어렵다. 칸 위에서 시작한 터치를 **옆으로** 끌면 손가락 아래 칸으로
 * 말풍선이 따라온다(증권 앱 차트처럼). 세로로 끌면 손대지 않는다 — 칸에 `touch-action: pan-y pinch-zoom`(shadcn.css)을 둬
 * 세로 이동 · 확대는 브라우저가, 가로 이동만 여기서 받는다. 8px 넘게 · 세로보다 더 옆으로 움직였을 때만 끌기로 본다.
 * 칸은 x 로만 고른다 — 손가락이 차트 위아래로 벗어나도 같은 날을 가리킨다.
 */
export function TipTap() {
  useEffect(() => {
    // 호버가 있는 기기(마우스)는 :hover 로 이미 열린다. 손댈 것이 없다.
    if (window.matchMedia("(hover: hover)").matches) return;

    const OPEN = "hz-tip-open";
    let open: Element | null = null;

    const close = () => {
      open?.classList.remove(OPEN);
      open = null;
    };

    let drag: { id: number; x: number; y: number; on: boolean; group: Element } | null = null;
    let draggedAt = 0;
    const tipAtX = (group: Element, x: number) =>
      [...group.children].find((c) => {
        if (!c.classList.contains("hz-vline")) return false;
        const r = c.getBoundingClientRect();
        return x >= r.left && x < r.right;
      }) ?? null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const v = (e.target as Element | null)?.closest?.(".hz-vline");
      drag = v?.parentElement ? { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, group: v.parentElement } : null;
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        const dx = Math.abs(e.clientX - drag.x);
        if (dx < 8 || dx < Math.abs(e.clientY - drag.y)) return;
        drag.on = true;
      }
      const t = tipAtX(drag.group, e.clientX);
      if (t && t !== open) {
        close();
        t.classList.add(OPEN);
        open = t;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      // 끌기가 끝난 자리의 말풍선은 열어 둔다 — 뒤따르는 click 이 그걸 '같은 것 다시 누름'으로 닫지 않게 잠깐 막는다.
      if (drag.on) draggedAt = Date.now();
      drag = null;
    };

    const onClick = (e: MouseEvent) => {
      if (Date.now() - draggedAt < 400) return;
      const target = e.target as Element | null;
      // hz-tip-tap 은 제 힘으로 열리므로 뺀다.
      const tip = target?.closest?.("[data-tip]:not(.hz-tip-tap)") ?? null;
      // 같은 것을 다시 누르면 닫는다(끄는 방법이 '딴 데 누르기' 하나뿐이면 답답하다).
      if (tip && tip === open) {
        close();
        return;
      }
      close();
      if (tip) {
        tip.classList.add(OPEN);
        open = tip;
      }
    };

    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });
    // 스크롤하면 닫는다. 툴팁은 제 자리에 absolute 로 붙어 있어서, 열어 둔 채 화면을
    // 밀면 설명만 엉뚱한 자리에 남는다.
    // ⚠️ 스크롤은 window 가 아니라 main.hz-scroll 이 먹는다(이 저장소의 반복된 함정).
    const scroller = document.querySelector("main.hz-scroll");
    scroller?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("scroll", close, { passive: true });

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      scroller?.removeEventListener("scroll", close);
      window.removeEventListener("scroll", close);
    };
  }, []);

  return null;
}

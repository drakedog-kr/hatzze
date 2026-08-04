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

    const onClick = (e: MouseEvent) => {
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
    // 스크롤하면 닫는다. 툴팁은 제 자리에 absolute 로 붙어 있어서, 열어 둔 채 화면을
    // 밀면 설명만 엉뚱한 자리에 남는다.
    // ⚠️ 스크롤은 window 가 아니라 main.hz-scroll 이 먹는다(이 저장소의 반복된 함정).
    const scroller = document.querySelector("main.hz-scroll");
    scroller?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("scroll", close, { passive: true });

    return () => {
      document.removeEventListener("click", onClick);
      scroller?.removeEventListener("scroll", close);
      window.removeEventListener("scroll", close);
    };
  }, []);

  return null;
}

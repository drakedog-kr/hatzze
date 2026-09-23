"use client";

import { useState } from "react";

import { track } from "@/lib/ga";

/**
 * 폰에서만 셀 격자를 셋까지 보여 주고 '더 보기'로 펴는 껍데기(2026-09-23).
 *
 * 급부상 종목 시트가 폰(360)에서 2.7화면이었다 — 셀 여섯이 한 줄로 쌓여 장당 360px 다. 급등 종목(아홉 장)도
 * 같은 꼴이라 같이 쓴다. 넓은 화면은 3열 격자라 그대로 두어야 해서, 자르는 건 CSS(≤560 에서 넷째 칸부터 숨김, kadera.css 의 .hz-phonefold)가
 * 하고 여기선 펼침 상태와 버튼만 든다. 버튼 줄도 ≤560 에서만 보인다.
 * 서버 컴포넌트가 그린 격자를 children 으로 받는다 — 조회는 서버에 남는다(ExpandableList 와 같은 방식).
 *
 * ⚠️ 보이는 개수(3)는 CSS 의 :nth-child(n+4) 와 한 쌍이다. 바꾸려면 둘을 같이 고친다.
 */
const PHONE_SHOWN = 3;

export function PhoneFold({ total, name, children }: { total: number; name: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`hz-phonefold${open ? " is-open" : ""}`}>
      {children}
      {total > PHONE_SHOWN && (
        <div className="hz-sheet-foot-row hz-phonefold-foot">
          <button
            type="button"
            className="hz-more-btn"
            style={{ flex: 1, padding: "0 12px", minHeight: 32, borderRadius: 0, border: 0, fontSize: "var(--fs-11-5)", fontWeight: 700, cursor: "pointer" }}
            onClick={() => {
              track("list_expand", { list: name, action: open ? "fold" : "more", shown: open ? PHONE_SHOWN : total });
              setOpen(!open);
            }}
          >
            {open ? "접기" : `더 보기 +${total - PHONE_SHOWN}`}
          </button>
        </div>
      )}
    </div>
  );
}

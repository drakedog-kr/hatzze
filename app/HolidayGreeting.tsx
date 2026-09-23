"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { createHintStore } from "./hint-store";

/**
 * 명절 인사 팝업. 연휴 동안 처음 들어온 사람에게 한 번 뜨고, 닫으면 다시 안 뜬다.
 *
 * 2026-09-24 추석 연휴에 처음 띄웠다. 다음 명절에 되쓸 때는 아래 GREETING 한 덩이만 갈아 끼운다.
 * ⚠️ id 를 새로 딸 것. 옛 id 를 되쓰면 지난번에 닫은 사람에게는 새 인사가 안 뜬다.
 *
 * ## 날짜는 브라우저가 가른다
 *
 * 서버 스냅샷이 false 라 SSR·ISR 사본에는 아무것도 안 그려지고, 하이드레이션 뒤에 브라우저가
 * 기간과 '닫았음'을 보고 띄운다. 서버에서 날짜를 가르면 안 된다 — 화면 사본(ISR)이 한 시간씩
 * 살아 있어서 연휴가 끝난 뒤에도 옛 사본에 팝업이 남는다(layout.tsx 의 revalidate 주석).
 * 여닫이 기계는 hint-store 를 같이 쓴다(구독 직후 한 번 다시 읽는 이유는 그 파일 머리 주석).
 *
 * ## 창은 네이티브 <dialog> 의 showModal() 이다
 *
 * 맨 위 층(top layer)에 떠서 폰 탑바·PC 권유 띠·툴팁의 z-index 와 다투지 않는다. 뒤 화면을
 * inert 로 막고 Esc 로 닫히는 것까지 브라우저가 해 준다. 바깥(backdrop)을 눌러도 닫힌다.
 *
 * ⚠️ effect 의 정리 함수에서 close() 를 부르지 말 것. 개발 모드(StrictMode)가 effect 를 한 번
 *    걷었다 다시 거는데, 그때 close 이벤트가 나서 '닫았음'이 적히고 팝업이 바로 사라진다.
 *    엘리먼트가 빠지면 맨 위 층에서도 같이 빠지므로 정리할 것이 없다.
 */
const GREETING = {
  id: "chuseok-2026",
  // 연휴 첫날(목) 0시부터 이어지는 주말(일) 23:59 까지. until 시각부터 안 뜬다(2026-09-24 에 정한 시각).
  // 2026 추석은 9/24~9/26 이고 증시는 9/28(월)에 다시 연다(data-pipeline/common/timeutil.py 의 KRX_HOLIDAYS).
  // 코드를 걷어 내는 것은 기간이 끝난 뒤 별도 PR 로 한다.
  from: "2026-09-24T00:00:00+09:00",
  until: "2026-09-27T23:59:00+09:00",
  // 맨 위에 크게 앉는 그림. 장식이라 스크린리더에는 안 읽힌다.
  emoji: "🙇",
  title: "추석 연휴에도 찾아 주셔서 감사합니다",
  // 한 줄에 한 문단. 둘째 줄의 이모지 앞은 줄바꿈 없는 공백(\u00a0)이다 — 이모지만 다음 줄로 떨어지지 않게.
  lines: ["가족분들과 주식 이야기가 나오면 햇쩨 소개도 부탁드립니다\u00a0😄", "즐거운 명절 보내시기 바랍니다."],
};

const PREFIX = "hz-greeting-";
const { storeFor, markSeen } = createHintStore(PREFIX, "hz-greeting-change");

// ?greeting=reset 으로 들어오면 '닫았음'을 지워 다시 띄운다. 한 번 닫은 뒤 로컬·프로덕션에서 다시
// 확인하려는 스위치다(layout.tsx 의 ?ga=off 와 같은 방식). 모듈이 읽힐 때 한 번만 보므로 주소창에
// 직접 치고 들어와야 걸린다.
if (typeof window !== "undefined") {
  try {
    if (new URLSearchParams(window.location.search).get("greeting") === "reset") {
      localStorage.removeItem(PREFIX + GREETING.id);
    }
  } catch {}
}

// 모듈이 읽힐 때 한 번만 본다(렌더 안에서 Date.now() 를 부르면 React 컴파일러 린트가 막는다).
// AppShell 의 NewsStrip 과 같은 수다. 서버에서도 계산되지만 서버 스냅샷이 false 라 쓰이지 않는다.
const NOW = Date.now();
// 자동화 브라우저(헤드리스 점검 스크립트·크롤러)에는 안 띄운다. 이 저장소는 헤드리스 크롬으로
// 화면을 재는 일이 잦은데, 새 프로필마다 팝업이 떠서 뒤 화면을 inert 로 막으면 누르기·넘침 검사가
// 전부 헛돈다. 사람이 쓰는 브라우저는 navigator.webdriver 가 false 다.
const ON =
  NOW >= Date.parse(GREETING.from) &&
  NOW < Date.parse(GREETING.until) &&
  !(typeof navigator !== "undefined" && navigator.webdriver);

export function HolidayGreeting() {
  const store = storeFor(GREETING.id);
  const unseen = useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
  if (!ON || !unseen) return null;
  return <GreetingDialog />;
}

function GreetingDialog() {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    // 이미 열려 있으면 다시 부르지 않는다. 옛 브라우저는 열린 창에 showModal() 을 부르면 던진다.
    if (!d || d.open) return;
    d.showModal();
    // showModal() 은 첫 버튼(닫기)에 포커스를 준다. 방금 연 페이지에서는 그 포커스가 키보드 포커스로
    // 쳐져 파란 링이 그려지고, 폰·PC 모두에서 버튼이 눌린 것처럼 보였다(2026-09-24 지적). 포커스를
    // 창 자체로 옮긴다 — 스크린리더는 제목을 읽고, Esc 는 그대로 닫히고, Tab 을 누르면 그때 버튼에 링이 선다.
    d.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="hz-greet"
      aria-labelledby="hz-greet-title"
      // 창이 포커스를 받으려면 필요하다(위 effect 의 d.focus()). Tab 순서에는 안 들어간다.
      tabIndex={-1}
      // 닫는 길 셋(버튼 · Esc · 바깥 누르기)이 모두 close 이벤트로 모인다. '닫았음'은 여기서 한 번만 적는다.
      onClose={() => markSeen(GREETING.id)}
      // 바깥을 누르면 이벤트 대상이 <dialog> 자신이다. 안쪽 상자가 창을 꽉 채우므로
      // 창 안을 누른 것은 늘 안쪽 요소가 대상이 된다.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="hz-greet-body">
        <span className="hz-greet-emoji" aria-hidden="true">
          {GREETING.emoji}
        </span>
        <h2 id="hz-greet-title" className="hz-greet-title">
          {GREETING.title}
        </h2>
        {GREETING.lines.map((line) => (
          <p key={line} className="hz-greet-text">
            {line}
          </p>
        ))}
        <button type="button" className="hz-greet-ok" onClick={() => ref.current?.close()}>
          닫기
        </button>
      </div>
    </dialog>
  );
}

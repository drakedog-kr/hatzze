"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { Icon, R } from "../ui";

/**
 * 폰에서 처음 온 사람에게 "이 줄은 눌러서 들어가는 곳"이라고 한 번만 알려 주는 쪽지.
 *
 * ## 왜 필요한가
 *
 * 내부자 리포트의 종목 줄은 통째로 `/insider/stock/<티커>` 로 가는 링크인데, 폰에는
 * hover 가 없어서 **눌러 보기 전엔 링크인 줄 모른다.** 데스크톱은 커서와 행 배경이라도
 * 있지만 그것도 올려 봐야 알고, 폰에는 그 신호가 아예 없다. 그래서 첫 카드('월가 거물이
 * 늘린 종목')의 맨 윗줄 바로 밑에 폭과 무관하게 한 번 띄운다.
 *
 * ⚠️ 이건 **없는 어포던스를 임시로 메우는 것**이지 어포던스 자체가 아니다. 쪽지는 한 번
 * 보고 사라지므로 두 번째 방문부터는 여전히 눌러 보기 전엔 알 수 없다. 줄 오른쪽에
 * 화살표(chevron)를 상시로 두는 편이 근본 해결이다 — 그건 이 카드만이 아니라 여덟 블록
 * 전부를 건드리는 일이라 따로 판단할 것.
 *
 * ## 기계 — 여기서 두 번 헛짚었다. 되돌리기 전에 읽을 것
 *
 * localStorage 는 서버가 모르는 값이라 첫 그림은 반드시 '감춤'이고, 그 뒤 클라이언트가
 * 켜 줘야 한다. 그 '켜 주는' 단계가 두 번 무너졌다.
 *
 * ⚠️ **하나. 안 보일 때 `null` 을 돌려주면 안 된다.** 서버가 null 을 그리면 하이드레이션할
 * 자리가 없어서 **리액트가 이 컴포넌트를 클라이언트에서 아예 실행하지 않는다.** 실측으로
 * 확인했다 — 컴포넌트 첫 줄의 console.log 가 한 번도 안 찍혔고 요소에 `__reactFiber$*`
 * 키도 안 붙었다. `PcHint`(AppShell)가 같은 모양인데도 멀쩡한 건 그쪽이 클라이언트 컴포넌트
 * 안이라 테마·스크롤 같은 다른 이유로 어차피 다시 그려지기 때문이다. 이 쪽지는 서버 컴포넌트
 * 트리에 홀로 얹힌 잎이라 그 도움을 못 받는다. 그래서 **엘리먼트는 늘 그리고 `hidden` 으로
 * 감춘다.**
 *
 * ⚠️ **둘. 자리를 만들어 준 것만으로는 부족했다.** `hidden` 으로 바꾼 뒤에도 어떤 로드에서는
 * 켜지고 어떤 로드에서는 안 켜졌다 — 하이드레이션 뒤 클라이언트 스냅샷을 다시 읽는 게
 * 들쭉날쭉했다. 그래서 `subscribe` 가 **구독 직후 스스로 한 번 알린다**(아래 setTimeout).
 * 구독은 리액트가 마운트 때 반드시 부르므로, 이러면 매 로드에서 예외 없이 다시 읽는다.
 *
 * `useEffect` + `setState` 는 못 쓴다. eslint `react-hooks/set-state-in-effect` 가 막는다
 * (실제로 걸려 봤다). 그래서 스토어 쪽에서 푼다.
 *
 * ⚠️ 처음엔 폰(≤560)에서만 띄웠다. 폰에는 hover 가 없어 링크인 줄 알 길이 없다는 게
 * 근거였는데, 데스크톱에서도 그 줄이 눌린다는 걸 아는 사람이 드물어 폭 제한을 걷었다.
 * 그래서 **데스크톱 방문자도 이 쪽지를 소비한다** — 데스크톱에서 한 번 닫으면 나중에 폰으로
 * 들어와도 안 뜬다. PcHint 는 여전히 폰 전용이라 그쪽과 성질이 다르다는 점에 주의할 것.
 */
/**
 * 카드마다 표시를 따로 남긴다. 세 카드가 가리키는 곳이 다르고(종목 상세 · 인물 상세)
 * 하는 말도 달라서, 하나를 닫았다고 나머지를 안 알려 주면 그 카드는 영영 못 배운다.
 * ⚠️ 값을 바꾸면 이미 닫은 사람에게 다시 뜬다. 문구만 고칠 때는 건드리지 말 것.
 */
const KEY_PREFIX = "hz-insider-taphint-";
const EVENT = "hz-insider-tap-hint-change";

function makeStore(key: string) {
  return {
  subscribe(cb: () => void) {
    // ⭐ 구독 직후 한 번 알린다. 이유는 파일 머리 주석의 '둘'. 지우면 쪽지가 뜨다 말다 한다.
    const t = setTimeout(cb, 0);
    window.addEventListener(EVENT, cb);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVENT, cb);
    };
  },
  // 사파리 사생활 보호 모드 등에서 localStorage 접근이 던진다. 그때는 안 띄운다 —
  // 껐다는 걸 기억할 수 없으니 띄우면 올 때마다 다시 뜬다.
  getSnapshot() {
    try {
      return localStorage.getItem(key) === null;
    } catch {
      return false;
    }
  },
  };
}

// 스토어는 id 마다 하나씩만 만든다. 매 렌더 새로 만들면 subscribe 가 매번 다시 걸려
// 무한 루프가 된다(useSyncExternalStore 가 함수 동일성을 본다).
const stores = new Map<string, ReturnType<typeof makeStore>>();
function storeFor(id: string) {
  let st = stores.get(id);
  if (!st) {
    st = makeStore(KEY_PREFIX + id);
    stores.set(id, st);
  }
  return st;
}

function markSeen(id: string) {
  try {
    localStorage.setItem(KEY_PREFIX + id, "1");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function TapHint({ id, href, text }: { id: string; href: string; text: string }) {
  const store = storeFor(id);
  const show = useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
  const ref = useRef<HTMLLIElement>(null);

  // 쪽지가 아니라 **줄을 직접 누른** 사람도 알아들은 것이다. 그때도 껐다고 적어야
  // 돌아왔을 때 또 안 뜬다. 부모 <ul> 에 걸어 두면 이 카드의 어느 줄을 눌러도 잡힌다.
  // click 이 아니라 pointerdown 인 이유: 링크를 누르면 그대로 페이지가 떠나서 click 이
  // 안 올 수 있다.
  useEffect(() => {
    const list = ref.current?.closest("ul");
    if (!list) return;
    const onDown = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return; // 쪽지 자신은 아래 onClick 이 처리
      markSeen(id);
    };
    list.addEventListener("pointerdown", onDown);
    return () => list.removeEventListener("pointerdown", onDown);
  }, [id]);

  return (
    // ⚠️ `hidden` 이지 `return null` 이 아니다. 이유는 파일 머리 주석의 '하나'.
    <li ref={ref} className="hz-tap-hint" hidden={!show}>
      {/* 쪽지 자체를 링크로 둔다. "누르라"고 적어 놓고 정작 쪽지를 누르면 아무 일도 없으면
          그게 더 헷갈린다. 목적지는 바로 위 줄과 같은 종목이다. */}
      <Link href={href} onClick={() => markSeen(id)} className="hz-tap-hint-go">
        <Icon name="arrow_upward" style={{ fontSize: 16, flexShrink: 0 }} />
        <span style={{ flex: 1, wordBreak: "keep-all" }}>{text}</span>
      </Link>
      <button
        type="button"
        onClick={() => markSeen(id)}
        aria-label="닫기"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: R.control,
          border: "none",
          background: "transparent",
          color: "inherit",
          opacity: 0.7,
          cursor: "pointer",
        }}
      >
        <Icon name="close" style={{ fontSize: 16 }} />
      </button>
    </li>
  );
}

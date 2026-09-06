"use client";

import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/ga";

import { Icon } from "../ui";

/**
 * 글 카드 오른쪽 아래의 공유 단추.
 *
 * ## 이 화면의 유일한 클라이언트 컴포넌트다
 *
 * 나머지는 전부 서버가 그린다(NoteView 머리말). 여기만 예외인 이유는 주소를 클립보드에
 * 넣는 일이 브라우저 API 라서다. 단추 하나라 번들에 실리는 양도 그만큼이다.
 *
 * ## 어느 주소를 주나
 *
 * **날짜가 든 주소**(`/daily/2026-09-05`)를 준다. `/daily` 는 늘 최신 글이라 그 주소를
 * 공유하면 내일 다른 글이 열린다 — 받는 사람이 보는 글이 보낸 사람이 본 글과 달라진다.
 * 그래서 최신 글에서 눌러도 그날의 고정 주소를 넘긴다(`path` 를 그렇게 받는다).
 *
 * 앞부분은 `window.location.origin` 에서 가져온다. 상수로 박으면 로컬에서 눌렀을 때
 * 프로덕션 주소가 복사돼, 아직 안 연 화면에서는 열리지도 않는 주소를 손에 쥐게 된다.
 *
 * ## 두 갈래
 *
 * 폰에는 운영체제 공유 시트가 있다(`navigator.share`). 그쪽이 있으면 그걸 먼저 쓰고,
 * 없으면 주소를 복사한다. ⚠️ **공유 시트를 사용자가 닫은 것(AbortError)은 실패가 아니다** —
 * 거기서 "복사하지 못했습니다"를 띄우면 취소했는데 고장 났다고 말하는 꼴이다.
 */
type State = "idle" | "copied" | "failed";

const LABEL: Record<State, string> = {
  idle: "공유",
  copied: "주소를 복사했습니다",
  failed: "복사하지 못했습니다",
};

/**
 * 주소를 클립보드에 넣는다. 됐으면 true.
 *
 * ⭐ **두 갈래를 다 쓴다.** 요즘 방식(`navigator.clipboard`)이 막히는 자리가 실제로 있다 —
 * https 가 아닌 주소, 권한을 안 준 브라우저, 자동화 창(우리 검증 브라우저가 여기다).
 * 그때 옛 방식(숨긴 textarea + `execCommand`)은 그대로 동작한다. 낡았지만 지금도 모든
 * 브라우저가 지원하고, 실패해도 화면에 아무 흔적을 안 남긴다.
 */
async function copy(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // 아래로 물러선다.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    // 화면 밖에 두되 readOnly 로 둔다 — 폰에서 키보드가 올라오는 것을 막는다.
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ShareButton({ path, title }: { path: string; title: string }) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 알림을 띄운 채 다른 글로 넘어가면 타이머만 남는다. 떠날 때 걷는다.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flash = (next: State) => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  };

  const onClick = async () => {
    const url = `${window.location.origin}${path}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        track("note_share", { method: "system" });
        return;
      } catch (e) {
        // 취소는 조용히 끝낸다. 그 밖의 실패는 아래 복사로 물러선다.
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    if (await copy(url)) {
      flash("copied");
      track("note_share", { method: "copy" });
    } else {
      // 조용히 아무 일도 없는 것보다 안 됐다고 말하는 편이 낫다.
      flash("failed");
    }
  };

  return (
    // aria-label 을 따로 준다. 아이콘 폰트의 글리프 이름("share")이 글자로 남아 있어서,
    // 안 주면 단추 이름이 "share 공유" 로 읽히고 누른 뒤에는 "share 주소를 복사했습니다"
    // 가 된다 — 단추 이름은 눌러도 안 변해야 한다. 결과 알림은 아래 live 영역이 따로 낸다.
    <button type="button" className="hz-note-share" aria-label="공유" data-done={state === "copied"} onClick={onClick}>
      <Icon name={state === "copied" ? "check" : "share"} style={{ fontSize: 17 }} />
      {/* 글자가 바뀌는 자리라 스크린 리더에도 바뀐 것을 알린다. */}
      <span aria-live="polite">{LABEL[state]}</span>
    </button>
  );
}

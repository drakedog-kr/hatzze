"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { APP_VERSION, RELEASES } from "./releases";
import { MONO } from "./ui";

/**
 * 푸터 버전 표기 옆의 **빨간 N 배지** — "그 사이에 새 판이 나왔습니다".
 *
 * ## 언제 뜨는가
 *
 * 두 조건을 **모두** 만족할 때만 뜬다.
 *   ① 이 방문자가 **아직 안 본 버전**이 올라와 있다(마지막으로 확인한 버전 ≠ 지금 버전).
 *   ② 그 버전이 **최근에 나왔다**({@link FRESH_DAYS}일 이내).
 *
 * ⭐ **적힌 게 아예 없는 첫 방문자도 ①에 든다.** 그 사람은 어느 판도 확인한 적이 없으니
 * 지금 판이 '안 본 버전'인 것이 맞다. 눌러서 기록을 보기 전까지는 계속 켜져 있다.
 *
 * ②를 함께 거는 까닭은 배지가 저절로 꺼지게 하기 위해서다. ①만으로 두면 한 번도 안
 * 누르는 사람에게는 빨간 점이 영영 켜져 있고, 늘 켜져 있는 알림은 아무것도 알리지
 * 못한다("red dot blindness"). 열나흘 넘게 새 판이 없으면 아무도 안 눌러도 스스로 꺼지고,
 * 다음 판이 올라오는 순간 다시 켜진다.
 *
 * ## 언제 꺼지는가
 *
 * 업데이트 기록을 보면 꺼진다. 끄는 자리가 둘인 것은 들어가는 길이 둘이기 때문이다.
 *   · 푸터의 버전을 눌렀을 때(누른 즉시 꺼져야 눌린 게 보인다)
 *   · /changelog 에 **다른 길로** 닿았을 때(사이드바·검색·주소 직접 입력) → {@link ChangelogSeen}
 *
 * ## 기계
 *
 * `useEffect` + `useState` 가 아니라 `useSyncExternalStore` 를 쓴다. localStorage 는 리액트
 * 바깥의 저장소라 이게 정석이고, 서버 스냅샷을 false 로 두면 SSR 이 배지를 안 그려
 * 하이드레이션이 어긋나지 않는다. 소식 띠(AppShell 의 NewsStrip)·PC 권유 토스트와 같은 꼴이다.
 */

/**
 * 마지막으로 **확인한** 버전을 적어 둔다(값은 "1.11.1" 같은 SemVer 문자열).
 *
 * ⚠️ 이름 뒤의 `-v2` 는 장식이 아니다. 이 배지의 첫 판에는 "첫 방문자에게는 안 띄우고
 * 지금 버전을 조용히 적어 둔다" 는 줄이 있었는데, 그 줄이 도는 순간 **아직 배지를 한
 * 번도 못 본 사람의 브라우저에 '봤음' 이 적혔다.** 줄을 빼도 이미 적힌 값은 못 지운다.
 * 키를 갈면 그 사람들이 다시 '안 본 사람' 이 된다(옛 값은 옛 키에 남아 있을 뿐 새 키를
 * 막지 않는다). 프로덕션에 나간 적 없는 판이라 갈아서 잃는 것도 없다.
 *
 * ⭐ 같은 수법을 소식 띠(AppShell 의 NEWS)가 쓴다. **키를 되쓰면 그 사람들은 못 본다** 는
 * 것이 이 저장소가 두 번 겪은 교훈이다. 앞으로도 판정 규칙을 바꿀 때는 키를 함께 갈 것.
 */
const SEEN_KEY = "hz-changelog-seen-v2";
/** 같은 화면 안에서 배지를 끄려면 스토어에 바뀐 것을 알려야 한다. */
const SEEN_EVENT = "hz-changelog-seen-change";
/** 배포 뒤 며칠까지 '새것'으로 볼지. */
const FRESH_DAYS = 14;

/* 툴팁 문구. 배지가 떠 있을 때만 앞머리가 붙는다. 화면에 보이는 글이자 읽어 주는 기계에
   넘기는 이름이라, 두 곳이 갈리지 않게 한 곳에 적어 두 자리가 같이 읽는다. */
const TIP_PLAIN = "업데이트 기록 보기";
const TIP_NEW = "새 업데이트가 있습니다. 업데이트 기록 보기";

/**
 * 배포일로부터 며칠이 지났는지. **KST 로 센다.**
 *
 * `releases.ts` 의 날짜가 KST 기준이라 방문자의 시계로 빼면 시차만큼 하루가 어긋난다.
 * 브라우저 시각을 서울 날짜로 한 번 옮겨 놓고 날짜끼리 뺀다(en-CA 가 YYYY-MM-DD 를 준다).
 */
function daysSinceKst(date: string): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const from = Date.parse(`${date}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  // 날짜 형식이 깨졌으면 '새것 아님'으로 떨어뜨린다 — 못 읽는 날짜 때문에 배지가
  // 영영 켜져 있는 편보다, 안 뜨고 마는 편이 덜 나쁘다.
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

/* 모듈이 브라우저에 실린 순간 한 번만 센다. 방문자가 한 화면을 자정 너머까지 열어 두면
   그날치 판정이 남지만, 그 사이 배지가 하루 더 켜져 있을 뿐이라 손해가 없다.
   (SSR 때도 이 줄이 돌지만 그 값은 안 쓰인다 — 서버 스냅샷은 언제나 false 다.) */
const FRESH = daysSinceKst(RELEASES[0].date) <= FRESH_DAYS;

const seenStore = {
  subscribe(cb: () => void) {
    window.addEventListener(SEEN_EVENT, cb);
    return () => window.removeEventListener(SEEN_EVENT, cb);
  },
  getSnapshot() {
    try {
      // 적힌 게 없으면(첫 방문) null 이라 지금 버전과 저절로 어긋난다 — 그대로 '안 본
      // 버전'이 되어 배지가 뜬다. 따로 가르지 않는 것이 곧 첫 방문자를 포함하는 것이다.
      return localStorage.getItem(SEEN_KEY) !== APP_VERSION && FRESH;
    } catch {
      // 사파리 사생활 보호 모드 등에서 접근 자체가 던진다. 그때는 안 띄운다 — 본 것을
      // 기억할 수 없으니, 띄우면 갈 때마다 다시 뜬다(소식 띠와 같은 판단).
      return false;
    }
  },
};

/** 지금 버전을 '봤다'고 적고, 화면의 배지를 바로 끈다. */
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {}
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/**
 * 푸터의 버전 링크. 새 판이 나와 있으면 우측 상단에 빨간 N 이 붙는다.
 *
 * 배지만 따로 떼지 않고 링크째 클라이언트 컴포넌트로 둔다. 누르는 순간 배지가 꺼져야
 * 하는데, 그 처리가 링크에 붙기 때문이다. 푸터는 이미 클라이언트인 AppShell 안에 있어
 * 이 때문에 늘어나는 번들은 없다.
 */
export function VersionLink() {
  const show = useSyncExternalStore(seenStore.subscribe, seenStore.getSnapshot, () => false);

  return (
    /* ⚠️ 색과 밑줄은 인라인에 두지 않는다 — 인라인 style 은 globals.css 의 :hover 를
       이겨서 호버가 통째로 안 먹는다. 글자꼴만 여기 두고 나머지는 클래스로.

       배지를 링크 **안에** 넣는다. 밖에 두면 빨간 동그라미만 눌리지 않아 과녁이 갈리고,
       읽어 주는 기계에서도 "새 업데이트" 가 링크 이름에서 떨어져 나온다.
       ⚠️ 그 대신 버전 글자를 .hz-version-num 스팬으로 한 겹 감싼다 — 호버 밑줄을 링크가
          아니라 그 스팬에 걸어야 배지에 줄이 안 그어진다(까닭은 globals.css 쪽 주석).
       lineHeight 를 1 로 못 박는 것은 아래 배지의 lift 가 글자 상자 높이를 전제하기 때문이다. */
    <Link
      href="/changelog"
      /* ⚠️ **title 속성을 쓰지 않는다.** 브라우저가 1~2초 뜸을 들이고 그 지연은 CSS 로
         못 없앤다(2026-09-09 지적). 이 저장소의 툴팁(.hz-tip + data-tip)은 곧바로 뜨고,
         자리·방향·잘림까지 전역 규칙이 이미 맡고 있다 — globals.css 의 .hz-tip 참고. */
      className="hz-version-link hz-tip"
      data-tip={show ? TIP_NEW : TIP_PLAIN}
      /* 이름을 글자에서 만들게 두면 툴팁 ::after 의 글까지 딸려 들어와 같은 말이 두 번
         읽힌다. 여기서 못박아 두면 그 셈이 아예 안 일어난다.
         ⚠️ 눈에 보이는 글자("v.1.12.0")로 시작해야 한다 — 이름이 보이는 글자를 품지
            않으면 음성으로 조작하는 사람이 본 대로 부를 수 없다(WCAG 2.5.3). */
      aria-label={`v.${APP_VERSION} · ${show ? TIP_NEW : TIP_PLAIN}`}
      onClick={markSeen}
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 2,
        /* .hz-tip 이 cursor:default 를 걸어 둔다(툴팁이 달렸다고 "?" 커서를 주지 않으려는
           규칙). 여기는 링크라 손가락이어야 하므로 인라인으로 되돌린다. */
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: "0.02em",
      }}
    >
      <span className="hz-version-num">v.{APP_VERSION}</span>
      {show && <NewBadge />}
    </Link>
  );
}

/**
 * 배지 지름(px)과 글자 크기(px).
 *
 * ⚠️ **지름을 버전 글자(11px)보다 크게 두지 말 것.** 처음엔 13 이었는데 "너무 크다" 였다
 * (2026-09-09). 이 표기는 로고 옆에서 조용하라고 크기·색을 일부러 낮춰 둔 자리라, 배지가
 * 글자보다 커지면 주석이 본문을 누른다. 11 이면 동그라미가 글자 높이를 안 넘는다.
 *
 * 글자 8 은 베타 배지와 같은 값이다. 이 저장소의 글자 바닥은 11 이지만 **로고에 얹히는
 * 상표 부속 둘만 8 로 남긴다** — 읽는 글이 아니라 표식이라서다. 지름 11 안에서 위아래
 * 여백이 2.6px 씩 남아 한 글자가 답답하지 않다.
 */
const BADGE_SIZE = 11;
const BADGE_FONT = 8;
/**
 * 11px 글자의 **잉크 꼭대기**가 글자 상자 위에서 얼마나 내려와 있는지(px).
 *
 * 브라우저에서 잰 값이다(11px Pretendard 600 · canvas TextMetrics). 폰트 상자가 10 + 3 =
 * 13 인데 line-height 1 이라 반-리딩이 −1 이고, 잉크 꼭대기는 폰트 상자 위에서
 * 10 − 7.88 = 2.12 이므로 −1 + 2.12 = 1.12 다.
 *
 * ⚠️ 이 셈은 링크에 `lineHeight: 1` 이 박혀 있다는 전제 위에 선다. 그 줄을 지우면 글자
 * 상자가 본문 행간만큼 커지면서 아래 lift 가 통째로 어긋난다.
 */
const INK_TOP = 1.12;
/**
 * 배지를 글자 상자 위로 끌어올리는 값(px).
 *
 * 위첨자로 보이려면 동그라미의 **가운데**가 글자의 윗머리께에 와야 한다. 상자 윗선끼리
 * 맞추면(=lift 0) 동그라미가 아래로 처져, 위첨자가 아니라 글자에 걸터앉은 것처럼 보인다.
 * 반올림하는 것은 정수라야 동그라미가 하위픽셀에 걸려 흐려지지 않기 때문이다.
 *
 * ⭐ 지름에서 **계산한다.** 두 값을 따로 적어 두면 크기를 손볼 때 한쪽만 고쳐서 배지가
 * 조용히 어긋난 자리에 앉는다.
 */
const BADGE_LIFT = Math.round(BADGE_SIZE / 2 - INK_TOP);

/* 'N' 은 **보는 사람에게만** 뜻이 통하는 표시라 읽어 주는 기계에서는 뺀다. 같은 뜻은
   링크의 aria-label 이 "새 업데이트가 있습니다" 로 말한다.
   ⛔ role="img" + aria-label 로 바꾸지 말 것 — 크롬은 안쪽 'N' 을 그대로 남긴다. */
function NewBadge() {
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        /* ⚠️⚠️ **flex 가운데 정렬(alignItems:center)로 앉히지 말 것.** 그건 글자의 잉크가
           아니라 **폰트 상자**를 가운데 두는데, 8px Pretendard 의 상자는 위 8 · 아래 2 로
           비대칭인 데다 'N' 은 대문자라 베이스라인 위에만 잉크가 있다. 그래서 flex 로
           맞추면 N 이 **0.83px 위로 치우친다**(2026-09-09 실측. 지름 11 에서 눈에 보인다).
           행간으로 앉히면 반-리딩이 위아래로 똑같이 나뉘어 베이스라인이 제자리에 온다:
             반-리딩 (11 − (8+2))/2 = 0.5 → 베이스라인 8.5 → N 잉크(높이 5.66)의 가운데 5.67
           동그라미 가운데 5.5 와 0.17px 차이다. 어긋남이 5분의 1로 준다.
           가로도 text-align 이 글자 **폭**을 가운데 두는데, N 은 좌우 side bearing 이
           0.43 로 같아서 잉크까지 그대로 가운데에 온다. */
        display: "block",
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        lineHeight: `${BADGE_SIZE}px`,
        textAlign: "center",
        marginTop: -BADGE_LIFT,
        borderRadius: 999,
        /* ⚠️ 배지 색은 --c-hot 이 아니라 --c-new 다. 라이트에서는 값이 같지만 뜻이
           다르고(온도가 아니다), 다크에서는 --c-hot 위의 흰 글자가 AA 에 못 미친다.
           자세한 근거는 globals.css 의 --c-new 주석.
           ⚠️ 대체값을 붙여 둔다. 변수를 못 찾으면 background 가 통째로 무효가 되는데,
              글자가 흰색이라 **배지가 사라진 것처럼 보인다**(안 뜨는 것과 구별이 안 된다).
              낡은 CSS 청크를 물고 있는 화면에서 실제로 그렇게 될 수 있다. */
        background: "var(--c-new, #cd3945)",
        color: "#fff",
        fontSize: BADGE_FONT,
        fontWeight: 800,
        /* 자간은 0 이어야 한다. 링크가 0.02em(11px 에서 **0.22px**)을 물려주는데, 자간은
           글자 **뒤**에 붙는다. 한 글자짜리 배지에서는 오른쪽에만 0.22px 이 더 붙어
           라인박스가 그만큼 넓어지고, text-align:center 가 그 상자를 가운데 두므로 N 이
           0.11px 왼쪽으로 밀린다. 지워 보고 실측한 값이다(크롬은 0px 을 normal 로 적는다). */
        letterSpacing: 0,
      }}
    >
      N
    </span>
  );
}

/**
 * 업데이트 기록 화면이 열렸다는 표시. 그 화면에 한 번 걸어 두면, 푸터를 안 거치고
 * 들어온 사람도 배지가 꺼진다. 그리는 것은 없다.
 */
export function ChangelogSeen() {
  useEffect(markSeen, []);
  return null;
}

import pretendardPkg from "pretendard/package.json";

/**
 * 본문 글꼴 Pretendard 쪼갠 판의 주소. scripts/copy-pretendard.mjs 가 설치·빌드 때 `node_modules/pretendard` 에서
 * 이 경로로 복사한다 — 경로 규칙(`/fonts/pretendard-<버전>`)은 그 스크립트와 같아야 한다.
 *
 * 버전을 경로에 넣는 까닭: next.config.ts 가 `/fonts/*` 에 1년 불변 캐시를 건다. 글꼴을 올리면 주소가 바뀌어야
 * 옛 조각을 계속 쓰지 않는다.
 */
export const PRETENDARD_BASE = `/fonts/pretendard-${pretendardPkg.version}`;
export const PRETENDARD_CSS = `${PRETENDARD_BASE}/pretendardvariable-dynamic-subset.css`;

/**
 * 미리 받는 조각 — **모든 화면이 쓰는 것만**. 셸(사이드바·머리·푸터) 글자가 여기 든다.
 *
 * 2026-09-26 실측: 홈·카더라 둘·테마·배당·종목·MDD·내부자·업데이트 기록 아홉 화면에 공통으로 필요한 조각이 12개
 * 319KB 였다. 어차피 받을 것이라 바이트를 더 쓰지 않고 첫 화면 글자만 일찍 뜬다. 화면마다 따로 필요한 조각은
 * 글자를 그릴 때 브라우저가 받는다(쪼갠 판 CSS 의 unicode-range).
 * ⚠️ 셸 문구가 크게 바뀌면 목록이 조금 어긋날 수 있다. 어긋나도 깨지지는 않는다 — 그 조각을 늦게 받을 뿐이다.
 */
const PRELOAD_SUBSETS = [20, 24, 81, 82, 84, 85, 86, 87, 88, 89, 90, 91];
export const PRETENDARD_PRELOAD = PRELOAD_SUBSETS.map(
  (n) => `${PRETENDARD_BASE}/woff2-dynamic-subset/PretendardVariable.subset.${n}.woff2`,
);

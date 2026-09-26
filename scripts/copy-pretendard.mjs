/**
 * Pretendard 쪼갠 판(dynamic subset)을 `public/fonts/pretendard-<버전>/` 으로 복사한다.
 * `npm install`·`npm ci` 뒤(postinstall)와 `npm run build` 앞(prebuild)에 저절로 돈다. 몇 번 돌려도 같다.
 *
 * ## 왜 복사하나
 *
 * 예전엔 전체판(`PretendardVariable.woff2`, 2,057,688바이트)을 next/font 로 싣고 모든 화면이 미리 받았다. 쪼갠 판은
 * 글자 범위별 92조각이라 화면에 나온 글자가 든 조각만 받는다(2026-09-26 실측: 화면당 376~596KB).
 *
 * next/font 나 CSS import 로 부르면 Next 가 주소 끝에 배포마다 바뀌는 `?dpl=` 를 붙인다(Vercel 의 배포 어긋남 보호).
 * 1년 캐시를 걸어도 배포(하루 4~14번)마다 주소가 새것이라 재방문자가 글꼴을 다시 받는다. `public/` 의 파일은 주소가
 * 그대로라 한 번 받은 조각을 계속 쓴다. 대신 경로에 **버전을 넣어** 글꼴을 올리면 주소가 바뀌게 한다 —
 * next.config.ts 가 이 경로에 1년 불변 캐시를 건다.
 *
 * ⚠️ 복사본은 저장소에 올리지 않는다(.gitignore). 원본은 `node_modules/pretendard` 하나다.
 * ⚠️ 경로 규칙(`/fonts/pretendard-<버전>`)은 lib/fonts.ts 와 같아야 한다.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "pretendard");
if (!existsSync(pkgDir)) {
  // 설치 전(예: 저장소만 받아 둔 상태)이면 조용히 끝낸다. 설치하면 postinstall 이 다시 부른다.
  console.log("[copy-pretendard] node_modules/pretendard 가 없어 건너뜁니다");
  process.exit(0);
}
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const src = join(pkgDir, "dist", "web", "variable");
const fontsDir = join(root, "public", "fonts");
const dest = join(fontsDir, `pretendard-${version}`);

// 옛 버전 폴더는 지운다 — 남아 있으면 쓰지도 않는 파일이 배포에 실린다.
if (existsSync(fontsDir)) {
  for (const name of readdirSync(fontsDir)) {
    if (name.startsWith("pretendard-") && name !== `pretendard-${version}`) rmSync(join(fontsDir, name), { recursive: true, force: true });
  }
}
mkdirSync(dest, { recursive: true });
cpSync(join(src, "pretendardvariable-dynamic-subset.css"), join(dest, "pretendardvariable-dynamic-subset.css"));
cpSync(join(src, "woff2-dynamic-subset"), join(dest, "woff2-dynamic-subset"), { recursive: true });
// 글꼴 사용 허가(SIL OFL 1.1)는 함께 배포하라고 적혀 있다 — 허가문은 위 CSS 파일 머리에 통째로 들어 있다.
console.log(`[copy-pretendard] public/fonts/pretendard-${version} 에 ${readdirSync(join(dest, "woff2-dynamic-subset")).length}조각을 두었습니다`);

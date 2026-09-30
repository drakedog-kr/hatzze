/**
 * hatzze.fun 화면을 폰 크기로 찍는다 — 소개 글에 넣는 '실제 화면' 그림의 재료.
 *
 *     CHROME=<chrome-headless-shell 경로> node docs/naver-blog/capture.mjs
 *     BASE=http://localhost:3000 ... node docs/naver-blog/capture.mjs   # 다른 주소에서 찍기
 *
 * 결과는 intro/shots/ 에 쓰고, render.mjs 가 그걸 틀에 넣어 intro/04·05·06 을 만든다.
 * 폰으로 직접 캡처한 그림을 같은 이름으로 intro/shots/ 에 두어도 된다(render.mjs 는 위쪽만 잘라 쓴다).
 *
 * ## 왜 폰 크기인가
 *
 * 블로그 독자는 대부분 폰으로 읽는다. 데스크톱 화면을 1080 폭에 줄여 넣으면 글자가 0.7배로 작아져
 * 읽히지 않는다. 폰 폭(390)을 세 배로 찍으면 1170 이라, 틀에 넣어도 글자가 원래보다 크게 보인다.
 *
 * ⚠️ 폰 폭에서는 화면 아래에 'PC를 권해 드립니다' 알림이 뜬다. 틀은 위쪽만 잘라 쓰므로 들어가지 않는다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "intro", "shots");
const BASE = process.env.BASE ?? "https://hatzze.fun";

/** 찍을 화면. 조작 없이 첫 화면에 숫자가 서는 곳만 고른다(배당으로 살기는 종목을 담아야 숫자가 선다). */
const SHOTS = [
  { file: "briefing.png", path: "/" },
  { file: "kadera.png", path: "/kadera" },
  { file: "theme.png", path: "/theme" },
];

/** render.mjs 의 chromePath 와 같은 까닭으로 헤드리스 셸을 쓴다(일반 크롬은 창 아래 87px 을 잘라 그린다). */
function chromePath() {
  const candidates = [process.env.CHROME, "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"];
  const hit = candidates.find((p) => p && existsSync(p));
  if (!hit) throw new Error("헤드리스 셸을 못 찾았습니다. CHROME=<chrome-headless-shell 경로> 로 알려 주세요.");
  return hit;
}

const chrome = chromePath();
mkdirSync(OUT, { recursive: true });
for (const s of SHOTS) {
  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--disable-lcd-text",
      "--hide-scrollbars",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
      "--window-size=390,844",
      "--force-device-scale-factor=3",
      // 화면이 자료를 받아 그리고 글꼴·아이콘이 설 때까지 기다린다.
      "--virtual-time-budget=15000",
      `--screenshot=${join(OUT, s.file)}`,
      `${BASE}${s.path}`,
    ],
    { stdio: "ignore" },
  );
  console.log(`${s.file}  ←  ${BASE}${s.path}`);
}

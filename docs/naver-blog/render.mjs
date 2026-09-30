/**
 * 네이버 블로그에 올릴 이미지 네 장을 그린다 — 프로필 · 모바일 커버 · PC 타이틀 · 위젯 배너.
 *
 *     CHROME=<chrome-headless-shell 경로> node docs/naver-blog/render.mjs   # 같은 폴더에 PNG 네 장
 *
 * 그림은 HTML 로 짜고 크롬 헤드리스 셸로 찍는다(아래 chromePath 머리말). 서체는 사이트가 이미 받는 두 패키지
 * (pretendard · @fontsource/bricolage-grotesque)를 node_modules 에서 읽으니 `npm install`
 * 이 되어 있으면 따로 받을 것이 없다.
 *
 * ## 로고는 app/icon.svg 를 그대로 쓴다
 *
 * 유령 심볼의 길(path)과 색(#0064ff)을 여기 다시 적지 않고 파일에서 읽는다. 로고를 고치면
 * 이 스크립트만 다시 돌리면 된다. 워드마크는 app/Logo.tsx 의 규격(Bricolage Grotesque 700,
 * 자간 -0.035em, 소문자 hatzze)을 따른다.
 *
 * ## 말풍선 네 개는 블로그 카테고리 넷이다
 *
 * 오늘 뭐래?(데일리 요약) · 요즘 무슨 테마?(테마) · 배당 얼마 받지?(배당) · 고점 대비 몇 %?(MDD).
 * ⚠️ 사라/팔라로 읽힐 말과 종목 이름은 넣지 않는다(app/og-card.tsx 의 ChatterArt 와 같은 규칙).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const NM = join(ROOT, "node_modules");
const PRETENDARD = join(NM, "pretendard/dist/public/static");
const BRICOLAGE = join(NM, "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2");

const ICON = readFileSync(join(ROOT, "app/icon.svg"), "utf8");
/** 로고 파랑. app/icon.svg 의 배경색을 읽는다 — 화면 토큰(--c-blue #3182f6)이 아니라 원본 로고색이다. */
const BRAND = ICON.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/)[1];
/** 유령 몸통 길. 같은 파일에서 읽는다. */
const GHOST_PATH = ICON.match(/<path d="([^"]+)"/)[1];
/** 커버·타이틀의 아래쪽 색. 네이버가 커버 아래에 블로그명·별명을 흰 글자로 얹어서 아래를 조금 어둡게 둔다. */
const DEEP = "#0047c2";
const INK = "#0e2136"; // --c-ink

/**
 * 크롬 **헤드리스 셸**(chrome-headless-shell)을 쓴다.
 *
 * ⚠️ 일반 크롬의 헤드리스(--headless)는 창 크기에서 보이지 않는 도구 막대 높이(87px)를 빼고
 * 화면을 잡는다. 1300 으로 찍으면 위 1213 만 그려지고 아래는 배경색으로 채워져, 타이틀의
 * 셋째 말풍선이 반쯤 잘려 나왔다(첫 시도). 헤드리스 셸은 창 크기 그대로 그린다.
 * 없으면 `npx @puppeteer/browsers install chrome-headless-shell@stable` 로 받는다.
 */
function chromePath() {
  const candidates = [process.env.CHROME, "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"];
  const hit = candidates.find((p) => p && existsSync(p));
  if (!hit) throw new Error("헤드리스 셸을 못 찾았습니다. CHROME=<chrome-headless-shell 경로> 로 알려 주세요.");
  return hit;
}

/** 유령 심볼. h 는 높이(px), 폭은 viewBox 비율(100/104)을 따른다. 몸통 흰색 · 눈 로고 파랑(app/icon.svg 와 같은 배색). */
function ghost(h, { body = "#ffffff", eye = BRAND } = {}) {
  return (
    `<svg width="${((h * 100) / 104).toFixed(1)}" height="${h}" viewBox="0 0 100 104" style="display:block">` +
    `<path d="${GHOST_PATH}" fill="${body}"/>` +
    `<ellipse cx="39" cy="50" rx="9.5" ry="12" fill="${eye}"/><circle cx="66" cy="52" r="7" fill="${eye}"/>` +
    `<circle cx="42" cy="45" r="3" fill="${body}"/></svg>`
  );
}

function wordmark(size, color = "#ffffff") {
  return `<span class="wm" style="font-size:${size}px;color:${color}">hatzze</span>`;
}

/**
 * 말풍선. tail 은 꼬리 자리(각진 모서리) — 유령 쪽을 향하게 둔다.
 * app/og-card.tsx 의 ChatterArt 와 같은 모양(한 모서리만 각지게)이다.
 */
function bubble(text, { x, y, size, tail }) {
  const r = Math.round(size * 0.95);
  const s = Math.round(size * 0.3);
  const radius = {
    bl: `${r}px ${r}px ${r}px ${s}px`,
    br: `${r}px ${r}px ${s}px ${r}px`,
    tl: `${s}px ${r}px ${r}px ${r}px`,
    tr: `${r}px ${s}px ${r}px ${r}px`,
  }[tail];
  return (
    `<div class="bubble" style="left:${x}px;top:${y}px;font-size:${size}px;` +
    `padding:${Math.round(size * 0.5)}px ${Math.round(size * 0.8)}px;border-radius:${radius}">${text}</div>`
  );
}

function page(w, h, body, extraCss = "") {
  const font = (weight, file) =>
    `@font-face{font-family:Pretendard;font-weight:${weight};src:url("${pathToFileURL(join(PRETENDARD, file))}")}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
${font(500, "Pretendard-Medium.otf")}
${font(700, "Pretendard-Bold.otf")}
${font(800, "Pretendard-ExtraBold.otf")}
@font-face{font-family:Bricolage;font-weight:700;src:url("${pathToFileURL(BRICOLAGE)}")}
*{box-sizing:border-box}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
body{position:relative;font-family:Pretendard,sans-serif;color:#fff;background:${BRAND};
  -webkit-font-smoothing:antialiased;word-break:keep-all}
.wm{font-family:Bricolage,sans-serif;font-weight:700;letter-spacing:-0.035em;line-height:1;display:inline-block}
.bubble{position:absolute;background:#fff;color:${INK};font-weight:700;letter-spacing:-0.02em;line-height:1;white-space:nowrap;
  box-shadow:0 10px 30px rgba(0,20,70,.18)}
${extraCss}
</style></head><body>${body}</body></html>`;
}

/* ─── 네 장 ─────────────────────────────────────────────────────────── */

/** 프로필. app/icon.svg 에서 모서리 둥글림만 뺀다 — 네이버가 원으로 잘라 보여서 둥근 모서리가 이중으로 깎인다. */
const profile = {
  file: "profile-512.png",
  w: 512,
  h: 512,
  scale: 1,
  html: page(
    512,
    512,
    ICON.replace(/ rx="\d+"/, "").replace(/width="\d+" height="\d+"/, 'width="512" height="512"'),
  ),
};

/**
 * 모바일 앱 커버(1080×1300). 폰으로 들어오는 사람이 가장 먼저 보는 판이다.
 * 위 160px 은 네이버 상단 바가, 아래 480px 쯤은 블로그명·별명·이웃추가 단추가 덮는다 —
 * 그림은 그 사이에 모은다.
 */
const cover = {
  file: "mobile-cover-1080x1300.png",
  w: 1080,
  h: 1300,
  scale: 1,
  html: page(
    1080,
    1300,
    `
<div style="position:absolute;inset:0;background:linear-gradient(180deg,${BRAND} 0%,${BRAND} 45%,${DEEP} 100%)"></div>
<!-- 뒤의 선은 오르내리기만 하고 방향이 없다. 오른쪽 위로 치솟는 선은 '오른다'로 읽힌다. -->
<svg style="position:absolute;left:0;top:0" width="1080" height="1300" viewBox="0 0 1080 1300">
  <polyline points="-10,600 110,650 210,590 320,640 430,560 540,620 650,570 760,640 870,580 980,630 1090,590"
    fill="none" stroke="rgba(255,255,255,.16)" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
<div style="position:absolute;left:${540 - 150}px;top:330px">${ghost(312)}</div>
${bubble("오늘 뭐래?", { x: 96, y: 236, size: 40, tail: "br" })}
${bubble("배당 얼마 받지?", { x: 650, y: 268, size: 40, tail: "bl" })}
${bubble("요즘 무슨 테마?", { x: 70, y: 610, size: 40, tail: "tr" })}
${bubble("고점 대비 몇 %?", { x: 668, y: 640, size: 40, tail: "tl" })}
`,
  ),
};

/**
 * PC 타이틀(966×300). 글자를 그림에 넣었으니 네이버 쪽 '블로그 제목' 글자 표시는 끄고 쓴다.
 */
const title = {
  file: "pc-title-966x300.png",
  w: 966,
  h: 300,
  scale: 1,
  html: page(
    966,
    300,
    `
<div style="position:absolute;inset:0;background:linear-gradient(120deg,${BRAND} 0%,${BRAND} 55%,${DEEP} 100%)"></div>
<div style="position:absolute;left:64px;top:0;height:300px;display:flex;flex-direction:column;justify-content:center">
  <div style="display:flex;align-items:center;gap:18px">${ghost(84)}${wordmark(82)}</div>
  <div style="margin-top:22px;font-size:30px;font-weight:800;letter-spacing:-0.03em">데이터와 여론으로 읽는 시장</div>
  <div style="margin-top:10px;font-size:19px;font-weight:500;opacity:.78;letter-spacing:-0.01em">매일 저녁 데일리 요약 · 배당 · 테마 · MDD</div>
</div>
${bubble("오늘 뭐래?", { x: 650, y: 54, size: 22, tail: "bl" })}
${bubble("배당 얼마 받지?", { x: 716, y: 118, size: 22, tail: "br" })}
${bubble("요즘 무슨 테마?", { x: 616, y: 182, size: 22, tail: "tl" })}
`,
  ),
};

/**
 * 위젯 배너(170×600). 위젯 직접등록은 HTML 이라 <img width="170"> 로 크기를 못 박을 수 있어서
 * 두 배(340×1200)로 찍는다 — 선명한 화면에서 번지지 않는다.
 */
const widget = {
  file: "widget-170x600@2x.png",
  w: 170,
  h: 600,
  scale: 2,
  html: page(
    170,
    600,
    `
<div style="position:absolute;inset:0;background:linear-gradient(180deg,${BRAND} 0%,${BRAND} 60%,${DEEP} 100%)"></div>
<div style="position:absolute;left:0;right:0;top:44px;display:flex;flex-direction:column;align-items:center">
  ${ghost(64)}
  <div style="margin-top:14px">${wordmark(40)}</div>
  <div style="margin-top:14px;font-size:15px;font-weight:800;line-height:1.4;text-align:center;letter-spacing:-0.03em">데이터와 여론으로<br>읽는 시장</div>
</div>
<div style="position:absolute;left:22px;right:22px;top:250px;border-top:1px solid rgba(255,255,255,.28)"></div>
<div style="position:absolute;left:22px;right:22px;top:270px;display:flex;flex-direction:column;gap:13px;font-size:14px;font-weight:700;letter-spacing:-0.02em">
  <div>시장 온도</div>
  <div>카더라 리포트</div>
  <div>테마 리포트</div>
  <div>배당으로 살기</div>
  <div>MDD 정밀분석</div>
  <div>내부자 리포트</div>
</div>
<div style="position:absolute;left:18px;right:18px;bottom:30px;height:46px;border-radius:23px;background:#fff;color:${BRAND};
  display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;letter-spacing:-0.02em">hatzze.fun 열기 →</div>
`,
  ),
};

const OUT = process.env.OUT_DIR ?? HERE;
const chrome = chromePath();
const work = mkdtempSync(join(tmpdir(), "naver-blog-"));
for (const img of [profile, cover, title, widget]) {
  const htmlFile = join(work, img.file.replace(/\.png$/, ".html"));
  writeFileSync(htmlFile, img.html);
  const out = join(OUT, img.file);
  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
      `--window-size=${img.w},${img.h}`,
      `--force-device-scale-factor=${img.scale}`,
      "--virtual-time-budget=4000",
      `--screenshot=${out}`,
      pathToFileURL(htmlFile).href,
    ],
    { stdio: "ignore" },
  );
  console.log(`${img.file}  ${img.w * img.scale}×${img.h * img.scale}`);
}

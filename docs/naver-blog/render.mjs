/**
 * 네이버 블로그에 올릴 이미지 네 장을 그린다 — 프로필 · 모바일 커버 · PC 타이틀 · 위젯 배너.
 *
 *     CHROME=<chrome-headless-shell 경로> node docs/naver-blog/render.mjs              # 밝은 판
 *     THEME=dark CHROME=<chrome-headless-shell 경로> node docs/naver-blog/render.mjs   # 어두운 판
 *
 * 그림은 HTML 로 짜고 크롬 헤드리스 셸로 찍는다(아래 chromePath 머리말). 서체는 사이트가 이미 받는 두 패키지
 * (pretendard · @fontsource/bricolage-grotesque)를 node_modules 에서 읽으니 `npm install`
 * 이 되어 있으면 따로 받을 것이 없다. 결과는 같은 폴더에 쓰고, OUT_DIR 로 바꿀 수 있다.
 *
 * ## 파랑은 점으로만 쓴다
 *
 * 첫 판은 네 장 모두 로고 파랑(#0064ff)을 바탕에 깔았다가 "너무 파래서 촌스럽다"는 말을 들었다
 * (2026-09-30). 지금은 사이트 화면과 같은 배색이다 — 옅은 바탕 · 흰 카드 · 잉크 글자에 파랑은
 * 유령과 말풍선 하나에만 쓴다. 공유 카드(app/og-card.tsx)가 이미 그 결이다.
 * 색은 app/styles/theme.css 의 라이트·다크 토큰을 손으로 옮겼다. 팔레트를 바꾸면 여기도 볼 것.
 *
 * ## 로고는 app/icon.svg 에서 읽는다
 *
 * 유령 심볼의 길(path)은 파일에서 읽는다. 배색은 app/Logo.tsx 의 GhostSymbol 과 같다 —
 * 몸통 파랑 · 눈 흰색 · 눈동자 파랑. 워드마크는 같은 파일의 규격(Bricolage Grotesque 700,
 * 자간 -0.035em, 소문자 hatzze)을 따른다.
 *
 * ## 말풍선 네 개는 블로그 카테고리 넷이다
 *
 * 오늘 뭐래?(데일리 요약) · 요즘 무슨 테마?(테마) · 배당 얼마 받지?(배당) · 고점 대비 몇 %?(MDD).
 * 파란 말풍선은 '오늘 뭐래?' 하나다 — 매일 나가는 글이자 텔레그램 채널 이름이라 햇쩨 자신의 말이다.
 * ⚠️ 사라/팔라로 읽힐 말과 종목 이름은 넣지 않는다(app/og-card.tsx 의 ChatterArt 와 같은 규칙).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const NM = join(ROOT, "node_modules");
const PRETENDARD = join(NM, "pretendard/dist/public/static");
const BRICOLAGE = join(NM, "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2");

const ICON = readFileSync(join(ROOT, "app/icon.svg"), "utf8");
/** 유령 몸통 길. */
const GHOST_PATH = ICON.match(/<path d="([^"]+)"/)[1];

/** app/styles/theme.css 의 토큰. 이름도 그쪽을 따른다(--c-bg → bg). */
const THEMES = {
  light: {
    bg: "#f7fafd",
    card: "#ffffff",
    ink: "#0e2136",
    sub: "#556a84",
    faint: "#8ba0b6",
    line: "#eaf0f7",
    blue: "#3182f6",
    shadow: "0 8px 24px rgba(14,33,54,.07)",
  },
  dark: {
    bg: "#101013",
    card: "#202027",
    ink: "#e4e4e5",
    sub: "#9e9ea4",
    faint: "#7e7e87",
    line: "#2f2f39",
    blue: "#3485fa",
    shadow: "0 8px 24px rgba(0,0,0,.35)",
  },
};
const THEME = process.env.THEME ?? "light";
const C = THEMES[THEME];
if (!C) throw new Error(`THEME 은 ${Object.keys(THEMES).join(" · ")} 중 하나입니다.`);

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

/** 유령 심볼. h 는 높이(px), 폭은 viewBox 비율(100/104)을 따른다. 배색은 app/Logo.tsx 의 GhostSymbol. */
function ghost(h) {
  return (
    `<svg width="${((h * 100) / 104).toFixed(1)}" height="${h}" viewBox="0 0 100 104" style="display:block">` +
    `<path d="${GHOST_PATH}" fill="${C.blue}"/>` +
    `<ellipse cx="39" cy="50" rx="9.5" ry="12" fill="#fff"/><circle cx="66" cy="52" r="7" fill="#fff"/>` +
    `<circle cx="42" cy="45" r="3" fill="${C.blue}"/></svg>`
  );
}

function wordmark(size) {
  return `<span class="wm" style="font-size:${size}px">hatzze</span>`;
}

/**
 * 말풍선. tail 은 꼬리 자리(각진 모서리) — 유령 쪽을 향하게 둔다.
 * app/og-card.tsx 의 ChatterArt 와 같은 모양(한 모서리만 각지게)이다. mine 이면 파랑.
 */
function bubble(text, { x, y, size, tail, mine = false }) {
  const r = Math.round(size * 0.95);
  const s = Math.round(size * 0.3);
  const radius = {
    bl: `${r}px ${r}px ${r}px ${s}px`,
    br: `${r}px ${r}px ${s}px ${r}px`,
    tl: `${s}px ${r}px ${r}px ${r}px`,
    tr: `${r}px ${s}px ${r}px ${r}px`,
  }[tail];
  const skin = mine
    ? `background:${C.blue};color:#fff;border:1px solid ${C.blue}`
    : `background:${C.card};color:${C.ink};border:1px solid ${C.line}`;
  return (
    `<div class="bubble" style="left:${x}px;top:${y}px;font-size:${size}px;${skin};` +
    `padding:${Math.round(size * 0.5)}px ${Math.round(size * 0.8)}px;border-radius:${radius}">${text}</div>`
  );
}

function page(w, h, body) {
  const font = (weight, file) =>
    `@font-face{font-family:Pretendard;font-weight:${weight};src:url("${pathToFileURL(join(PRETENDARD, file))}")}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
${font(500, "Pretendard-Medium.otf")}
${font(700, "Pretendard-Bold.otf")}
${font(800, "Pretendard-ExtraBold.otf")}
@font-face{font-family:Bricolage;font-weight:700;src:url("${pathToFileURL(BRICOLAGE)}")}
*{box-sizing:border-box}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
body{position:relative;font-family:Pretendard,sans-serif;color:${C.ink};background:${C.bg};
  -webkit-font-smoothing:antialiased;word-break:keep-all}
.wm{font-family:Bricolage,sans-serif;font-weight:700;letter-spacing:-0.035em;line-height:1;display:inline-block;color:${C.ink}}
.bubble{position:absolute;font-weight:700;letter-spacing:-0.02em;line-height:1;white-space:nowrap;box-shadow:${C.shadow}}
</style></head><body>${body}</body></html>`;
}

/* ─── 네 장 ─────────────────────────────────────────────────────────── */

/** 프로필. 네이버가 원으로 잘라 보이니 유령을 가운데 60% 안에 둔다(app/icon.svg 와 같은 비율). */
const profile = {
  file: "profile-512.png",
  w: 512,
  h: 512,
  scale: 1,
  html: page(
    512,
    512,
    `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${ghost(282)}</div>`,
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
<!-- 뒤의 선은 오르내리기만 하고 방향이 없다. 오른쪽 위로 치솟는 선은 '오른다'로 읽힌다. -->
<svg style="position:absolute;left:0;top:0" width="1080" height="1300" viewBox="0 0 1080 1300">
  <polyline points="-10,600 110,650 210,590 320,640 430,560 540,620 650,570 760,640 870,580 980,630 1090,590"
    fill="none" stroke="${C.line}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
<div style="position:absolute;left:${540 - 150}px;top:330px">${ghost(312)}</div>
${bubble("오늘 뭐래?", { x: 96, y: 236, size: 40, tail: "br", mine: true })}
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
<div style="position:absolute;left:64px;top:0;height:300px;display:flex;flex-direction:column;justify-content:center">
  <div style="display:flex;align-items:center;gap:18px">${ghost(84)}${wordmark(82)}</div>
  <div style="margin-top:22px;font-size:30px;font-weight:800;letter-spacing:-0.03em">데이터와 여론으로 읽는 시장</div>
  <div style="margin-top:10px;font-size:19px;font-weight:500;color:${C.sub};letter-spacing:-0.01em">매일 저녁 데일리 요약 · 배당 · 테마 · MDD</div>
</div>
${bubble("오늘 뭐래?", { x: 650, y: 54, size: 22, tail: "bl", mine: true })}
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
<div style="position:absolute;left:0;right:0;top:44px;display:flex;flex-direction:column;align-items:center">
  ${ghost(64)}
  <div style="margin-top:14px">${wordmark(40)}</div>
  <div style="margin-top:14px;font-size:15px;font-weight:800;line-height:1.4;text-align:center;letter-spacing:-0.03em">데이터와 여론으로<br>읽는 시장</div>
</div>
<div style="position:absolute;left:22px;right:22px;top:250px;border-top:1px solid ${C.line}"></div>
<div style="position:absolute;left:22px;right:22px;top:270px;display:flex;flex-direction:column;gap:13px;font-size:14px;font-weight:700;letter-spacing:-0.02em;color:${C.sub}">
  <div>시장 온도</div>
  <div>카더라 리포트</div>
  <div>테마 리포트</div>
  <div>배당으로 살기</div>
  <div>MDD 정밀분석</div>
  <div>내부자 리포트</div>
</div>
<div style="position:absolute;left:18px;right:18px;bottom:30px;height:46px;border-radius:23px;background:${C.blue};color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;letter-spacing:-0.02em">hatzze.fun 열기 →</div>
`,
  ),
};

/* ─── 소개 글(intro/) ──────────────────────────────────────────────────
 * 블로그 첫 글 '햇쩨를 소개합니다'에 들어가는 세 장. 원고는 intro/draft.md.
 * 폭은 1080 — 폰에서 글 폭을 꽉 채우는 크기다. 그림 속 글자는 네이버가 못 읽으니 같은 내용을
 * 본문 글로도 적는다(원고가 그렇게 짜여 있다).
 */

/** 1. 대표 이미지(1080×1080). 네이버 검색 썸네일이 정사각으로 잘려서 처음부터 정사각이다. */
const introCover = {
  file: "intro/01-cover-1080.png",
  w: 1080,
  h: 1080,
  scale: 1,
  html: page(
    1080,
    1080,
    `
<div style="position:absolute;left:${540 - 144}px;top:200px">${ghost(300)}</div>
${bubble("오늘 뭐래?", { x: 130, y: 178, size: 38, tail: "br", mine: true })}
${bubble("배당 얼마 받지?", { x: 676, y: 300, size: 38, tail: "bl" })}
<div style="position:absolute;left:0;right:0;top:590px;text-align:center">
  <div style="font-size:76px;font-weight:800;letter-spacing:-0.035em">햇쩨를 소개합니다</div>
  <div style="margin-top:26px;font-size:36px;font-weight:700;color:${C.sub};letter-spacing:-0.02em">데이터와 여론으로 읽는 시장</div>
</div>
<div style="position:absolute;left:0;right:0;bottom:86px;display:flex;justify-content:center;align-items:center;gap:14px">
  ${ghost(44)}${wordmark(46)}<span style="font-size:30px;font-weight:700;color:${C.faint};margin-left:6px">hatzze.fun</span>
</div>
`,
  ),
};

/** 화면 안내의 한 줄. 이름은 사이트 사이드바와 같은 말을 쓴다. */
function screenRow(name, desc) {
  return (
    `<div style="display:flex;align-items:baseline;gap:22px;padding:22px 0;border-top:1px solid ${C.line}">` +
    `<div style="width:250px;flex-shrink:0;font-size:34px;font-weight:800;letter-spacing:-0.03em">${name}</div>` +
    `<div style="font-size:29px;font-weight:500;line-height:1.45;color:${C.sub};letter-spacing:-0.02em">${desc}</div></div>`
  );
}
function screenGroup(label, rows) {
  return (
    `<div style="margin-top:44px"><div style="font-size:26px;font-weight:800;color:${C.blue};letter-spacing:-0.01em;margin-bottom:10px">${label}</div>` +
    rows.join("") +
    `</div>`
  );
}

/**
 * 2. 사이트 화면 안내(1080×1460). 묶음은 사이드바와 같다 — 오늘 시장 · 시장 여론 · 분석과 기록
 * (app/AppShell.tsx 의 NAV_GROUPS). 화면이 늘거나 이름이 바뀌면 여기도 고친다.
 */
const introScreens = {
  file: "intro/02-screens-1080.png",
  w: 1080,
  h: 1460,
  scale: 1,
  html: page(
    1080,
    1460,
    `
<div style="position:absolute;left:84px;right:84px;top:84px">
  <div style="display:flex;align-items:center;gap:16px">${ghost(52)}${wordmark(54)}</div>
  <div style="margin-top:28px;font-size:52px;font-weight:800;letter-spacing:-0.035em;line-height:1.3">hatzze.fun에서 볼 수 있는 것</div>
  ${screenGroup("오늘 시장", [
    screenRow("시장 브리핑", "지표 25개로 잰 오늘의 시장 온도(℃)와 30일 흐름"),
    screenRow("국장 미리보기", "밤사이 미국이 크게 움직인 날, 국내 시장은 보통 어떻게 열렸나"),
    screenRow("데일리 노트", "하루의 시장 이야기를 매일 저녁 한 편의 글로"),
  ])}
  ${screenGroup("시장 여론", [
    screenRow("카더라 리포트", "주식 텔레그램에서 국내·미국 종목이 얼마나 회자되는지"),
    screenRow("테마 리포트", "국장 26개, 미장 16개 테마마다 요즘 도는 이야기와 말 많은 종목"),
  ])}
  ${screenGroup("분석과 기록", [
    screenRow("배당으로 살기", "종목과 주수를 넣으면 1년 배당을 계좌별 세후로"),
    screenRow("MDD 정밀분석", "고점에서 얼마나 내려왔고, 과거엔 얼마 만에 돌아왔나"),
    screenRow("내부자 리포트", "미국 임원과 하원의원, 월가 기관이 신고한 매매"),
  ])}
</div>
<div style="position:absolute;left:84px;right:84px;bottom:70px;font-size:28px;font-weight:700;color:${C.faint}">무료 · 회원가입 없음 · hatzze.fun</div>
`,
  ),
};

/** 블로그 글 안내의 한 칸. 말풍선(질문)이 위, 카테고리 이름과 올라오는 때가 아래. */
function postCard(q, name, when, mine = false) {
  const skin = mine ? `background:${C.blue};color:#fff` : `background:${C.bg};color:${C.ink};border:1px solid ${C.line}`;
  return (
    `<div style="background:${C.card};border:1px solid ${C.line};border-radius:28px;padding:40px 38px;box-shadow:${C.shadow};` +
    `display:flex;flex-direction:column;justify-content:space-between;height:350px">` +
    `<div><span style="display:inline-block;${skin};font-size:30px;font-weight:700;letter-spacing:-0.02em;line-height:1;` +
    `padding:16px 24px;border-radius:28px 28px 28px 9px">${q}</span></div>` +
    `<div><div style="font-size:38px;font-weight:800;letter-spacing:-0.03em">${name}</div>` +
    `<div style="margin-top:12px;font-size:27px;font-weight:600;color:${C.sub}">${when}</div></div></div>`
  );
}

/** 3. 블로그에 올라오는 글(1080×1080). 말풍선 넷은 커버와 같은 넷이다(위 머리말). */
const introPosts = {
  file: "intro/03-posts-1080.png",
  w: 1080,
  h: 1080,
  scale: 1,
  html: page(
    1080,
    1080,
    `
<div style="position:absolute;left:84px;right:84px;top:96px">
  <div style="font-size:52px;font-weight:800;letter-spacing:-0.035em">이 블로그에 올라오는 글</div>
  <div style="margin-top:16px;font-size:29px;font-weight:500;color:${C.sub};letter-spacing:-0.02em">매일 저녁 한 편, 그리고 주 한두 번 깊이 보는 글</div>
  <div style="margin-top:56px;display:grid;grid-template-columns:1fr 1fr;gap:28px">
    ${postCard("오늘 뭐래?", "데일리 노트", "매일 저녁", true)}
    ${postCard("배당 얼마 받지?", "배당으로 살기", "돌아가며 주 한두 번")}
    ${postCard("요즘 무슨 테마?", "테마 리포트", "돌아가며 주 한두 번")}
    ${postCard("고점 대비 몇 %?", "MDD 정밀분석", "돌아가며 주 한두 번")}
  </div>
</div>
`,
  ),
};

/**
 * 크게 그려서 줄인다(SUPERSAMPLE 배).
 *
 * 크기 그대로 찍으면 두 가지가 거칠다(2026-09-30, "같은 크기에 화질만 고화질로"):
 *   · 글자 가장자리에 분홍·하늘색 번짐 — 크롬이 LCD 서브픽셀로 글자를 다듬는다. 모니터에
 *     따라, 네이버가 다시 줄이거나 누르면 얼룩으로 보인다. --disable-lcd-text 로 끈다.
 *   · 유령·말풍선 윤곽의 계단 — 한 픽셀 안에서만 섞으니 곡선이 덜 매끄럽다.
 * 세 배로 그린 뒤 <img> 로 제 크기에 맞춰 한 번 더 찍으면 크롬이 고품질로 줄여 둘 다 사라진다.
 * 픽셀 수(파일 크기 규격)는 그대로다.
 */
const SUPERSAMPLE = 3;

function shoot(htmlFile, w, h, scale, out) {
  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--disable-lcd-text",
      "--hide-scrollbars",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
      `--window-size=${w},${h}`,
      `--force-device-scale-factor=${scale}`,
      "--virtual-time-budget=4000",
      `--screenshot=${out}`,
      pathToFileURL(htmlFile).href,
    ],
    { stdio: "ignore" },
  );
}

const OUT = process.env.OUT_DIR ?? HERE;
const chrome = chromePath();
const work = mkdtempSync(join(tmpdir(), "naver-blog-"));
for (const img of [profile, cover, title, widget, introCover, introScreens, introPosts]) {
  const W = img.w * img.scale;
  const H = img.h * img.scale;
  const base = join(work, img.file.replace(/\.png$/, "").replaceAll("/", "_"));
  writeFileSync(`${base}.html`, img.html);
  shoot(`${base}.html`, img.w, img.h, img.scale * SUPERSAMPLE, `${base}.big.png`);
  writeFileSync(
    `${base}.down.html`,
    `<!doctype html><html><head><style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}` +
      `img{display:block;width:${W}px;height:${H}px}</style></head>` +
      `<body><img src="${pathToFileURL(`${base}.big.png`).href}"></body></html>`,
  );
  mkdirSync(dirname(join(OUT, img.file)), { recursive: true });
  shoot(`${base}.down.html`, W, H, 1, join(OUT, img.file));
  console.log(`${THEME}  ${img.file}  ${W}×${H}`);
}

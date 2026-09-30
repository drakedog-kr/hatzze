/**
 * 네이버 블로그 매일 글(데일리 노트 짧은 판)의 대문 이미지. 1080×1080 PNG 한 장.
 *
 *     node docs/naver-blog/daily-cover.mjs --hook "반도체·HBM" --date 2026-10-01
 *     node docs/naver-blog/daily-cover.mjs <hatzze_MMDD_short.md> --hook "반도체·HBM"
 *     옵션: --sub "한 줄"  --out <경로.png>  --dark
 *
 * 원고를 주면 날짜(`## YYYY년 M월 D일` 줄, 없으면 파일 이름의 MMDD)와 저장 위치(원고 옆 `_cover.png`)를
 * 거기서 정한다. --hook 이 없으면 원고 첫 `# ` 줄(제목)을 쓰지만, 썸네일에는 핵심어가 낫다(아래).
 * 다른 파일에 기대지 않는 한 장짜리라 어디에 두고 돌려도 된다. 저장소 밖에서 돌리면 HATZZE_ROOT 로
 * 저장소 위치를 알려 준다(서체는 node_modules 에서, 유령은 app/icon.svg 에서 읽는다).
 *
 * ## 왜 제목이 아니라 '핵심어'를 크게 쓰나 (2026-09-30 조사)
 *
 * · 네이버 목록·검색 결과는 대표 이미지를 **정사각으로 잘라** 보여 주고, 폰에서는 한 변이 120px 안팎이다.
 *   1080 을 120 으로 줄이면 72px 글자가 8px 이 된다 — 긴 제목은 거기서 읽히지 않는다.
 * · 제목은 썸네일 **옆에 글자로 따로** 나온다. 그림이 제목을 되풀이할 까닭이 없다.
 * · 잘 눌리는 썸네일은 굵은 고딕 **핵심어 두세 개**를 크게, 바탕과 글자 대비를 강하게 쓴다.
 * 그래서 가운데에 그날의 핵심어(종목·테마 이름이나 짧은 한마디, 12자 안팎)를 아주 크게 둔다.
 * 날짜와 브랜드는 위아래에 작게 — 크게 줄었을 때 잘려도 되는 것들이다.
 *
 * ## 가운데 띠에 모은다
 *
 * 정사각 말고 가로(16:9)로 잘라 보여 주는 자리에서는 위아래 20~30% 가 잘린다. 핵심어는 세로 가운데
 * 띠(360~720px) 안에 둔다.
 *
 * ## 색과 서체 — 사이트와 한 벌
 *
 * app/styles/theme.css 의 라이트 토큰(다크는 --dark). 파랑은 말풍선 하나와 유령에만 — 바탕을 파랗게
 * 깔았다가 "촌스럽다"는 말을 들었다. 글자는 Pretendard, 워드마크는 Bricolage Grotesque 700(app/Logo.tsx).
 * 사라/팔라로 읽힐 말·주가 차트는 넣지 않는다(app/og-card.tsx 의 ChatterArt 와 같은 규칙).
 *
 * ## 찍는 법
 *
 * 크롬 **헤드리스 셸**로 찍는다 — 일반 크롬의 헤드리스는 창 아래 87px 을 잘라 그린다. 없으면
 * `npx @puppeteer/browsers install chrome-headless-shell@stable` 로 받고 CHROME=<경로> 로 알려 준다.
 * 세 배로 그려 제 크기로 줄여 찍는다(--disable-lcd-text) — 글자 가장자리 색 번짐과 윤곽 계단이 사라진다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ─── 입력 ─────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name) => argv.includes(`--${name}`);
const valued = new Set(["hook", "date", "sub", "out"]);
const src = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && valued.has(argv[i - 1].slice(2))));
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

const lines = src ? readFileSync(src, "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean) : [];
const title = lines.find((l) => l.startsWith("# "))?.slice(2).trim();
const hookRaw = opt("hook") ?? title?.replace(/^(\d{1,2}월\s*\d{1,2}일|\d{1,2}\/\d{1,2})[\s,:·|]*/, "");
if (!hookRaw) die('핵심어가 없습니다. --hook "반도체·HBM" 처럼 주거나, 원고 첫 줄을 "# 제목" 으로 쓴다.');

let y, m, d;
const dateOpt = opt("date");
const dateLine = lines.find((l) => l.startsWith("## "))?.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
const nameMmdd = src && basename(src).match(/_(\d{2})(\d{2})_/);
if (dateOpt) {
  const hit = dateOpt.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? die(`--date 는 YYYY-MM-DD 꼴이어야 합니다: ${dateOpt}`);
  [y, m, d] = hit.slice(1).map(Number);
} else if (dateLine) {
  [y, m, d] = dateLine.slice(1).map(Number);
} else if (nameMmdd) {
  y = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
  [m, d] = nameMmdd.slice(1).map(Number);
} else {
  die("날짜가 없습니다. --date YYYY-MM-DD 로 주거나, 원고에 '## YYYY년 M월 D일' 줄을 둔다.");
}
const weekday = "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];

const out = resolve(
  opt("out") ??
    (src
      ? join(dirname(src), basename(src).includes("_short") ? basename(src).replace("_short", "_cover").replace(/\.md$/, ".png") : basename(src).replace(/\.md$/, "_cover.png"))
      : `hatzze_${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}_cover.png`),
);

/* ─── 저장소 · 서체 · 로고 · 크롬 ─────────────────────────────────────── */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = [process.env.HATZZE_ROOT, join(HERE, "..", ".."), process.cwd()].find((p) => p && existsSync(join(p, "app/icon.svg")));
if (!ROOT) die("hatzze 저장소를 못 찾았습니다. HATZZE_ROOT=<저장소 경로> 로 알려 준다.");
const font = (p) => pathToFileURL(join(ROOT, "node_modules", p)).href;
const PRETENDARD = "pretendard/dist/public/static";
const BRICOLAGE = "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2";
if (!existsSync(join(ROOT, "node_modules", PRETENDARD))) die(`서체가 없습니다. 저장소(${ROOT})에서 npm install 을 먼저 한다.`);
const GHOST_PATH = readFileSync(join(ROOT, "app/icon.svg"), "utf8").match(/<path d="([^"]+)"/)[1];

/** 헤드리스 셸 찾기: CHROME → 이 컨테이너의 자리 → @puppeteer/browsers 가 받는 자리들. */
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const fixed = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
  if (existsSync(fixed)) return fixed;
  const roots = [join(homedir(), ".cache/puppeteer/chrome-headless-shell"), join(process.cwd(), "chrome-headless-shell")];
  const walk = (dir, depth) => {
    if (depth < 0 || !existsSync(dir)) return null;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (/^(chrome-headless-shell|headless_shell)$/.test(name) && statSync(p).isFile()) return p;
      if (statSync(p).isDirectory()) {
        const hit = walk(p, depth - 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const r of roots) {
    const hit = walk(r, 3);
    if (hit) return hit;
  }
  return die("헤드리스 셸이 없습니다. `npx @puppeteer/browsers install chrome-headless-shell@stable` 로 받고 CHROME=<경로> 로 알려 준다.");
}

/* ─── 색 ──────────────────────────────────────────────────────────── */

const C = flag("dark")
  ? { bg: "#101013", ink: "#e4e4e5", sub: "#9e9ea4", faint: "#7e7e87", line: "#2f2f39", blue: "#3485fa" }
  : { bg: "#f7fafd", ink: "#0e2136", sub: "#556a84", faint: "#8ba0b6", line: "#eaf0f7", blue: "#3182f6" };

/* ─── 핵심어 크기 ─────────────────────────────────────────────────── */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// 줄은 '/' 나 줄바꿈으로 직접 나눌 수 있다. 안 나누면 두 줄까지 알아서 고르게 접는다.
const hookLines = hookRaw.split(/\s*(?:\/|\n)\s*/).filter(Boolean).slice(0, 3);
/** 글자 폭 어림(em). 한글 1, 영문·숫자 0.62, 공백 0.28, 가운뎃점·쉼표 0.35 — Pretendard 800, 자간 -0.04em. */
const emWidth = (s) =>
  [...s].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 0.96 : /\s/.test(ch) ? 0.26 : /[·.,:%]/.test(ch) ? 0.34 : 0.6), 0);
const BOX = 912; // 1080 - 여백 84 × 2
const longest = Math.max(...hookLines.map(emWidth));
let hookSize;
let rows = hookLines.length;
if (rows > 1) hookSize = Math.min(170, Math.floor(BOX / longest));
else if (longest * 180 <= BOX) hookSize = 180;
else {
  rows = 2; // 한 줄에 안 들면 두 줄로 고르게 접는다(text-wrap: balance). 접는 손실을 1.15 로 어림한다.
  hookSize = Math.min(160, Math.floor((BOX * 2) / (longest * 1.15)));
}
hookSize = Math.max(hookSize, 88);
// 폰 검색 결과(120px)에서 읽히는 한계가 대략 이쯤이다(2026-09-30, 120px 로 줄여 본 결과).
const hookChars = [...hookLines.join("")].filter((ch) => !/\s/.test(ch)).length;
if (hookChars > 14) console.warn(`⚠️ 핵심어가 ${hookChars}자라 폰 검색 썸네일(120px)에서 작게 보입니다. 12자 안팎으로 줄이는 편이 낫습니다.`);
const sub = esc(opt("sub") ?? "주식 텔레그램 데일리 노트");

/* ─── 그림 ────────────────────────────────────────────────────────── */

const ghost = (h) =>
  `<svg width="${((h * 100) / 104).toFixed(1)}" height="${h}" viewBox="0 0 100 104" style="display:block">` +
  `<path d="${GHOST_PATH}" fill="${C.blue}"/><ellipse cx="39" cy="50" rx="9.5" ry="12" fill="#fff"/>` +
  `<circle cx="66" cy="52" r="7" fill="#fff"/><circle cx="42" cy="45" r="3" fill="${C.blue}"/></svg>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face{font-family:P;font-weight:700;src:url("${font(`${PRETENDARD}/Pretendard-Bold.otf`)}")}
@font-face{font-family:P;font-weight:800;src:url("${font(`${PRETENDARD}/Pretendard-ExtraBold.otf`)}")}
@font-face{font-family:B;font-weight:700;src:url("${font(BRICOLAGE)}")}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1080px;overflow:hidden}
body{position:relative;background:${C.bg};color:${C.ink};font-family:P,sans-serif;-webkit-font-smoothing:antialiased;word-break:keep-all}
</style></head><body>
<!-- 위: 말풍선 + 날짜. 잘려도 되는 자리다. -->
<div style="position:absolute;left:84px;right:84px;top:84px;display:flex;align-items:center;gap:22px">
  <span style="background:${C.blue};color:#fff;font-size:34px;font-weight:700;letter-spacing:-0.02em;line-height:1;
    padding:17px 27px;border-radius:32px 32px 32px 10px">오늘 뭐래?</span>
  <span style="font-size:40px;font-weight:800;letter-spacing:-0.03em">${m}월 ${d}일 ${weekday}요일</span>
</div>
<!-- 가운데 띠: 핵심어. 가로로 잘려도 남는 자리다. -->
<div style="position:absolute;left:84px;right:84px;top:330px;height:420px;display:flex;flex-direction:column;justify-content:center">
  <div style="font-size:${hookSize}px;font-weight:800;line-height:1.12;letter-spacing:-0.04em;text-wrap:balance">${hookLines.map(esc).join("<br>")}</div>
  <div style="margin-top:28px;font-size:40px;font-weight:700;color:${C.sub};letter-spacing:-0.02em">${sub}</div>
</div>
<!-- 아래: 브랜드. -->
<div style="position:absolute;left:84px;right:84px;bottom:84px;padding-top:30px;border-top:2px solid ${C.line};display:flex;align-items:center;gap:14px">
  ${ghost(46)}<span style="font-family:B,sans-serif;font-weight:700;font-size:46px;letter-spacing:-0.035em;line-height:1">hatzze</span>
  <span style="margin-left:auto;font-size:30px;font-weight:700;color:${C.faint}">hatzze.fun</span>
</div>
</body></html>`;

/* ─── 찍기: 세 배로 그려 제 크기로 줄인다 ─────────────────────────────── */

const chrome = chromePath();
const work = mkdtempSync(join(tmpdir(), "hatzze-cover-"));
const shoot = (file, size, scale, png) =>
  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--disable-lcd-text",
      "--hide-scrollbars",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
      `--window-size=${size},${size}`,
      `--force-device-scale-factor=${scale}`,
      "--virtual-time-budget=4000",
      `--screenshot=${png}`,
      pathToFileURL(file).href,
    ],
    { stdio: "ignore" },
  );
writeFileSync(join(work, "cover.html"), html);
shoot(join(work, "cover.html"), 1080, 3, join(work, "big.png"));
writeFileSync(
  join(work, "down.html"),
  `<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1080px;overflow:hidden}img{display:block;width:1080px;height:1080px}</style></head>` +
    `<body><img src="${pathToFileURL(join(work, "big.png")).href}"></body></html>`,
);
shoot(join(work, "down.html"), 1080, 1, out);
console.log(`${out}  1080×1080  ${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}  핵심어 ${hookSize}px ${rows}줄`);

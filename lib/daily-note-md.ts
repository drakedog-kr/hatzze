/**
 * 데일리 노트 본문(마크다운)을 화면이 그릴 조각으로 푼다.
 *
 * ## 왜 라이브러리를 안 쓰나
 *
 * 원고가 쓰는 문법이 넷뿐이다 — `###` 소제목, 문단, `---` 구분선, `|` 표. 거기에 굵게(`**`)와
 * 출처 주소 정도가 문장 안에 온다. 범용 변환기는 이보다 훨씬 많은 문법을 열어 두는데, 그
 * 열린 문 하나하나가 원고에 우연히 든 글자(`*`·`_`·`<`)를 조판으로 오해할 자리다. 네 가지만
 * 알아듣는 변환기가 원고를 있는 그대로 보여 준다.
 *
 * ⚠️ 이 파일은 `server-only` 가 아니다 — DB 를 안 읽는 순수 함수라 노드에서 그대로 시험할 수
 *    있어야 한다(원고 넉 장을 넣어 조각 수를 세어 봤다).
 *
 * ## 소제목에는 id 가 붙는다
 *
 * 오른쪽 칸의 목차 카드가 `#sec-1` 로 그 자리에 뛴다. 번호는 본문 안 차례라 글마다 다시 1 부터다.
 *
 * ## 문단의 세 갈래
 *
 * 원고 끝에 오는 두 줄은 본문과 다른 결로 그린다.
 *   · `출처: hatzze.fun/kadera`  → source. 작고 옅게, 주소는 링크로
 *   · `※ 언급량·집계는 …`         → notice. 회색 상자 안의 고지
 * 둘은 첫 글자로 가른다. 원고 규칙이 그 자리를 고정해 두어서(project 메모리의 뼈대 8단계)
 * 첫 글자만 봐도 틀리지 않는다.
 */

export type NoteInline =
  | { t: "text"; s: string }
  | { t: "strong"; s: string }
  /** `strong` 은 굵게 표시 **안에** 있던 주소다. 원고 끝의 `출처: **hatzze.fun/kadera**` 가 그 자리다. */
  | { t: "link"; s: string; href: string; strong?: boolean };

export type NoteHeading = { k: "heading"; level: 2 | 3; text: string; id: string };

export type NoteBlock =
  | NoteHeading
  | { k: "para"; kind: "body" | "source" | "notice"; inline: NoteInline[] }
  | { k: "rule" }
  | { k: "table"; head: string[]; rows: string[][] };

/** 문장 안의 주소. 우리 사이트 주소는 상대 경로 링크로, 그 밖의 http 주소는 그대로 링크로. */
const URL_RE = /https?:\/\/[^\s)]+|(?:www\.)?hatzze\.fun(?:\/[A-Za-z0-9_\-/.?=&#%]*)?/g;

function linkHref(raw: string): string {
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?hatzze\.fun(\/.*)?$/);
  if (m) return m[1] && m[1] !== "/" ? m[1].replace(/\/$/, "") : "/";
  return raw;
}

/**
 * 한 조각에서 주소를 떼어 낸다. `strong` 이면 나머지 글자도 굵게 남는다.
 *
 * ⚠️ **굵게 표시 안쪽도 훑어야 한다.** 예전에는 굵은 조각을 통째로 글자로 넘겨서, 원고 끝의
 * `출처: **hatzze.fun/kadera**` 가 화면에서 **안 눌리는 굵은 글자**로 나왔다(2026-09-06 지적).
 * 짧은 판은 굵게가 없어 링크가 걸렸으니, 같은 줄이 두 글에서 다르게 보이고 있었다.
 */
function scan(s: string, out: NoteInline[], strong: boolean) {
  const plain = strong ? ("strong" as const) : ("text" as const);
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: plain, s: s.slice(last, at) });
    out.push({ t: "link", s: m[0], href: linkHref(m[0]), ...(strong ? { strong: true } : {}) });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ t: plain, s: s.slice(last) });
}

/** `**굵게**` 와 주소만 알아듣는다. 짝이 안 맞는 `**` 는 글자 그대로 둔다. */
export function parseInline(s: string): NoteInline[] {
  const out: NoteInline[] = [];
  const parts = s.split("**");
  // 짝이 안 맞으면(홀수 개의 `**`) 굵게로 읽지 않는다 — 마지막 조각이 열린 채 남는다.
  const paired = parts.length % 2 === 1;
  parts.forEach((part, i) => {
    if (!part) return;
    const bold = paired && i % 2 === 1;
    scan(bold || paired ? part : (i > 0 ? "**" : "") + part, out, bold);
  });
  return out;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));

function paraKind(text: string): "body" | "source" | "notice" {
  if (text.startsWith("※")) return "notice";
  if (/^출처\s*[:：]/.test(text)) return "source";
  return "body";
}

export function parseNoteMarkdown(md: string): NoteBlock[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  let headings = 0;

  const flush = () => {
    if (!para.length) return;
    const text = para.join(" ").trim();
    para = [];
    if (text) blocks.push({ k: "para", kind: paraKind(text), inline: parseInline(text) });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      headings += 1;
      // 원고의 `#` 은 제목, `##` 은 날짜라 올리는 스크립트가 떼어 낸다. 남아 있더라도 화면의
      // h1 은 셸(데일리 노트)이 갖고 있으므로 여기서는 h2 아래로만 내린다.
      blocks.push({ k: "heading", level: h[1].length === 1 ? 2 : 3, text: h[2].trim(), id: `sec-${headings}` });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ k: "rule" });
      continue;
    }
    if (isTableLine(line)) {
      flush();
      const rowsRaw: string[][] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        rowsRaw.push(tableCells(lines[i]));
        i++;
      }
      i--; // for 문이 한 칸 더 나간다
      const body = rowsRaw.filter((cells) => !isSeparator(cells));
      if (!body.length) continue;
      const hasHead = rowsRaw.length > 1 && isSeparator(rowsRaw[1]);
      blocks.push(hasHead ? { k: "table", head: body[0], rows: body.slice(1) } : { k: "table", head: [], rows: body });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

function plain(inline: NoteInline[]): string {
  return inline.map((x) => x.s).join("");
}

/**
 * 검색 결과·공유 카드에 실을 한 줄. **첫 소제목 아래 첫 문단**을 쓴다.
 *
 * 원고의 맨 첫 문단이 매일 같은 도입이던 시절의 규칙이다(올리는 스크립트가 지금은 그 문장을
 * 뗀다). 그래도 그날의 첫 꼭지 첫 문단이 그 글에만 붙는 문장이라 이 규칙을 그대로 둔다.
 * 소제목이 없는 글(짧은 판)은 첫 본문 문단으로 물러선다.
 */
export function noteDescription(md: string, max = 150): string {
  const blocks = parseNoteMarkdown(md);
  const firstHeading = blocks.findIndex((b) => b.k === "heading");
  const from = firstHeading >= 0 ? firstHeading + 1 : 0;
  const para =
    blocks.slice(from).find((b): b is Extract<NoteBlock, { k: "para" }> => b.k === "para" && b.kind === "body") ??
    blocks.find((b): b is Extract<NoteBlock, { k: "para" }> => b.k === "para" && b.kind === "body");
  if (!para) return "";
  const text = plain(para.inline).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  // 문장 끝에서 자른다. 그 안에 마침표가 없으면 글자 수로 자르고 말줄임을 붙인다.
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/** 소제목 목록 — 목차 카드와 올리는 스크립트의 뼈대 검사가 같은 것을 본다. */
export function noteHeadings(blocks: NoteBlock[]): NoteHeading[] {
  return blocks.filter((b): b is NoteHeading => b.k === "heading");
}

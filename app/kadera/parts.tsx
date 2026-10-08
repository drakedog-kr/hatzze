import Link from "next/link";

import { C } from "../ui";
import { LEAN_WORD, type LeanMarket, type ThemeRow, themeLean, themeTip } from "./theme-vs-usual";

/**
 * 카더라 리포트가 공유하는 표시 프리미티브.
 *
 * 남은 것은 알약(Pill) · 테마별 평소 대비 막대(ThemeVsUsualRows) · 요약 글 굵힘(highlightTerms · termsFor)이다.
 * 순위 · 아바타 · 스파크라인 · 일별 막대 · 낙관도 추이 타일 · 하이라이트 두 칸은 v2 로 옮기며 걷었다(2026-10-03, 미장 카더라가 마지막 사용처).
 *
 * "use client" 를 붙이지 않아 서버·클라이언트 양쪽에서 그대로 쓰인다(SectionHead 와
 * 같은 원칙 — 색·서체 프리미티브 외에는 의존이 없다).
 */

/* 카드 껍데기(1단계)는 여기 인라인 스타일 `card` 로 있었다. 2026-08 콘솔 리디자인이
   카드를 **시트**로 바꾸면서 두 페이지 모두 `.hz-sheet`(globals.css)로 옮겨 갔고,
   그때부터 이 상수를 import 하는 곳이 없었다. 시트는 그림자가 아니라 헤어라인
   (--c-sheet-line)으로 경계를 긋는다. */

/** 한 줄 말줄임 — 이름 칸처럼 셀을 밀어낼 수 있는 글에 붙인다. 두 page.tsx 가
    각자 같은 상수를 들고 있는데, parts 안에서 쓰는 것은 여기 것을 쓴다. */
const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export type Tone = "plain" | "blue" | "hot" | "cold";

/**
 * 알약 배지. 기간 표기("최근 7일")부터 종목 태그·급등 배수까지 전부 이 한 벌을 쓴다.
 *
 * 배경은 반드시 --c-*-tint 변수로 낸다. 인라인에서 `${C.hot}22` 처럼 알파를 이어붙이면
 * "var(--c-hot)22" 가 되어 CSS 가 통째로 버린다(급부상 종목 배지가 실제로 배경 없이
 * 글자만 떠 있었다).
 */
export function Pill({
  children,
  tone = "plain",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
}) {
  /**
   * ⚠️ 글자는 **원색이 아니라 잉크 토큰**을 쓴다. 원색(--c-blue·--c-hot)은 흰 카드
   * 위에서 쓰라고 고른 값이라, 같은 계열의 옅은 tint 위에 얹으면 대비가 무너진다.
   * 실측(라이트/다크): 파랑 3.30/3.59 · 빨강 4.21/4.32 — 넷 중 둘이 AA 미달이었다.
   * --c-hot-ink·--c-cold-ink 가 바로 그 tint 위에서 4.5 를 넘도록 맞춰 둔 값이다
   * (globals.css 의 토큰 주석에 실측치가 적혀 있다). 잉크로 바꾸면 4.66~5.90 이 된다.
   *
   * 파랑에는 --c-blue-ink 가 없다. 이 저장소는 **파란 tint 위 글자에 --c-cold-ink 를
   * 쓴다** — .hz-more-btn:hover · .mdd-period-btn · .hz-btn-soft 가 이미 그렇다.
   *
   * plain 의 바탕도 --c-track 에서 --c-chip 으로 옮긴다. track 은 '막대의 빈 트랙'이라
   * 알약 바탕이 아니고, 다크에서 그 위 --c-sub 가 4.08 이었다(chip 위에서는 4.55).
   */
  const bg =
    tone === "blue" ? "var(--c-blue-tint)" : tone === "hot" ? "var(--c-hot-tint)" : tone === "cold" ? "var(--c-cold-tint)" : C.chip;
  const fg =
    tone === "blue" || tone === "cold" ? "var(--c-cold-ink)" : tone === "hot" ? "var(--c-hot-ink)" : C.sub;
  /**
   * ⚠️⚠️ **브라우저 기본 `title` 을 쓰지 않는다.** 그건 OS 가 1초쯤 늦춰 띄우고 CSS 로
   * 줄일 방법이 없다. 이 저장소는 자기 툴팁(`.hz-tip` + `data-tip`)이 있고 그쪽은
   * opacity 0.12초라 사실상 즉시 뜬다. 알약만 기본 title 이라 혼자 늦었다
   * (2026-08-26 에 "1초 넘게 기다려야 뜬다"는 지적을 받았다).
   *
   * ⭐ 긴 글은 `hz-tip-wide` 로 접는다. 기본 `.hz-tip::after` 는 `white-space: nowrap`
   *   이라 29자짜리가 310px 한 줄이 되어 폰에서 화면을 넘는다. 문턱 16자는 이 저장소가
   *   쓰는 두 갈래(짧은 라벨 vs 설명문)를 가르는 자리다.
   */
  const tip = title ? (title.length > 16 ? "hz-tip hz-tip-wide" : "hz-tip") : undefined;
  return (
    <span
      className={tip}
      data-tip={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "var(--fs-11)",
        fontWeight: 600,
        lineHeight: 1.45,
        color: fg,
        background: bg,
        padding: "3px 9px",
        // 토큰으로 — v2 화면(.v2-bf · .v2-in …)은 --r-pill 을 4 로 바꿔 꼬리표 꼴이 된다(둥근 알약은 v2 결과 안 맞는다). 옛 화면은 99px 그대로.
        borderRadius: "var(--r-pill)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/**
 * 히어로 센티먼트 칸의 인기 테마 줄 — **평소 대비 막대**(국장·미장 같은 판).
 *
 * 가운데 눈금이 그 테마의 평소다. 오늘 낙관이 평소보다 적으면 왼쪽(파랑), 많으면 오른쪽(주황)으로 차이만큼 뻗는다.
 * 평소와 다르다고 말할 만큼은 아닌 줄('평소 수준')은 같은 방향으로 **짧고 옅게** 뻗는다(--tx-lean-up-soft · --tx-lean-down-soft).
 * 옅은 막대는 그날 어떤 진한 막대보다도 짧다 — 길이 셈은 theme-vs-usual.ts themeLean 주석.
 * 눈금(반쪽을 채우는 차이)은 시장마다 다르다(THEME_LEAN_FULL) — market 으로 받는다.
 * 왜 낙관도 그대로 나누지 않는지는 theme-vs-usual.ts 머리 주석.
 * 숫자(낙관 %·평소 %)는 툴팁이 말한다 — 막대 길이는 평활 전 비율로 재서 툴팁 숫자의 뺄셈과 1~2점 갈릴 수 있어,
 * 줄에는 숫자를 적지 않는다(themeTip 주석의 2026-09-30 지적과 같은 까닭).
 *
 * 이름 칸은 62px 이고, 그보다 긴 테마 이름이 있을 때만 그 이름만큼 넓어진다. 칸 폭을 네 줄이 같이 쓰도록
 * 격자로 둔다 — 줄마다 따로 넓히면 가운데 눈금이 줄마다 어긋나 눈이 세로로 훑질 못한다.
 */
export function ThemeVsUsualRows({ themes, market = "kr" }: { themes: (ThemeRow & { name: string })[]; market?: LeanMarket }) {
  if (!themes.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(62px, max-content) minmax(0, 1fr) max-content", columnGap: 10, rowGap: 6, paddingTop: 2 }}>
      {/* v2 곁줄 꼴(12 · 자간 0 · ink3) — 11px · 자간 .04em 은 이 화면에 하나뿐인 꼴이었다(2026-10-08 마지막 점검). */}
      <span style={{ gridColumn: "1 / -1", fontSize: "var(--fs-12)", fontWeight: 500, color: "var(--t-ink3, var(--c-sub))" }}>인기 테마 · 평소 대비</span>
      {themes.map((t) => {
        const lean = themeLean(t, market);
        // 색은 바로 위 큰 비관·낙관 막대, 테마 로테이션 줄의 오르내림과 같은 -2 단이다 — 한 화면에서 같은 말을 같은 색으로.
        // '평소 수준'은 같은 색을 옅게 — 방향만 보이고, 진한 줄('더·덜 낙관')과 섞여 읽히지 않는다.
        const fill = !lean
          ? null
          : lean.shift === "up"
            ? "var(--c-warm-2)"
            : lean.shift === "down"
              ? "var(--c-blue-2)"
              : lean.side === "right"
                ? "var(--tx-lean-up-soft)"
                : "var(--tx-lean-down-soft)";
        // 글자는 v2 오름 · 내림 — 같은 모듈 큰 숫자 · 선과 같은 빨강 · 파랑(옛 hot-ink · cold-ink 는 다른 빨강 · 파랑이었다).
        const ink = lean?.shift === "up" ? "var(--t-up, var(--c-hot-ink))" : lean?.shift === "down" ? "var(--t-down, var(--c-cold-ink))" : "var(--t-ink3, var(--c-sub))";
        return (
          <div
            key={t.name}
            className="hz-tip hz-tip-wide"
            data-tip={themeTip(t)}
            style={{ display: "grid", gridColumn: "1 / -1", gridTemplateColumns: "subgrid", alignItems: "center", minWidth: 0 }}
          >
            <span style={{ ...clip, fontSize: "var(--fs-12)", fontWeight: 500, color: "var(--t-ink2, var(--c-label))" }}>{t.name}</span>
            <span style={{ position: "relative", minWidth: 0, height: 7 }}>
              {/* 트랙·눈금은 잉크를 섞은 타일 전용 색(tx.css --tx-track · --tx-tick) — --c-track 은 회색 타일 위에서 사라진다. */}
              <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: "var(--tx-track)", overflow: "hidden" }}>
                {/* '평소 수준'도 방향을 그린다(2026-10-06 운영자 요청 "평소 73%인데 지금 85%면 조금이라도 오른쪽으로" · "다 가운데라 심심하다").
                    10-05 점검에서 눈금만 남겼었다 — 차이만큼 회색을 그리니 '더 낙관' 막대보다 긴 회색이 섰다. 지금은 같은 방향 색을
                    옅게 칠하고, 길이는 가장 짧은 진한 막대보다 늘 짧다(themeLean). */}
                {lean && lean.width > 0 && fill && (
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      ...(lean.side === "left"
                        ? { right: "50%", borderRadius: "999px 0 0 999px" }
                        : { left: "50%", borderRadius: "0 999px 999px 0" }),
                      width: `${lean.width}%`,
                      background: fill,
                    }}
                  />
                )}
              </span>
              {/* 평소 눈금 — 데이터가 아니라 '자'라서 채움보다 가늘고 위아래로 조금 길다. --c-marker 는 트랙을 진하게 한 뒤로 트랙보다 옅어 틈처럼 보여 잉크 섞은 색이다. */}
              <span style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, borderRadius: 1, transform: "translateX(-50%)", background: "var(--tx-tick)" }} />
            </span>
            <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: ink, whiteSpace: "nowrap" }}>
              {lean ? LEAN_WORD[lean.shift] : LEAN_WORD.none}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 요약 글에서 **그날의 주인공**을 굵게 집는다. 국장·미장 두 히어로가 함께 쓴다.
 *
 * 시장 브리핑의 '오늘의 브리핑'은 문단을 JSX 로 조립해서
 * 지표명·핵심 수치에 <b> 를 직접 붙인다. 여기는 LLM 이 보낸 **통글**이라 같은 방법을
 * 못 쓴다 — 대신 화면에서 집는다.
 *
 * 처음엔 수치를 집었다가 걷었다("3일간·328억"). 카더라에서 눈이 찾는 것은 숫자가
 * 아니라 **무엇이 회자되나**다. 그래서 낱말은 그날 화면이 이미 뽑아 둔 것에서만
 * 가져온다 — 급부상 종목·주요 종목 리포트·테마 로테이션·이슈 키워드. 손으로 적어 둔
 * 목록이 아니라 **오늘 자 집계**라 낡지 않는다. 2차전지가 화제인 날은 2차전지가,
 * 아닌 날은 그날의 것이 굵어진다.
 *
 * ⚠️ 한 문단에 **최대 둘**이다. 굵은 데가 셋을 넘으면 강조가 아니라 얼룩이 된다.
 * 그리고 같은 낱말은 **글 전체에서 한 번만** 굵어진다 — used 를 문단마다 새로 만들면
 * 반도체가 2·3문단에서 각각 한 번씩, 화면에서는 두 번 굵어진다(실측). 세 문단이
 * 한 글이므로 셈도 글 단위로 한다. 그래서 호출자가 Set 을 들고 넘긴다.
 *
 * ⚠️ 긴 낱말을 먼저 대본다. "삼성전자"를 "삼성"보다 뒤에 대면 "삼성"만 굵어지고
 * "전자"가 떨어져 나온다. 그 정렬은 호출자가 한다(termsFor 참고).
 * ⚠️ 낱말 경계를 한글로는 못 가른다(\b 가 한글에 안 걸린다). 그렇다고 **뒤가 한글이면
 * 건너뛰기**로 막으면 안 된다 — 한국어는 조사가 명사에 바로 붙어서 "2차전지가",
 * "지주·밸류업과" 가 전부 걸러진다(실제로 반도체 하나만 굵어졌다). 뒤는 열어 두고,
 * 영문·숫자 낱말일 때만 뒤를 막는다("AI"가 "AI수요" 속에서 따로 굵어지는 것 방지).
 * 그 예외의 예외가 particleAfterLatin 이다(아래).
 *
 * ⚠️ 이 함수는 **한 벌만 있어야 한다.** 국장·미장이 각자 복사해 두면 한쪽만 고쳐진
 * 채로 두 화면의 강조 규칙이 갈린다(이 저장소가 파이썬↔TS 쌍둥이로 이미 겪은 일이다).
 */
const HANGUL = /[\uAC00-\uD7A3]/;

const MAX_BOLD_PER_PARAGRAPH = 2;

/**
 * 영문 이름 뒤에 **조사만** 붙었으면 그건 합성어가 아니라 낱말 경계다.
 *
 * 국장은 이름이 거의 한글이라 이 자리가 안 드러났다. 미장은 "TSMC의 7월 매출",
 * "AMD와" 처럼 라틴 이름 + 조사가 흔해서, 뒤가 한글이면 무조건 막는 규칙이 그대로
 * 걸리면 영문 종목은 하나도 안 굵어진다.
 *
 * 판정은 **뒤에 붙은 한글 덩어리 전체가 이 목록과 정확히 같은가**로 한다. 조사로
 * 시작하는지만 보면 "AI에이전트"의 '에'가 조사로 통과한다 — 덩어리째 대면 "에이전트"
 * 는 목록에 없어 그냥 막힌다. 못 맞히면 안 굵어질 뿐이라 실패가 안전한 쪽이다.
 *
 * ⚠️ 조사 목록을 문법책대로 넓히지 말 것. 넓힐수록 합성어가 새 들어온다 — 이 저장소가
 * 유령 종목 그물에서 이미 겪었다. 여기 있는 것은 국장 LLM 글 210편(21,539자)에서 실제로
 * 나온 '영문토큰 + 한글덩어리' 135건을 전수로 갈라 본 결과다. 이 목록으로 25건이 열리고
 * 110건이 막히는데, **열린 25건은 전부 조사였고 막힌 110건은 전부 합성어였다**
 * (SK+하이닉스는 · 20+일부터 · 000+억달러 …). 넓히려거든 그 대조를 다시 돌려
 * 오분류가 0인지부터 확인할 것.
 */
const LATIN_TRAILING_PARTICLES = new Set(
  (
    "의 가 이 은 는 을 를 와 과 도 만 로 에 랑 야 " +
    "에서 에게 으로 한테 처럼 보다 부터 까지 마저 조차 밖에 만큼 라고 로서 로써 " +
    "와의 과의 로의 에의 에도 에는 에선 으론 으로도 으로는 에게도 에게는 에서도 에서는 " +
    "로부터 으로서 으로써"
  ).split(" "),
);

const HANGUL_RUN = /^[\uAC00-\uD7A3]+/;

function trailingIsParticle(text: string, at: number): boolean {
  const run = HANGUL_RUN.exec(text.slice(at));
  return !!run && LATIN_TRAILING_PARTICLES.has(run[0]);
}

export function highlightTerms(
  text: string,
  terms: string[],
  used: Set<string>,
  /** particleAfterLatin: 영문 낱말 뒤가 조사면 굵힘을 허용한다(미장 히어로만 켠다).
   *  linkTerms: 이 낱말이 테마 이름이면 굵힘 대신 **링크**(테마 리포트, 2026-09-22). 굵힘 상한·한 번만 규칙은 그대로 탄다. */
  opts?: { particleAfterLatin?: boolean; linkTerms?: Map<string, string> },
): React.ReactNode[] {
  if (terms.length === 0) return [text];
  const out: React.ReactNode[] = [];
  let inThisParagraph = 0;
  let i = 0;
  let key = 0;
  let buf = "";
  outer: while (i < text.length) {
    if (inThisParagraph >= MAX_BOLD_PER_PARAGRAPH) break;
    for (const term of terms) {
      if (used.has(term)) continue;
      if (!text.startsWith(term, i)) continue;
      const before = text[i - 1];
      const after = text[i + term.length];
      if (before && HANGUL.test(before)) continue;
      if (
        after &&
        HANGUL.test(after) &&
        /^[A-Za-z0-9]+$/.test(term) &&
        !(opts?.particleAfterLatin && trailingIsParticle(text, i + term.length))
      )
        continue;
      if (buf) {
        out.push(buf);
        buf = "";
      }
      const href = opts?.linkTerms?.get(term);
      out.push(
        href ? (
          <Link key={key++} href={href} className="hz-kd-termlink" title={`${term} 테마 리포트`}>
            {term}
          </Link>
        ) : (
          <b key={key++} style={{ fontWeight: 800, color: C.ink }}>
            {term}
          </b>
        ),
      );
      used.add(term);
      inThisParagraph += 1;
      i += term.length;
      continue outer;
    }
    buf += text[i];
    i += 1;
  }
  // 상한에 걸려 중간에 멈췄으면 남은 글을 그대로 붙인다.
  if (i < text.length) buf += text.slice(i);
  if (buf) out.push(buf);
  return out;
}

/**
 * highlightTerms 에 넘길 낱말 목록을 다듬는다. **긴 것부터** 대야 "삼성전자"가
 * "삼성"에 먼저 걸리지 않는다. 한 글자는 뺀다 — 아무 데나 걸린다.
 */
export function termsFor(...groups: (string | null | undefined)[][]): string[] {
  return Array.from(new Set(groups.flat()))
    .filter((t): t is string => !!t && t.length >= 2)
    .sort((a, b) => b.length - a.length);
}

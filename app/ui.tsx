// 대시보드와 셸(사이드바/탑바)이 공유하는 UI 프리미티브.
// 색은 전부 CSS 변수(app/globals.css)를 참조하므로, data-theme 전환 시 사용처를
// 하나도 안 건드리고 라이트/다크가 함께 바뀐다.
export const C = {
  cold: "var(--c-cold)", // 저온
  neutral: "var(--c-neutral)", // 상온
  hot: "var(--c-hot)", // 고온
  mania: "var(--c-mania)", // 초고온
  ink: "var(--c-ink)",
  inkSoft: "var(--c-ink-soft)", // 브리핑 본문
  label: "var(--c-label)", // 목록 항목 이름
  sub: "var(--c-sub)", // 내비·부제
  sub2: "var(--c-sub2)", // 카드 부제
  // faint 와 sub 사이. faint 로는 흐려서 안 읽히는 보조 문구에 쓴다
  // (라이트에선 faint 보다 어둡고, 다크에선 더 밝아 양쪽 다 대비가 오른다).
  muted: "var(--c-muted)",
  faint: "var(--c-faint)",
  hint: "var(--c-hint)", // 점선·비활성 아이콘. 글자에 쓰지 말 것
  disabled: "var(--c-disabled)",
  card: "var(--c-card)",
  page: "var(--c-page)", // 흰 셸 바깥
  bg: "var(--c-bg)", // main 안쪽 바탕
  soft: "var(--c-soft)", // 카드 안 타일·회색 박스
  chip: "var(--c-chip)", // 회색 칩 배경
  line: "var(--c-line)",
  /* 카드 **안에서** 내용과 각주(또는 행과 행)를 가르는 줄. 칸을 가르는 격자선
     (--c-sheet-line)보다 한 톤 옅어야 둘이 구분된다 — 근거는 globals.css 주석.
     세 화면이 같은 자리에 같은 값을 쓴다(카더라가 먼저 이 토큰이었다).
     (여기 있던 divider 는 소비자가 0이 됐다. --c-divider 자체는 살아 있다 —
      알파라서 카드가 아닌 면 위에서도 사는 값이라, 셸 사이드바와 테마 팝오버
      각주가 raw var 로 쓴다. 카드 위 자리에는 쓰지 말 것.) */
  sheetRow: "var(--c-sheet-row)",
  track: "var(--c-track)", // 막대의 빈 '트랙'(배경)
  // 막대의 '채움' — 강조색을 안 쓰는 비교군용. track 을 채움에 돌려쓰면 안 된다
  // (트랙과 같은 색이라 막대가 사라진다). 이유는 globals.css의 --c-bar 주석 참고.
  bar: "var(--c-bar)",
  // ⚠️ 면(막대·아이콘 타일·활성 알약 바탕)에 쓰는 원색이다. **글자에 쓰지 말 것** —
  // 흰 카드 위에서 3.71, 자기 tint 위에서는 3.30 까지 떨어진다. 파란 글자는 아래 blueInk.
  blue: "var(--c-blue)",
  blueTint: "var(--c-blue-tint)",
  /* 파란 **글자**. 이 저장소는 원색과 별개로 '읽히는 값'을 따로 둔다(--c-hot-ink 와 같은
     어법). 파랑에는 전용 토큰이 없고 --c-cold-ink 가 그 자리를 맡아 왔다 —
     .hz-more-btn:hover · .mdd-period-btn · .hz-btn-soft 가 이미 이 값이다.
     흰 카드 위 5.23 · 파란 tint 위 4.66 · 다크 카드 위 7.46. */
  blueInk: "var(--c-cold-ink)",
  // 축의 기준 눈금(1배 자리 등). 데이터가 아니라 '자'라서 트랙보다 진하고 잉크보다 옅다.
  marker: "var(--c-marker)",
  shadow: "var(--c-shadow)",
} as const;

/**
 * 같은 종류의 항목 여럿(도넛 조각, 서열 막대)을 순서대로 칠하는 파랑 스케일.
 * 색조를 바꾸면 '순서'가 아니라 '종류'로 읽히므로 명도만 움직인다.
 */
export const BLUE_SCALE = [
  "var(--c-blue-1)",
  "var(--c-blue-2)",
  "var(--c-blue-3)",
  "var(--c-blue-4)",
  "var(--c-blue-5)",
] as const;

/* 그림자 묶음 SH(shell/card/blue/blueStrong)는 여기 있었다. 콘솔 리디자인이 카드를
   시트로 바꾸면서 경계가 그림자에서 헤어라인으로 돌아갔고, 마지막 소비자였던
   kadera/parts.tsx 의 `card` 와 함께 참조가 0이 됐다. 살아 있는 그림자는 --c-shadow ·
   --c-shadow-strong 둘이고, 그건 C.shadow 로 따로 나간다. */

/**
 * 반지름 — 토스증권 웹 실측 눈금(globals.css 의 --r-* 주석에 근거를 적어 뒀다).
 * 카드·패널 12 / 내비 항목 9 / 버튼·타일 8 / 알약은 그대로.
 *
 * 역할로 고른다. 같은 값을 쓰더라도 "이건 카드다 / 버튼이다"를 이름이 말해야,
 * 다음에 눈금을 옮길 때 무엇이 같이 움직여야 하는지가 드러난다.
 * (예전엔 shell·card·icon 셋이 쓰는 곳 없이 남아 있었고, 살아 있던 tile 하나가
 *  카드·타일·내비를 다 겸했다.)
 */
export const R = {
  card: "var(--r-card)",
  nav: "var(--r-nav)",
  control: "var(--r-control)",
  pill: "var(--r-pill)",
} as const;

// 햇쩨 지수(0~100)를 4구간 라벨로 매핑 — 파이프라인 calculate_score.py의
// stage_for_score와 동일 경계(25/50/75). 프론트는 저장된 stage 문자열 대신
// 점수에서 직접 계산해, 표시가 데이터와 항상 일치하고 라벨 변경에도 견고하다.
export function stageForScore(score: number): string {
  if (score < 25) return "저온";
  if (score < 50) return "상온";
  if (score < 75) return "고온";
  return "초고온";
}

// 숫자를 자릿수 고정으로 보여주려고 쓰던 이름. 예전엔 JetBrains Mono였는데, 그 서체엔
// 한글 글리프가 없어서 "31℃ · 상온"처럼 한글이 섞인 자리는 Pretendard도 건너뛰고 OS 기본
// 한글 폰트로 떨어졌다(맥·윈도우가 서로 다르게 보이던 원인). 이제 Pretendard 하나로 통일한다.
//
// 폭 고정은 서체가 아니라 tabular-nums로 낸다 — Pretendard가 이 기능을 지원해서
// 111/847/000이 모두 같은 폭으로 찍힌다. 실제 적용은 globals.css의 body 규칙이 맡는다.
export const MONO = "var(--font-pretendard), sans-serif";

// className 은 .ms 에 덧붙는다(대체가 아니라). 지금 쓰임은 채운 글리프를 내는
// .ms-fill 하나뿐인데, 아이콘 폰트 규칙(.ms)은 어느 경우에도 남아야 하므로 합쳐 준다.
//
// ⚠️⚠️ **리거처 이름은 안 보일 뿐 글자다.** 폰트가 "chevron_right" 라는 글자열을 글리프
// 하나로 합쳐 그려 주는 것이라, 눈으로 보면 화살표지만 **읽어 주는 기계에는 그 이름이
// 그대로 남는다.** 카더라 급부상 칩이 "급부상 디아이 5.1배chevron_right" 로 읽혔다
// (2026-09-05 실측). 73자리가 전부 같은 꼴이었다.
//
// 그래서 **기본값을 aria-hidden 으로 둔다.** 아이콘은 거의 다 옆 글자를 거드는 그림이라
// 지우는 편이 맞다. 눈으로 읽는 화면은 하나도 안 바뀐다.
//
// label 은 그 기본값을 뒤집는 마개다. **그림이 혼자 뜻을 지는 자리**에만 준다 — 눈 모양
// 뒤에 숫자만 오는 카더라 통계 줄처럼, 그림을 빼면 그게 무슨 수인지 알 길이 없는 곳이다.
// 이때도 글리프는 그대로 덮어 두고, 이름은 옆에 안 보이는 글자로 따로 세운다(아래 참고).
//
// ⚠️ **아이콘만 든 단추·링크에는 label 을 주지 말고 그 단추에 aria-label 을 달 것.**
//    이름은 누를 수 있는 것에 붙어야 초점이 갔을 때 읽힌다. 이 저장소는 이미 그렇게
//    하고 있다(테마 토글·햄버거·닫기·확대·달 넘김 …). 그런 자리에서 여기 기본값은
//    바깥 aria-label 을 가리지 않는다 — 이름은 단추가 이미 쥐고 있고, 안쪽 리거처만
//    조용해진다.
//
// ⚠️⚠️ **label 을 role="img" + aria-label 로 내면 안 된다.** 처음엔 그렇게 짰는데,
//    크롬 접근성 나무를 직접 열어 보니 이름은 "설명" 으로 잘 잡히면서도 **안쪽 리거처가
//    ignored=false 인 StaticText 로 그대로 남아 있었다**(2026-09-05, CDP
//    Accessibility.getPartialAXTree 실측):
//        ignored=false role=image      name="설명"
//        ignored=false role=StaticText name="help"   ← 이게 안 지워진다
//    role="img" 는 명세상 자식을 안 읽는 역할인데도 크롬은 나무에 남긴다. 글자 단위로
//    훑는 읽기 모드에서는 그 "help" 에 그대로 닿는다. 그래서 **글리프는 어떤 경우에도
//    aria-hidden 으로 덮고**, 이름이 필요하면 옆에 안 보이는 글자를 따로 세운다.
//    .hz-a11y-only 는 화면에서만 사라지고 읽기에는 남는 상투 수법이다(globals.css).
//    absolute 라 흐름 밖이라서 flex 항목으로 세지 않는다 — gap 이 한 칸 더 벌어지지 않는다.
export function Icon({
  name,
  label,
  style,
  className,
}: {
  name: string;
  /** 그림이 혼자 뜻을 지는 자리에만. 단추 안이라면 여기 말고 단추에 aria-label 을 준다. */
  label?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const glyph = (
    <span className={className ? `ms ${className}` : "ms"} style={style} aria-hidden="true">
      {name}
    </span>
  );
  if (!label) return glyph;
  return (
    <>
      {glyph}
      <span className="hz-a11y-only">{label}</span>
    </>
  );
}

/**
 * 생성형 AI 가 쓴 글 옆에 붙는 고지 문구. 세 곳(히어로 요약 · 카더라 생태계 총평 ·
 * 종목 리포트)이 반드시 같은 문장을 써야 한다 — 문구가 갈리면 "어떤 글이 AI 인가"가
 * 화면마다 다르게 읽힌다.
 */
export const AI_NOTICE = "이 요약은 생성형 AI가 작성했습니다.";

/**
 * 생성형 AI 가 쓴 문단 앞에 세우는 ✨ 표시. 누르거나 마우스를 올리면 AI_NOTICE 가 뜬다.
 *
 * 왜 아이콘만으로 안 되나. 「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 제31조가
 * 생성형 AI 결과물에 "생성형 인공지능에 의하여 생성되었다는 사실"을 표시하도록 요구한다
 * (2026-01-22 시행). ✨ 는 그 사실을 말해 주지 않는다. 그렇다고 문장마다 고지를 한 줄씩
 * 깔면 정작 읽어야 할 요약보다 고지가 길어져서, 이미 서 있던 아이콘을 눌리게 만들고
 * 문구를 그 안에 담는다.
 *
 * 여는 방식은 hz-tip-tap(= :hover + :focus-within)이다. 모바일에서 :hover 가 없는 걸
 * 툴팁 하나 못 여는 문제로 두면 고지가 아예 닿지 않으므로, 아이콘을 <button> 으로 만들어
 * 탭에 포커스가 잡히게 한다. 같은 문구가 aria-label 에도 들어가 화면을 못 보는
 * 이용자에게도 전달된다.
 *
 * hz-tip-start 를 고정으로 붙인다. 세 자리 모두 ✨ 가 글 묶음의 **왼쪽 끝**에 서는데,
 * 기본값(가운데 정렬)이면 폭 200px 남짓한 툴팁이 화면 왼쪽으로 넘쳐 가로 스크롤을
 * 만든다(globals.css 의 hz-tip-start 주석에 같은 사고가 적혀 있다).
 *
 * size 는 원래 아이콘 크기를 그대로 넘긴다. 자리마다 글자 크기가 달라 ✨ 도 22/15/13 으로
 * 다르고, 그 비례가 깨지면 아이콘만 튄다.
 */
export function AiMark({ size, style }: { size: number; style?: React.CSSProperties }) {
  return (
    <span
      className="hz-tip hz-tip-tap hz-tip-start"
      data-tip={AI_NOTICE}
      // alignSelf 로 제 높이만 차지하게 못박는다. flex 기본값(stretch)이면 이 칸이 옆
      // 문단 높이만큼 늘어나, 위로 펴지는 툴팁이 아이콘이 아니라 문단 꼭대기에서 열린다.
      // 글리프 위치는 그대로다(.ms 는 line-height:1 이라 어느 쪽이든 칸 맨 위에 그려진다).
      style={{ display: "inline-flex", alignSelf: "flex-start", ...style }}
    >
      <button type="button" className="hz-ai-mark" aria-label={AI_NOTICE}>
        <Icon name="auto_awesome" style={{ fontSize: size, color: C.blue, display: "block" }} />
      </button>
    </span>
  );
}

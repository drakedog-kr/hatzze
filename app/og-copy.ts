/**
 * /kadera·/mdd 공유 카드에 들어가는 글.
 *
 * 왜 카드 파일 안이 아니라 여기냐면, 같은 글을 두 곳이 봐야 하기 때문이다 —
 * 카드를 그리는 opengraph-image.tsx 와, og:image:alt 를 채우는 app/seo.ts.
 * (컨벤션이 alt 까지 자동으로 넣어 주면 좋겠지만, 페이지가 openGraph 를 선언하는
 *  순간 컨벤션 이미지는 아예 안 쓰인다. 자세한 건 app/seo.ts 주석 참고.)
 *
 * 의존이 없는 데이터 파일로 둔다. 카드 파일은 폰트·fs 를 끌고 오는데, 그걸
 * 페이지 메타데이터 쪽으로 딸려 보내지 않으려는 것이다.
 */
export type OgCopy = {
  /** 카드에 크게 박히는 페이지 이름. */
  title: string;
  /** 본문. 줄 나눌 자리를 직접 정한다(카드는 한 번 굳으면 못 고친다). */
  lines: string[];
  /** 카드 맨 아래 한 줄. */
  foot: string;
  /** og:image:alt. 이미지를 못 보는 사람에게 카드 내용을 그대로 전한다. */
  alt: string;
};

export const KADERA_CARD: OgCopy = {
  title: "카더라 리포트",
  lines: [
    "주식 텔레그램 채널 수백 개를 대신 읽습니다.",
    "오늘 가장 많이 언급된 종목과 가장 많이 퍼진 메시지를",
    "매일 집계합니다.",
  ],
  foot: "hatzze.fun/kadera",
  alt: "카더라 리포트 · 주식 텔레그램 채널 수백 개를 대신 읽습니다",
};

export const MDD_CARD: OgCopy = {
  title: "MDD 정밀분석",
  lines: [
    "내 종목은 고점에서 얼마나 내려왔습니까.",
    "이만큼 빠졌던 적이 과거에 몇 번이었는지,",
    "회복까지 얼마나 걸렸는지 함께 봅니다.",
  ],
  foot: "hatzze.fun/mdd",
  alt: "MDD 정밀분석 · 내 종목은 고점에서 얼마나 내려왔습니까",
};

/**
 * shadcn/ui Skeleton(2026-09 레지스트리 rhea)을 옮긴 것이다.
 *
 * 원본과 다른 점 — 모양은 이 사이트 것이다. rhea 는 `animate-pulse` + `bg-muted` 인데, 이 사이트의 자리표시자는
 * 흰 시트 안에서 보이는 `--c-bg` 바탕에 은은한 깜빡임(`.hz-shimmer`, sheets.css — 동작 줄이기 설정이면 멈춘다)이다.
 * 기본은 바탕 `--c-bg` · 모서리 8 · 최대 폭 100%(shadcn.css 의 .cn-skeleton)이고, 높이·폭·모서리·바탕은 style 로 준다.
 * 예전엔 로딩 화면 여섯 곳과 카더라·MDD 의 자리표시자가 같은 블록 함수를 저마다 들고 있었다(2026-09-26 한 벌로).
 *
 * 훅이 없어 서버·클라이언트 어디서나 그린다. 클래스 합치기는 `cx`(lib/cx.ts).
 */
import * as React from "react";

import { cx } from "@/lib/cx";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cx("cn-skeleton hz-shimmer", className)} {...props} />;
}

export { Skeleton };

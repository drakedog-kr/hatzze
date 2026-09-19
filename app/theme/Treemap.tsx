import Link from "next/link";

import { themeHref } from "@/lib/theme-href";
import type { ThemeOverview } from "@/lib/theme-page";
import { squarify } from "@/lib/treemap";

import { MONO } from "../ui";

/**
 * 테마 점유율 지도(트리맵). **칸의 크기가 최근 사흘 언급 점유율, 색이 변화 방향과 크기**다.
 *
 * 서버 컴포넌트다 — squarify 는 순수 함수라 서버에서 돌고, 칸은 퍼센트 좌표의 절대 배치 div 라
 * 자바스크립트 없이 그려진다. 크롤러도 테마 이름과 점유율을 첫 HTML 에서 읽는다.
 *
 * ## 배치는 2:1 로 계산하고 폰에서는 세로로 늘인다
 *
 * squarify 는 종횡비를 알아야 칸을 정사각형에 가깝게 놓는다. 서버는 화면 폭을 모르므로 2:1 로
 * 계산해 두고(.hz-treemap 의 aspect-ratio), 폰(≤560)에서는 CSS 가 상자를 1:1.15 로 세운다 —
 * 칸의 **상대 위치는 그대로**이고 세로로만 늘어나므로 겹치지 않는다(layout.css).
 *
 * ## 색은 온도색 두 가지뿐이다
 *
 * 늘어난 테마는 따뜻한 색(--c-warm-2), 줄어든 테마는 파랑(--c-blue-2)이고 크기(%p)에 따라 세 단.
 * 이 저장소의 온도색 체계 그대로다 — 빨강·초록을 새로 들이지 않는다. 변화가 ±0.3%p 안이면 회색.
 * 색 이름은 kadera.css 의 .hz-tm-tile.is-* 에 있다.
 *
 * ## 글자는 칸이 클 때만
 *
 * 폭·높이(컨테이너 대비 %)로 세 단계. 작은 칸은 글자를 안 두고 툴팁·aria-label 로만 말한다 —
 * 두면 두 글자만 잘려 보여서 무엇인지 알 수 없다. 작은 칸은 폰에서 더 작아지므로 CSS 가 한 단계 더 접는다.
 */

/** 계산용 좌표계. 가로 100 · 세로 50 = 종횡비 2:1. 세로 좌표는 ×2 해서 퍼센트로 쓴다. */
const W = 100;
const H = 50;

/** 변화(%p)를 색 단계로. 문턱은 테마 로테이션 카드에서 눈에 띄던 크기를 기준으로 잡았다. */
function toneOf(delta: number | null): string {
  if (delta == null) return "is-flat";
  const a = Math.abs(delta);
  if (a < 0.3) return "is-flat";
  const step = a >= 3 ? 3 : a >= 1 ? 2 : 1;
  return delta > 0 ? `is-up-${step}` : `is-down-${step}`;
}

function fmtDelta(delta: number | null): string {
  if (delta == null) return "변화 자료 없음";
  if (Math.abs(delta) < 0.05) return "0.0%p";
  return `${delta > 0 ? "▲" : "▼"}${Math.abs(delta).toFixed(1)}%p`;
}

export function Treemap({ themes }: { themes: ThemeOverview[] }) {
  const rects = squarify(
    themes.map((t) => ({ key: t.theme, value: t.sharePct })),
    W,
    H,
  );
  const byTheme = new Map(themes.map((t) => [t.theme, t]));

  return (
    <div className="hz-treemap" role="list" aria-label="테마별 최근 3일 언급 점유율">
      {rects.map((r) => {
        const t = byTheme.get(r.key)!;
        // 글자 단계는 넓이가 아니라 **폭과 높이**로 가른다. 넓이만 보면 가늘고 긴 칸에 이름이 들어가
        // "인터…"·"건…"처럼 두 글자만 남는다(2026-09-19 실측). 폭 9% 는 컨테이너 900px 에서 81px 로
        // 다섯 글자 이름(13px, 약 65px)이 들어가는 폭이고, 7% 는 11px 이름의 자리다.
        const wp = r.w; // 폭 %
        const hp = (r.h / H) * 100; // 높이 %
        const size = wp >= 16 && hp >= 16 ? "lg" : wp >= 9 && hp >= 10 ? "md" : wp >= 7 && hp >= 6 ? "sm" : "xs";
        const tip = `${t.theme} · 점유율 ${t.sharePct.toFixed(1)}% · ${fmtDelta(t.shareDelta)} · ${t.rank}위`;
        return (
          <Link
            key={r.key}
            href={themeHref(t.theme)}
            role="listitem"
            aria-label={tip}
            className={`hz-tm-tile hz-tip ${toneOf(t.shareDelta)} is-${size}`}
            data-tip={tip}
            style={{
              left: `${r.x}%`,
              top: `${(r.y / H) * 100}%`,
              width: `${r.w}%`,
              height: `${(r.h / H) * 100}%`,
            }}
          >
            {size !== "xs" && (
              <span className="hz-tm-in">
                {/* 가운뎃점 앞에 단어 결합자(U+2060)를 둬 폰에서 줄바꿈할 때 점이 앞 낱말에 붙는다 —
                    안 두면 "전자 / · / 부품" 처럼 점이 혼자 한 줄을 차지한다(2026-09-19 실측). */}
                <span className="hz-tm-name">{t.theme.replace(/·/g, "\u2060·")}</span>
                {size !== "sm" && (
                  <span className="hz-tm-val" style={{ fontFamily: MONO }}>
                    {t.sharePct.toFixed(1)}%
                    {size === "lg" && <span className="hz-tm-delta">{fmtDelta(t.shareDelta)}</span>}
                  </span>
                )}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** 지도 아래 범례. 색이 무엇을 뜻하는지 글자로 한 번 적는다(색만으로 방향을 말하지 않는다). */
export function TreemapLegend() {
  const sw = (cls: string) => <span className={`hz-tm-sw ${cls}`} aria-hidden="true" />;
  return (
    <div className="hz-tm-legend">
      <span>{sw("is-up-3")}{sw("is-up-2")}{sw("is-up-1")} 관심이 늘어난 테마</span>
      <span>{sw("is-flat")} 변화 ±0.3%p 안</span>
      <span>{sw("is-down-1")}{sw("is-down-2")}{sw("is-down-3")} 줄어든 테마</span>
    </div>
  );
}

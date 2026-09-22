import Link from "next/link";

import { themeHref } from "@/lib/theme-href";
import type { ThemeHotStock, ThemeOverview } from "@/lib/theme-page";
import { squarify } from "@/lib/treemap";
import { stockHref } from "@/lib/stock-page";

import { MONO } from "../ui";
import { MapHint } from "./MapHint";

/**
 * 점유율 지도(트리맵). **칸의 크기가 최근 사흘 언급, 색이 변화 방향과 크기**다. 테마 목록은 테마를
 * 칸으로(themeTiles), 테마 화면은 그 테마의 종목을 칸으로(stockTiles) 그린다 — 그림은 한 벌이다.
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

/** 지도 한 칸의 재료. 테마(목록)와 종목(테마 화면)이 같은 그림을 쓴다. */
export type TreemapTile = {
  key: string;
  label: string;
  /** 칸의 넓이. 점유율(%)이든 언급 수든 비율만 뜻이 있다. */
  value: number;
  /** kadera.css 의 .is-up-N · .is-down-N · .is-flat. */
  tone: string;
  href: string;
  /** 툴팁·aria-label. */
  tip: string;
  valueText: string;
  deltaText?: string;
};

/** 테마 목록의 칸 — 넓이는 점유율, 색은 닷새 넘게 이전과 견준 변화(%p). */
export function themeTiles(themes: ThemeOverview[]): TreemapTile[] {
  return themes.map((t) => ({
    key: t.theme,
    label: t.theme,
    value: t.sharePct,
    tone: toneOf(t.shareDelta),
    href: themeHref(t.theme),
    tip: `${t.theme} · 점유율 ${t.sharePct.toFixed(1)}% · ${fmtDelta(t.shareDelta)} · ${t.rank}위`,
    valueText: `${t.sharePct.toFixed(1)}%`,
    deltaText: fmtDelta(t.shareDelta),
  }));
}

/**
 * 테마 화면의 칸 — 넓이는 최근 사흘 언급 수, 색은 **평소와 견준 배수**(평소 = 지난 한 달 하루 평균의 사흘치,
 * lib/theme-page.ts usualMentions). 점유율 %p 가 아니라 배수인 이유: 종목 하나의 언급은 몇 회에서 몇백 회까지 폭이
 * 넓어 차이(회)로 단을 나누면 큰 종목만 색이 들고, 배수로 나눠야 "평소보다 말이 늘었나"가 종목 크기와 무관하게 읽힌다.
 * 문턱: 1.5배 이상·2.5배 이상·5배 이상(또는 지난 한 달 0회에서 새로 등장). 줄어든 쪽도 같은 비율.
 * 글자는 배수가 아니라 **평소 대비 +60% / −42%** 다 — "앞 사흘의 58%"는 직관적이지 않았다(2026-09-21 Hun).
 */
/** 종목의 색 단계(kadera.css 의 .is-up-N · .is-down-N · .is-flat). 지도 칸과 표의 이름 옆 태그가 같은 색을 쓴다. */
export function stockTone(m: number, usual: number): string {
  if (usual === 0) return m >= 5 ? "is-up-3" : m >= 2 ? "is-up-2" : "is-up-1";
  const ratio = m / usual;
  if (ratio >= 5) return "is-up-3";
  if (ratio >= 2.5) return "is-up-2";
  if (ratio >= 1.5) return "is-up-1";
  if (ratio <= 1 / 5) return "is-down-3";
  if (ratio <= 1 / 2.5) return "is-down-2";
  if (ratio <= 1 / 1.5) return "is-down-1";
  return "is-flat";
}

export function stockTiles(stocks: ThemeHotStock[]): TreemapTile[] {
  return stocks.map((s) => ({
    key: s.code,
    label: s.name,
    value: s.mentions,
    tone: stockTone(s.mentions, s.usualMentions),
    href: stockHref(s.code),
    tip: `${s.name} · 최근 3일 ${s.mentions.toLocaleString("ko-KR")}회 · ${usualDeltaText(s.mentions, s.usualMentions)} · 하루 최다 ${s.channels}곳`,
    valueText: `${s.mentions.toLocaleString("ko-KR")}회`,
    deltaText: s.usualMentions === 0 ? "새로 등장" : usualDeltaText(s.mentions, s.usualMentions).replace("평소 대비 ", "").replace(" 언급", ""),
  }));
}

/** 평소와 견준 언급 변화 한 마디 — "평소 대비 +60% 언급" · "평소 대비 −42% 언급" · "새로 등장". 표의 이름 옆 태그와 지도 툴팁이 같이 쓴다. */
export function usualDeltaText(mentions: number, usual: number): string {
  if (usual === 0) return "새로 등장";
  const pct = Math.round((mentions / usual - 1) * 100);
  if (pct === 0) return "평소만큼 언급";
  return `평소 대비 ${pct > 0 ? "+" : "−"}${Math.abs(pct)}% 언급`;
}

export function Treemap({
  tiles,
  ariaLabel,
  hint,
}: {
  tiles: TreemapTile[];
  ariaLabel: string;
  /**
   * 처음 온 사람에게 한 번 띄우는 쪽지(MapHint). 가장 큰 칸 안, 이름 아래에 선다. `text` 는 그 칸의
   * 이름을 받아 문장을 만든다. id 는 localStorage 키의 꼬리라 지도마다 달라야 한다.
   */
  hint?: { id: string; text: (label: string) => string };
}) {
  const rects = squarify(
    tiles.map((t) => ({ key: t.key, value: t.value })),
    W,
    H,
  );
  const byKey = new Map(tiles.map((t) => [t.key, t]));
  // squarify 는 값이 큰 순서로 놓으므로 첫 칸이 가장 크다.
  const biggest = rects[0];

  return (
    <div className="hz-treemap" role="list" aria-label={ariaLabel}>
      {rects.map((r) => {
        const t = byKey.get(r.key)!;
        // 글자 단계는 넓이가 아니라 **폭과 높이**로 가른다. 넓이만 보면 가늘고 긴 칸에 이름이 들어가
        // "인터…"·"건…"처럼 두 글자만 남는다(2026-09-19 실측). 폭 9% 는 컨테이너 900px 에서 81px 로
        // 다섯 글자 이름(13px, 약 65px)이 들어가는 폭이고, 7% 는 11px 이름의 자리다.
        const wp = r.w; // 폭 %
        const hp = (r.h / H) * 100; // 높이 %
        // 가늘고 긴 칸(폭 4~7% · 높이 20% 이상)은 이름을 글자 단위로 세로로 쌓는다(is-tall) —
        // 그냥 두면 이름이 안 들어가 빈 칸이 되는데, 세로로 다섯 글자면 들어간다.
        const size =
          wp >= 16 && hp >= 16 ? "lg" : wp >= 9 && hp >= 10 ? "md" : wp >= 7 && hp >= 6 ? "sm" : wp >= 4 && hp >= 20 ? "tall" : "xs";
        return (
          <Link
            key={r.key}
            href={t.href}
            role="listitem"
            aria-label={t.tip}
            className={`hz-tm-tile hz-tip ${t.tone} is-${size}`}
            data-tip={t.tip}
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
                <span className="hz-tm-name">{t.label.replace(/·/g, "\u2060·")}</span>
                {size !== "sm" && size !== "tall" && (
                  <span className="hz-tm-val" style={{ fontFamily: MONO }}>
                    {t.valueText}
                    {size === "lg" && t.deltaText && <span className="hz-tm-delta">{t.deltaText}</span>}
                  </span>
                )}
              </span>
            )}
          </Link>
        );
      })}
      {hint && biggest && (
        // 가장 큰 칸의 이름·값 두 줄(약 48px) 아래. 좌표는 칸과 같은 퍼센트라 폰에서도 같이 움직인다.
        <MapHint
          id={hint.id}
          text={hint.text(byKey.get(biggest.key)!.label)}
          left={`calc(${biggest.x}% + 10px)`}
          top={`calc(${(biggest.y / H) * 100}% + 56px)`}
        />
      )}
    </div>
  );
}

/** 지도 아래 범례. 색이 무엇을 뜻하는지 글자로 한 번 적는다(색만으로 방향을 말하지 않는다). */
export function TreemapLegend({ up, flat, down }: { up: string; flat: string; down: string }) {
  const sw = (cls: string) => <span className={`hz-tm-sw ${cls}`} aria-hidden="true" />;
  return (
    <div className="hz-tm-legend">
      <span>{sw("is-up-3")}{sw("is-up-2")}{sw("is-up-1")} {up}</span>
      <span>{sw("is-flat")} {flat}</span>
      <span>{sw("is-down-1")}{sw("is-down-2")}{sw("is-down-3")} {down}</span>
    </div>
  );
}

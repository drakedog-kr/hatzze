"use client";

/**
 * 과열도 추이 — 햇쩨 지수가 날마다 어떻게 움직였나(shadcn 영역 차트 chart-area-interactive 꼴).
 *
 * 히어로는 오늘 한 점과 전일 대비만 말한다. 이 시트는 그 한 점이 어떤 흐름 위에 있는지를 보인다.
 *
 * ⭐ 색은 온도만 말한다(theme.css 온도 2색 체계). 50 위는 빨강, 아래는 파랑 — 같은 선을 50 에서 잘라
 *    위아래를 다른 색으로 칠한다(clipPath). 네 구간은 25 · 50 · 75 점선으로만 가른다.
 * ⭐ 크로스헤어·호버 점·툴팁은 다른 차트와 같은 어법이다(.hz-vline · .hz-vdot, app/styles/shadcn.css).
 * ⚠️ 도수는 정수로 적는다(히어로와 같다 — 소수점은 없는 정밀도로 보인다).
 * ⚠️ 이 값은 daily_score 다. 눈금을 바꾸면 지난 행을 다시 계산해야 선이 이어진다(lib/data.ts getScoreHistory).
 */
import { useId, useState } from "react";

import type { ScorePoint } from "@/lib/data";
import { SectionHead } from "@/app/kadera/SectionHead";

// 그림 영역은 0~100 × 0~100 좌표로 그리고 늘려 붙인다(preserveAspectRatio="none"). 글자·점은 HTML 로 얹는다 —
// SVG 글자는 뷰박스 단위라 폰 폭에서 5px 남짓으로 줄어 안 읽힌다(MDD 차트 주석과 같은 까닭).
const PLOT_H = 168;
const AXIS_L = 26; // 세로 눈금 글자 자리(px)
const AXIS_B = 20; // 날짜 글자 자리(px)
const RANGES = [
  { key: "30", label: "30일", days: 30 },
  { key: "all", label: "전체", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${wd})`;
}
const stageOf = (s: number) => (s < 25 ? "저온" : s < 50 ? "상온" : s < 75 ? "고온" : "초고온");

export function ScoreTrend({ points }: { points: ScorePoint[] }) {
  const [range, setRange] = useState<RangeKey>("all");
  const uid = useId().replace(/:/g, "");
  if (points.length < 2) return null;

  const days = RANGES.find((r) => r.key === range)!.days;
  const shown = Number.isFinite(days) ? points.slice(-days) : points;
  const n = shown.length;
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => 100 - v; // 점수 0~100 을 그대로 세로 좌표로
  const line = shown.map((p, i) => `${x(i).toFixed(3)},${y(p.score).toFixed(2)}`).join(" ");
  const area = `0,100 ${line} 100,100`;
  // 날짜 눈금은 다섯 자리쯤 — 처음·끝을 반드시 넣는다.
  const tickIdx = [...new Set([0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1])];
  const last = shown[n - 1];
  const tone = (v: number) => (v >= 50 ? "var(--c-hot)" : "var(--c-blue)");
  const label: React.CSSProperties = { position: "absolute", fontSize: "var(--fs-11)", color: "var(--c-muted)", lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  const tabs = (
    <div className="hz-seg" role="group" aria-label="기간">
      {RANGES.map((r) => (
        <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="hz-sheet">
      <SectionHead
        icon="show_chart"
        title="과열도 추이"
        desc={`${dayLabel(shown[0].date)}부터 ${dayLabel(last.date)}까지 날마다 같은 기준으로 잰 온도입니다`}
        right={tabs}
      />
      <div style={{ padding: "8px 22px 18px" }}>
        <div style={{ position: "relative", height: PLOT_H + AXIS_B, paddingLeft: AXIS_L }}>
          {/* 그림 영역 */}
          <div style={{ position: "relative", height: PLOT_H }}>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
              role="img"
              aria-label={`과열도 추이, 마지막 ${Math.round(last.score)}℃ ${stageOf(last.score)}`}
            >
              <defs>
                <clipPath id={`hot-${uid}`}>
                  <rect x="-1" y="-1" width="102" height="51" />
                </clipPath>
                <clipPath id={`cold-${uid}`}>
                  <rect x="-1" y="50" width="102" height="51" />
                </clipPath>
              </defs>
              {[25, 50, 75].map((v) => (
                <line key={v} x1="0" y1={y(v)} x2="100" y2={y(v)} stroke="var(--c-line)" strokeWidth={1} strokeDasharray={v === 50 ? undefined : "3 5"} vectorEffect="non-scaling-stroke" />
              ))}
              <polygon points={area} fill="var(--c-hot)" opacity={0.14} clipPath={`url(#hot-${uid})`} />
              <polygon points={area} fill="var(--c-blue)" opacity={0.14} clipPath={`url(#cold-${uid})`} />
              <polyline points={line} fill="none" stroke="var(--c-hot)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#hot-${uid})`} />
              <polyline points={line} fill="none" stroke="var(--c-blue)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#cold-${uid})`} />
            </svg>
            {/* 오늘 점 — SVG 원은 늘려 붙이면 찌그러지므로 HTML 로 */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: "100%",
                top: `${y(last.score)}%`,
                width: 9,
                height: 9,
                borderRadius: 999,
                background: "var(--c-card)",
                border: `2px solid ${tone(last.score)}`,
                transform: "translate(-50%, -50%)",
              }}
            />
            {/* 호버 띠 — 점마다 한 칸. 선·호버 점은 칸 폭의 i/(n−1) 자리에 선다(app/home/parts.tsx AreaChart 와 같은 셈). */}
            <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex" }}>
              {shown.map((p, i) => {
                const at = i / (n - 1);
                const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
                return (
                  <div
                    key={p.date}
                    className={`hz-tip hz-vline${edge}`}
                    data-tip={`${dayLabel(p.date)} · ${Math.round(p.score)}℃ · ${stageOf(p.score)}`}
                    style={{ flex: 1, position: "relative", ["--hz-x" as string]: `${at * 100}%` }}
                  >
                    <span className="hz-vdot" style={{ top: `${y(p.score)}%`, background: tone(p.score) }} />
                  </div>
                );
              })}
            </div>
            {/* 세로 눈금 — 구간 경계 25 · 50 · 75 */}
            {[25, 50, 75].map((v) => (
              <span key={v} aria-hidden style={{ ...label, left: -AXIS_L, width: AXIS_L - 8, textAlign: "right", top: `${y(v)}%`, transform: "translateY(-50%)" }}>
                {v}
              </span>
            ))}
          </div>
          {/* 날짜 눈금 */}
          <div aria-hidden style={{ position: "relative", height: AXIS_B }}>
            {tickIdx.map((i) => (
              <span
                key={i}
                style={{
                  ...label,
                  top: 7,
                  left: `${x(i)}%`,
                  transform: i === 0 ? "none" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {`${Number(shown[i].date.slice(5, 7))}/${Number(shown[i].date.slice(8, 10))}`}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

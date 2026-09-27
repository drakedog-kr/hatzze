// 홈 히어로 오른쪽 칸 아래의 **햇쩨 지수 추이** 타일. 카더라 두 히어로의 센티먼트 추이(app/kadera/parts.tsx
// SentimentTrendTile)와 같은 껍데기·같은 판 높이다 — 세 히어로의 오른쪽 칸이 한 벌로 읽혀야 한다.

import type { ScorePoint } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { C, MONO, stageForScore } from "../ui";
import { STAGE_META } from "./parts";

/** 한 점의 색. 그날의 구간 색이다 — 위 햇쩨 지수 칸의 큰 숫자·알약과 같은 값이라 끝점이 그 숫자와 같은 색으로 선다. */
const stageDot = (score: number) => (STAGE_META[stageForScore(score)] ?? STAGE_META["상온"]).color;

/**
 * `points` 가 null 이면 조회 실패, 두 점이 안 되면 아직 기록이 모자란 것이다 — 빈자리의 문구가 갈린다.
 *
 * 그림(센티먼트 추이와 같은 어법):
 * - 세로축은 0~100 이 아니라 값 둘레로 좁힌다. 다만 **25(저온 경계)와 50(고온 경계)은 늘 판 안에** 둔다 —
 *   두 선이 칠한 띠의 경계라, 선이 어느 띠에 있는지가 곧 그날의 구간이다.
 * - 50 위(고온·초고온)와 25 아래(저온)를 옅게 칠한다. 상온은 칠하지 않는다. 띠 이름은 오른쪽 여백에.
 * - preserveAspectRatio="none" 이라 점(원)은 SVG 로 못 그린다(찌그러진다). 끝점·호버 점은 HTML 이다.
 * - 선은 점수 그대로(소수)다. 끝점이 위 큰 숫자(반올림한 정수)와 다를 수 있으나 같은 값이다.
 */
export function ScoreTrendTile({ points, days }: { points: ScorePoint[] | null; days: number }) {
  const cap = (
    <span className="hz-tx-stat-l">
      햇쩨 지수 추이
      <span style={{ color: C.sub2, fontWeight: 500 }}>{days}일</span>
    </span>
  );
  if (!points || points.length < 2) {
    return (
      <div className="hz-tx-stat hz-tx-trend">
        {cap}
        <p style={{ margin: 0, color: C.sub, fontSize: "var(--fs-12)" }}>
          {points === null ? "추이를 불러오지 못했습니다." : "추이를 그릴 기록이 아직 없습니다."}
        </p>
      </div>
    );
  }

  const H = 100;
  const vals = points.map((p) => p.score);
  const lo = Math.max(0, Math.min(15, Math.min(...vals) - 4));
  const hi = Math.min(100, Math.max(60, Math.max(...vals) + 4));
  const y = (v: number) => ((hi - v) / (hi - lo)) * H;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const line = points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ");
  const last = points[points.length - 1];
  // 띠 이름의 세로 자리(%) — 각 띠의 가운데.
  const hotMid = y((hi + 50) / 2);
  const coldMid = y((25 + lo) / 2);

  return (
    <div className="hz-tx-stat hz-tx-trend">
      {cap}
      {/* 차트 칸은 70 이 바닥이고, 옆 칸에 남는 높이가 있으면 늘어난다 — 홈 히어로에서 글 칸이 더 긴 날 이 타일이
          남는 높이를 받아 밑선을 바닥 칩 줄과 맞춘다(tx.css .hz-tx-hero-home 주석). SVG 가 칸을 따라 늘어난다. */}
      <div className="hz-trend-plot" style={{ minHeight: 70, display: "flex", gap: 6 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <svg
            viewBox={`0 0 100 ${H}`}
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", overflow: "visible" }}
            aria-hidden
          >
            <rect x="0" y="0" width="100" height={y(50)} fill="var(--c-hot)" opacity={0.08} />
            <rect x="0" y={y(25)} width="100" height={H - y(25)} fill="var(--c-blue)" opacity={0.08} />
            <polyline points={line} fill="none" stroke={C.inkSoft} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* 끝점 — 기준일. 위 햇쩨 지수 칸의 큰 숫자가 이 점이다. */}
          <span
            style={{
              position: "absolute",
              left: "100%",
              top: `${y(last.score)}%`,
              width: 8,
              height: 8,
              borderRadius: 999,
              border: "2px solid var(--tx-tile)",
              background: stageDot(last.score),
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          />
          {/* 호버 크로스헤어 — 센티먼트 추이와 같은 어법(칸 n 등분 · 선과 점은 --hz-x 자리). */}
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            {points.map((p, i) => {
              const at = i / (points.length - 1);
              const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
              return (
                <div
                  key={p.date}
                  className={`hz-tip hz-vline${edge}`}
                  data-tip={`${shortDate(p.date)} · ${Math.round(p.score)}℃ ${stageForScore(p.score)}`}
                  style={{ flex: 1, position: "relative", ["--hz-x" as string]: `${at * 100}%` }}
                >
                  <span className="hz-vdot" style={{ top: `${y(p.score)}%`, background: stageDot(p.score), borderColor: "var(--tx-tile)" }} />
                </div>
              );
            })}
          </div>
        </div>
        {/* 띠 이름. 폭은 두 글자만큼 고정 — 판의 오른끝이 센티먼트 추이와 같은 자리에 선다. */}
        <div style={{ position: "relative", width: 24, flexShrink: 0, fontSize: "var(--fs-11)", fontWeight: 700, lineHeight: 1 }}>
          <span style={{ position: "absolute", right: 0, top: `${hotMid}%`, transform: "translateY(-50%)", color: "var(--c-hot-ink)" }}>고온</span>
          <span style={{ position: "absolute", right: 0, top: `${coldMid}%`, transform: "translateY(-50%)", color: "var(--c-cold-ink)" }}>저온</span>
        </div>
      </div>
      {/* 양 끝 날짜. 오른쪽 여백(띠 이름 24 + 틈 6)만큼 비워 판의 끝과 맞춘다. */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingRight: 30, fontFamily: MONO, fontSize: "var(--fs-11)", color: C.sub2 }}>
        <span>{shortDate(points[0].date)}</span>
        <span>{shortDate(last.date)}</span>
      </div>
    </div>
  );
}

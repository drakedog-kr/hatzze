import Link from "next/link";

import type { DailyScore, ScorePoint } from "@/lib/data";
import { compareLabel, shortDate } from "@/lib/format";

import { Module, Spark, type Tone } from "../kadera/V2Modules";
import { stageForScore } from "../ui";
import { BAND_LABELS, DistPop, parseBrief, renderBriefLine, type BandItem } from "./Hero";
import { renderRichSummary } from "./parts";

/**
 * v2 시장 브리핑의 둘째 줄 — 햇쩨 지수 · 오늘의 브리핑(2026-10-03 "카더라에 적용한 디자인 규칙을 시장 브리핑에").
 *
 * 옛 히어로(app/home/Hero.tsx)의 재료를 그대로 쓰고 꼴만 v2 모듈로 옮겼다 — 카더라 둘째 줄의 여론 모듈과 같은 얼개다
 * (값 · 꼬리표 · 30일 선 · 최고/최저 · 아래 목록). 옛 히어로 제목("지금 시장은 저온 구간입니다")은 걷었다 — 바로 옆 큰 숫자와
 * 꼬리표가 같은 말을 한다.
 */

type Band = { label: string; count: number; fill: string; items: BandItem[] };

export function IndexModule({
  dailyScore,
  trend,
  days,
  bands,
  total,
}: {
  dailyScore: DailyScore;
  trend: ScorePoint[] | null;
  /** 선이 그리는 기간(SCORE_TREND_DAYS). 점 수(달력일 + 오늘)로 적으면 '31일'이 된다. */
  days: number;
  /** 저온 · 상온 · 고온 · 초고온 순서. */
  bands: Band[];
  /** 과열도가 들어온 지표 수(자료가 늦거나 새 지표가 첫 점수 계산 전이면 26 이 아니다). */
  total: number;
}) {
  const temp = Math.round(Math.max(0, Math.min(100, dailyScore.score)));
  const tone: Tone = temp >= 50 ? "up" : "down";
  // 반올림한 값끼리 뺀다 — 화면에 뜬 두 숫자의 차이와 같아야 한다(옛 히어로와 같은 규칙).
  const delta = dailyScore.prevDay === null ? null : temp - Math.round(dailyScore.prevDay.score);
  const vals = (trend ?? []).map((p) => p.score);
  const hi = vals.length ? Math.round(Math.max(...vals)) : temp;
  const lo = vals.length ? Math.round(Math.min(...vals)) : temp;
  return (
    <Module
      id="index"
      title="햇쩨 지수"
      meta={`지표 ${total}개`}
      // 구간 줄은 마우스를 올리거나 눌러야 그 구간 지표 목록이 열린다 — 폰엔 호버가 없어 있는 줄 모른다. 지표가 든 첫 구간 밑에 한 번.
      hint={total ? { id: "home-dist", anchor: ".v2-band-row:not(.hz-dist-row-none)", text: "구간을 누르면 그 구간 지표가 나옵니다" } : undefined}
    >
      <div className="v2-bigcard v2-index">
        <span className="v2-card-val is-big">
          <b className={`is-${tone}`}>{temp}℃</b>
          <span className="v2-reason">{stageForScore(temp)}</span>
          {delta !== null && (
            <span className="v2-index-delta">
              {compareLabel(dailyScore.date, dailyScore.prevDay?.date ?? null)}
              <b className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : undefined}>{delta > 0 ? `+${delta}` : delta < 0 ? `-${-delta}` : "0"}</b>
            </span>
          )}
        </span>
        <Spark
          id="v2-index-spark"
          values={vals}
          base={50}
          baseLabel="고온 50℃"
          w={300}
          h={64}
          tone={tone}
          dot
          tips={(trend ?? []).map((p) => `${shortDate(p.date)} · ${Math.round(p.score)}℃ ${stageForScore(p.score)}`)}
        />
        <span className="v2-card-foot">
          <span>
            <em>{days}일 최고</em>
            {hi}℃
          </span>
          <span>
            <em>{days}일 최저</em>
            {lo}℃
          </span>
        </span>
        {/* 구간별 지표 수 — 뜨거운 구간부터. 줄에 마우스를 올리면 그 구간의 지표가 열리고 누르면 그 칸으로 간다(옛 히어로와 같은 목록). */}
        <div className="v2-bands">
          {[...bands].reverse().map((b) => {
            const i = BAND_LABELS.indexOf(b.label);
            return (
              <div key={b.label} className={`hz-dist-row v2-band-row${b.count === 0 ? " hz-dist-row-none" : ""}`} data-band={i} tabIndex={0}>
                <span className="v2-band-name">
                  <i style={{ background: b.fill }} />
                  {b.label}
                </span>
                <span className="v2-band-bar">
                  <i style={{ width: `${total ? (b.count / total) * 100 : 0}%`, background: b.fill }} />
                </span>
                <b className="v2-band-n">{b.count}</b>
                <DistPop b={b} />
              </div>
            );
          })}
        </div>
      </div>
    </Module>
  );
}

/** 오늘의 브리핑 — 흐름 · 달라진 것 · 뜨거운 곳 · 여론(이름표는 코드, 문장은 LLM). 굵은 지표 이름은 그 칸으로 내려가는 링크다. */
export function BriefModule({
  summary,
  nameAnchors,
}: {
  summary: string | null | undefined;
  nameAnchors: Record<string, string>;
}) {
  const { lines, brief } = parseBrief(summary);
  return (
    <Module id="brief" title="오늘의 브리핑" ai>
      {brief ? (
        <dl className="v2-brief3">
          {brief.map((r, i) => (
            <div key={`${i}-${r.label}`} className="v2-brief3-row">
              {/* 여론 줄의 이름표는 카더라로 간다 — 그 줄의 출처이고 더 읽을 곳이다. */}
              <dt>
                {r.label === "여론" ? (
                  <Link href="/kadera" data-ga="cta_click" data-ga-cta="brief_yeoron" data-ga-surface="home_hero">
                    {r.label} ›
                  </Link>
                ) : (
                  r.label
                )}
              </dt>
              <dd>{renderBriefLine(r.text, nameAnchors)}</dd>
            </div>
          ))}
        </dl>
      ) : lines.length ? (
        // 옛 형식(이름표 없는 줄) — 파이프라인이 한 번 돌기 전까지 남아 있다.
        <div className="v2-brief">
          {lines.map((l, i) => (
            <p key={i}>{renderRichSummary(l)}</p>
          ))}
        </div>
      ) : (
        <p className="v2-empty">오늘의 브리핑을 준비하고 있습니다.</p>
      )}
    </Module>
  );
}

"use client";

/**
 * shadcn/ui Progress(Base UI 바탕, 2026-09 레지스트리 rhea)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의 `cn-progress-*`.
 *
 * 원본과 다른 점.
 * - 뿌리가 트랙·막대를 스스로 그리지 않고 조각으로 둔다(ProgressTrack · ProgressIndicator). 배당 '목표까지' 막대처럼
 *   이미 다듬어 둔 모양(`.dv-goal-bar` · 다크 보정)이 있는 곳은 그 클래스를 넘기고, 넘기면 rhea 기본 모양은 안 붙는다.
 * - 클래스 합치기는 `cx`(lib/cx.ts).
 *
 * 동작은 Base UI 가 맡는다: 뿌리가 `role="progressbar"` + aria-valuenow/min/max 로 읽히고, 막대 폭을 값(%)으로 그린다.
 */
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cx } from "@/lib/cx";

type WithClass<P> = Omit<P, "className"> & { className?: string };

function Progress({ className, ...props }: WithClass<ProgressPrimitive.Root.Props>) {
  return <ProgressPrimitive.Root data-slot="progress" className={className} {...props} />;
}

function ProgressTrack({ className, ...props }: WithClass<ProgressPrimitive.Track.Props>) {
  return <ProgressPrimitive.Track data-slot="progress-track" className={className ?? cx("cn-progress-track relative flex w-full items-center overflow-x-hidden")} {...props} />;
}

function ProgressIndicator({ className, ...props }: WithClass<ProgressPrimitive.Indicator.Props>) {
  return <ProgressPrimitive.Indicator data-slot="progress-indicator" className={className ?? "cn-progress-indicator h-full"} {...props} />;
}

export { Progress, ProgressTrack, ProgressIndicator };

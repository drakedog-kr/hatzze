"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { pickNextUpSlot } from "@/lib/next-up-slot";
import { Icon, MONO } from "../ui";
import type { SpotlightData } from "./spotlight-data";

/**
 * 시장 브리핑 히어로 바닥 '오늘 눈에 띄는 것' 줄. 모양은 국장 카더라 히어로 바닥과 같다
 * (.hz-tx-spot · .hz-tx-chip, app/styles/tx.css). 재료는 app/home/spotlight-data.ts.
 *
 * 클라이언트인 까닭은 첫 칩 하나다 — 평일 06:30~10:00 간밤 미장, 그 밖엔 카더라 급부상으로 **보는
 * 시각에** 따라 바뀐다. 홈은 사본으로 나가서 서버가 고른 칩이 한 시간 가까이 묵을 수 있다. 카더라
 * TimeAgo 와 같은 수로, 서버가 고른 칸(`initial`)을 먼저 그려 하이드레이션을 맞추고 브라우저가 제
 * 시계로 다시 고른다.
 */
export function HeroSpotlights({ data }: { data: SpotlightData }) {
  const slot = useSyncExternalStore(
    subscribeMinute,
    () => pickNextUpSlot(Date.now(), data.clock),
    () => data.initial,
  );
  const first = data.timed[slot];
  const chips = first ? [first, ...data.fixed] : data.fixed;
  if (chips.length === 0) return null;
  return (
    <div className="hz-tx-note hz-tx-spot">
      <span className="hz-tx-spot-cap">오늘 눈에 띄는 것</span>
      {chips.map((c) => (
        <Link key={c.ga} href={c.href} className="hz-tx-chip" data-ga="cta_click" data-ga-cta={c.ga} data-ga-surface="home_hero">
          <span className="hz-tx-chip-cap">{c.cap}</span>
          <b>{c.name}</b>
          <span style={{ fontFamily: MONO, fontWeight: 800, color: c.ink }}>{c.val}</span>
          {/* 카더라와 같은 '가기' 표시. ↓ 는 끝 숫자에 붙어 '값이 내렸다'로 읽혀서 안 쓴다(카더라 주석). */}
          <Icon name="chevron_right" />
        </Link>
      ))}
    </div>
  );
}

function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
}

"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { YearStat } from "@/lib/mdd";
import { C, Icon } from "../ui";

/**
 * '10년 전체' — 막대에 안 깔린 해까지 조회 기간 전체를 펼친다.
 *
 * shadcn Popover(Base UI)다(2026-09-26) — 마우스를 올리거나 누르면 열리고 Esc·바깥 누르기로 닫힌다. 단추에
 * aria-expanded 가 붙어 화면 낭독기가 '펼침/접힘'을 읽는다. 예전엔 CSS 뿐이라(:hover · :focus-within) Esc 로 안 닫혔고,
 * 버튼을 눌러도 포커스를 안 주는 브라우저(아이폰 사파리)에선 여닫기가 :hover 흉내에 기댔다. 모양은 badges.css 의 .hz-yrpop.
 *
 * 예전엔 아이콘(open_in_full)만 있었다. 머리 줄에 글자를 얹을 자리가 없어서였는데, 바닥 요약
 * 줄이 빠지면서 자리가 생겼다 — 무엇을 여는지 글자로 적는다(토스 Predictable hint).
 *
 * RiskProfile 이 따로 받아 온다(next/dynamic) — 이 시트는 조회 결과가 온 뒤에야 서니, 판(Base UI Popover · 위치 잡기)을
 * MDD 화면 첫 로드에 싣지 않는다. 받는 동안은 같은 글자·모양의 멈춘 단추(RiskProfile.tsx 의 YearsPopover)가 선다.
 */
export function YearsPopover({ years, label }: { years: YearStat[]; label: string }) {
  const max = Math.max(...years.flatMap((y) => [Math.abs(y.ret), Math.abs(y.mdd)]), 1);
  return (
    <span className="hz-yrpop-host">
      <Popover>
        {/* 올리자마자 연다(예전 :hover 와 같다). 단추와 판은 4px 겹쳐 건너는 동안 안 닫힌다. */}
        <PopoverTrigger openOnHover delay={0} closeDelay={80} className="hz-yrpop-btn" aria-label={`${label} 연도별 성적 보기`}>
          {label} 전체
          <Icon name="chevron_right" style={{ fontSize: "var(--fs-15)" }} />
        </PopoverTrigger>
        {/* 아래로, 오른쪽 끝을 단추에 맞춰 편다. 아래가 모자라면 위로만 뒤집는다 — 옆으로 비켜 열리면 타일 막대를 가린다
            (위아래 모두 몇 px 모자란 자리에서 Floating UI 기본값은 오른쪽을 골랐다). 그래도 모자라면 높이가 줄고 판 안에서 스크롤. */}
        <PopoverContent
          side="bottom"
          align="end"
          // 오른쪽 끝을 단추 글자 칸(host)에 맞춘다 — 단추가 margin-right -4 로 밖에 나와 있어 단추 끝에 맞추면 4px 오른쪽에 선다(예전 판과 같게).
          alignOffset={4}
          sideOffset={-4}
          collisionAvoidance={{ side: "flip", align: "flip", fallbackAxisSide: "none" }}
          collisionPadding={8}
          className="hz-yrpop"
          aria-label={`${label} 연도별 성적`}
        >
          <span className="hz-yrpop-head">{label} 연도별 성적</span>
          {/* 오래된 해가 위, 올해가 맨 아래. 타일 막대와 같은 순서다. 한 해의 두 줄도 타일과 같은
              순서로 **낙폭이 먼저, 수익이 두 번째**다(2026-08-04 에 바로잡음). */}
          {years.map((y) => (
            <span key={y.year} className="hz-yrpop-row">
              <span className="hz-yrpop-year">{y.year}</span>
              <span className="hz-yrpop-bars">
                <span className="hz-yrpop-bar" style={{ width: `${Math.max(2, (Math.abs(y.mdd) / max) * 100)}%`, background: C.cold, opacity: 0.45 }} />
                <span className="hz-yrpop-bar" style={{ width: `${Math.max(2, (Math.abs(y.ret) / max) * 100)}%`, background: y.ret >= 0 ? C.mania : C.cold }} />
              </span>
              <span className="hz-yrpop-val">
                <span style={{ color: C.cold, opacity: 0.75 }}>{`${Math.round(y.mdd)}%`}</span>
                <span style={{ color: y.ret >= 0 ? C.mania : C.cold }}>{`${y.ret >= 0 ? "+" : "−"}${Math.abs(Math.round(y.ret))}%`}</span>
              </span>
            </span>
          ))}
        </PopoverContent>
      </Popover>
    </span>
  );
}

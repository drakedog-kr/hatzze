"use client";

import { Fragment, useState } from "react";

import { track } from "@/lib/ga";
import { C } from "../ui";
import { SectionHead } from "./SectionHead";

/**
 * 트렌딩 메시지의 기간 탭(오늘 / 최근 7일 / 최근 30일).
 *
 * 탭은 카드 머리 우측에 붙고 목록은 그 아래라, 둘을 한 컴포넌트가 감싸야 상태를
 * 공유할 수 있다. 그래서 SectionHead 까지 여기서 그린다(그래서 SectionHead 를
 * page.tsx 밖 별도 파일로 뺐다).
 *
 * ExpandableList 와 같은 원칙 — 조회와 목록 마크업은 서버 컴포넌트에 남기고,
 * 여기서는 어느 패널을 보여줄지만 관리한다. 세 창을 서버가 미리 렌더해 넘기므로
 * 탭을 눌러도 왕복이 없다.
 *
 * 패널에 key(기간)를 주는 게 중요하다 — 없으면 React 가 같은 자리의 같은
 * ExpandableList 를 재사용해 '더 보기'로 펼친 개수가 다음 탭으로 넘어간다
 * (30일에서 26개까지 펼친 뒤 오늘로 오면 8개가 전부 펼쳐진 채 '접기'가 뜬다).
 * key 를 주면 기간이 바뀔 때 새로 마운트되어 처음 6개부터 다시 보인다.
 */
export type TrendingPanel = {
  key: string;
  label: string;
  /** 0건이면 목록 대신 안내 문구를 보여주기 위한 값(탭에 숫자로 노출하진 않는다). */
  count: number;
  node: React.ReactNode;
};

export function TrendingTabs({
  icon,
  title,
  desc,
  panels,
}: {
  icon: string;
  title: string;
  desc?: string;
  panels: TrendingPanel[];
}) {
  const [active, setActive] = useState(panels[0]?.key);
  const current = panels.find((p) => p.key === active) ?? panels[0];

  // 낱개 알약 3개 대신 하나의 세그먼티드 컨트롤로 묶는다 — 셋이 한 축의 눈금이라는 게
  // 테두리 하나로 드러나고, 고른 칸만 카드색으로 떠올라 상태가 분명하다(MDD 정밀분석의
  // 기간 토글과 같은 문법). 예전엔 선택 배경을 `${C.blue}14` 로 줬는데 var() 에 알파를
  // 이어붙인 꼴이라 CSS 가 버려서, 실제로는 배경 없이 테두리 색만 바뀌고 있었다.
  // 2026-08 콘솔 리디자인: 알약(999)에서 **둥근 사각 세그먼트**(8/6)로 바꿨다. 시트
  // 머리에 앉는 조작부라, 시트 자체가 radius 14 인 판이면 그 안의 컨트롤도 같은 계열의
  // 모서리를 써야 한 벌로 읽힌다.
  //
  // ⚠️ 판은 **카드색 + 헤어라인**이다. 회색 칩(--c-chip)이었을 땐 타이틀 칸
  // (--c-title-band #eef3f9)과 네 단위 차이라 컨트롤 자체가 띠에 녹아 보였다.
  // 카드색이면 라이트에선 더 밝고 다크에선 더 어두워 양쪽에서 저절로 갈린다.
  // 판이 카드색이 된 만큼 **고른 칸은 흰색으로 못 띄운다** — 그 자리는 하늘색 틴트가
  // 맡는다(레포가 '지금 이것'을 가리킬 때 쓰는 그 색).
  const tabs = (
    <div style={{ display: "flex", gap: 2, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 2 }}>
      {panels.map((p) => {
        const on = p.key === current?.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              // title 을 같이 보낸다 — 이 컴포넌트는 트렌딩 말고 다른 카드도 쓸 수 있어서,
              // tab 값(today/7d/30d)만으로는 어느 카드의 탭인지 구분이 안 된다.
              track("kadera_tab_select", { tab: p.key, card: title });
              setActive(p.key);
            }}
            aria-pressed={on}
            style={{
              padding: "5px 11px",
              borderRadius: 6,
              border: "none",
              background: on ? "var(--c-blue-tint)" : "transparent",
              color: on ? "var(--c-cold-ink)" : C.sub,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background .15s, color .15s",
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <SectionHead level={2} icon={icon} title={title} desc={desc} right={tabs} />
      {current?.count === 0 ? (
        // 시트 안이라 여백은 셀과 같은 자리에서 낸다(머리가 자기 padding 을 갖고 있어
        // 문단이 시트 왼쪽 끝에 붙어 버린다).
        <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 12.5 }}>
          {current.label} 기준으로는 아직 화제 메시지가 없습니다.
        </p>
      ) : (
        <Fragment key={current?.key}>{current?.node}</Fragment>
      )}
    </>
  );
}

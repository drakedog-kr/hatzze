import type { Metadata } from "next";

import { getSeohakDaily } from "@/lib/seohak-daily";
import { getSeohakOverview } from "@/lib/seohak-data";
import { getSeohakCalendar } from "@/lib/seohak-calendar";
import { getSeohakEtf } from "@/lib/seohak-etf";
import { getHouseholdAssets, getUsdKrw } from "@/lib/seohak-external";
import { DailySection } from "./DailyCards";
import { CalendarHero } from "./CalendarHero";
import { EtfSection } from "./EtfCards";
import { TradingCards } from "./TradingCards";
import { WealthCards } from "./WealthCards";
import { SectionCaps } from "../kadera/parts";
import { pageMetadata } from "../seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "서학개미 해부도 | hatzze",
    description:
      "개인이 미국 주식에 넣은 돈은 얼마이고, 언제 넣었고, 지금 얼마가 됐는지. 예탁결제원 결제와 미 재무부 통계로 되짚습니다.",
    path: "/seohak",
  });
}

export const dynamic = "force-dynamic";

export default async function SeohakPage() {
  const ov = await getSeohakOverview();
  // 아래 셋은 서로 의존이 없다. 순서대로 await 하면 왕복이 앞뒤로 붙으므로 함께 띄운다.
  // ⚠️ 분기·ETF 두 층은 표가 아직 없을 수 있어 null 을 돌려준다(마이그레이션 043·042).
  // 그 경우 그 섹션만 접고 나머지는 그대로 뜬다.
  const [daily, etf, calendar, fx, household] = await Promise.all([
    getSeohakDaily(),
    getSeohakEtf(),
    getSeohakCalendar(),
    // ⚠️ 바깥 원천 둘. 실패하면 null 이라 그 카드만 접힌다(lib/seohak-external.ts 머리말).
    getUsdKrw(),
    getHouseholdAssets(),
  ]);
  return (
    // hz-cards 를 쓰지 않는다. 그건 브리핑의 4열 셀 격자라 자식마다 min-height 274px 가
    // 걸려 있어서, 짧은 시트 아래에 200px 짜리 빈 바닥이 생긴다(실측). 카더라와 같은
    // 맨 세로 흐름으로 둔다.
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── ② 오늘 · 일별 층 ──────────────────────────────────────────
          예탁원 결제 통계 하나에서 나오는 일곱 장. 브리핑과 같은 4열 셀 격자(.hz-cards)를
          써서 "카드 하나가 한 행을 통째로 먹는" 모양을 피한다 — 칸 합이 12라 3줄이 찬다.
          ⚠️ 이 격자는 아래 2열 래퍼 **바깥**에 있어야 한다. 안에 넣으면 380px 한 칸에
          갇혀 4열이 1열로 접힌다(실제로 그렇게 깨졌다). */}
      {/* 히어로 = 달력. 이 화면에서 가장 눈에 붙는 그림이고, 나머지 층이 그 아래에서
          '왜 그런가'를 답한다. */}
      {calendar && <CalendarHero c={calendar} />}

      {/* ── 구간 나누기 ───────────────────────────────────────────────
          카더라·브리핑·MDD 가 쓰는 것과 같은 머리 배지(SectionCaps)로 장을 가른다.
          히어로(달력)는 어느 장에도 안 넣는다 — 카더라도 히어로를 첫 배지 위에 둔다.

          기준은 **갱신 주기가 아니라 질문**이다. 주기로 나누면 "매일/매월/분기"가
          되는데, 그건 우리 파이프라인 사정이지 읽는 사람의 관심이 아니다. */}
      {/* ── 구간 나누기 ───────────────────────────────────────────────
          카더라·브리핑·MDD 가 쓰는 것과 같은 머리 배지(SectionCaps)로 장을 가른다.
          히어로(달력)는 어느 장에도 안 넣는다 — 카더라도 히어로를 첫 배지 위에 둔다.

          ## ⭐ 기준은 **갱신 주기가 아니라 질문**이다

          주기로 나누면 "매일/매월/분기"가 되는데 그건 우리 파이프라인 사정이지 읽는
          사람의 관심이 아니다. 카드를 여럿 빼고 나서 기능으로 다시 묶었다.

            어떻게 사고파나   행동  — 얼마나 사고파나 · 얼마나 자주 갈아타나
            얼마나 큰 돈인가  규모  — 원화로 얼마 · 가계 자산에서 어느 자리
            국내 상장 ETF     딴 길 — 미국에 직접 상장된 건 안 들어오는 그릇

          순서도 뜻이다. 히어로가 '어제 얼마나 샀나'로 시작하므로 행동이 바로 뒤에
          붙고, 거기서 규모로 줌아웃한 다음, 곁길인 ETF 가 마지막이다.

          ⚠️ 배지의 숫자는 **손으로 적지 않는다.** 카드를 빼면서 실제 장수와 어긋난 적이
          있다(3 이라 적혀 있는데 두 장이었다). 있는 자료로 세게 둔다. */}
      <SectionCaps label="어떻게 사고파나" count={1 + (ov.channel?.turnover ? 1 : 0)} />
      <DailySection d={daily} />
      {/* 예탁원 채널이라 위 카드와 모집단이 같다. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 14 }}>
        <TradingCards ch={ov.channel} />
      </div>

      {/* 원화·가계 두 장. 앞의 것은 예탁원 채널, 뒤의 것은 자금순환표 가계 부문이라
          **모집단이 다르다** — 두 카드의 숫자를 더하거나 나누면 안 된다(각주가 밝힌다).
          ⭐ 그래도 한 묶음인 이유는 둘 다 **규모**를 묻기 때문이다. 하나는 "원화로 얼마",
          하나는 "가계 자산에서 어느 자리". */}
      <SectionCaps label="얼마나 큰 돈인가" count={(fx ? 1 : 0) + (household ? 1 : 0)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
        <WealthCards ch={ov.channel} fx={fx} household={household} />
      </div>

      {/* ⭐ '무엇에 담았나'였다. 남은 둘이 전부 **국내 상장 ETF** 이야기라 이름을 그렇게
          바꿨다. 미국에 직접 상장된 QQQ 같은 건 안 들어오는 딴 그릇이라, 이름으로 그
          경계를 밝힌다. 이 묶음만 질문이 아니라 이름인 까닭이 그것이다 — 여기서 가릴
          것은 '무엇을 묻나'가 아니라 '어느 그릇인가'다. */}
      <SectionCaps label="국내 상장 ETF" count={etf ? 2 : 0} />
      {etf && <EtfSection e={etf} />}

      {/* ⛔ 여기서 뺀 카드들과 그 까닭
          · 개인과 기관     — "개인이 전체의 몇 %인가". 사실이지만 읽는 개인의 판단을
                             바꾸지 않고, 절반이 신고자 목록이라 기관 이야기였다.
                             '이 화면의 개인이 무엇인가'만 화면 부제로 옮겼다.
          · 종류별 구성     — 미 재무부 SHL 은 부문을 안 나눠 **전 국민** 값이다. 그 잔고의
                             76%가 기관이라, 사실상 기관 포트폴리오를 그려 놓고 있었다.
          · 시작 연도별 성과 — 연도별 % 가 통째로 시장 지수에서 나온다(예탁원이 바꾸는 건
                             금액뿐). 게다가 "2015년에 넣었으면" 은 지금을 안 말한다.
          · 미국 채권도 산다 — 핵심이 2023년이라 절반이 과거. 지금 상태로는 한 줄이다.
          ⚠️ 표·로더·파이프라인은 전부 남겨 뒀다. 되살릴 길이 생기면 그때. */}
    </div>
  );
}

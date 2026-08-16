import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 해마다 **쌓았나 뺐나**.
 *
 * ## 왜 연도별이어야 하나
 *
 * "1년간 산 것 $342B, 순매수 $34B" 는 정지된 숫자라 한 번 보면 끝이고 알고 나서 할
 * 게 없다("무슨 쓸모냐"는 물음을 받았다). 같은 값도 **여러 해를 나란히 놓으면**
 * 국면이 된다 — 지금이 쌓는 해인가 빼는 해인가.
 *
 * 실측(예탁원 결제, 미국·주식):
 *
 *   2020  +18.1%   2021  +10.6%   2022  +8.2%
 *   2023  **−2.1%**   2024  +4.1%   2025  +9.8%
 *
 * ⭐ **2023년은 순매도였다.** 나스닥이 43% 오른 해에 판 것이 더 많았다. 정지된
 * 숫자로는 절대 안 보이는 사실이다.
 *
 * ⚠️ 2019년 이전은 안 쓴다. 2019년 매수가 $16.5B, 2016년은 $3.7B 라 비율이 표본
 * 몇 건에 휘둘린다(2016년 0.6%, 2017년 22.1%). 서학개미가 규모를 갖춘 뒤부터 본다.
 */

/** 이 해부터 그린다. 그 앞은 표본이 얇아 비율이 잡음이다. */
const FROM_YEAR = 2019;

export type SeohakYear = {
  year: number;
  buy: number;
  sell: number;
  net: number;
  /** 순매수 ÷ 산 것(%). 음수면 그해엔 판 것이 더 많았다. */
  netPct: number;
  tradingDays: number;
  /** 아직 안 끝난 해. 화면이 옅게 그리고 각주로 밝힌다. */
  partial: boolean;
};

export async function getSeohakYearly(): Promise<SeohakYear[] | null> {
  const { data, error } = await getSupabaseServer()
    .from("seohak_settlement_yearly")
    .select("year, us_buy_amount, us_sell_amount, trading_days")
    .gte("year", FROM_YEAR)
    .order("year", { ascending: true });
  if (error || !data?.length) return null;

  const rows = data
    .map((r) => {
      const buy = Number(r.us_buy_amount ?? 0);
      const sell = Number(r.us_sell_amount ?? 0);
      const days = Number(r.trading_days ?? 0);
      return {
        year: Number(r.year),
        buy,
        sell,
        net: buy - sell,
        netPct: buy ? ((buy - sell) / buy) * 100 : 0,
        tradingDays: days,
        // 한 해가 240거래일 안팎이다. 그보다 한참 적으면 아직 진행 중인 해다.
        partial: days > 0 && days < 200,
      };
    })
    .filter((r) => r.buy > 0);

  return rows.length ? rows : null;
}

import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import {
  getChannelRanking,
  getEcosystemSentiment,
  getIssueKeywords,
  getRisingChannels,
  getStockNarratives,
  getStockReport,
  getSurgingStocks,
  getTelegramSummary,
  getThemeRotation,
  getTopStocksWithTrend,
  getTrendingMessages,
} from "@/lib/telegram-data";

/**
 * ⚠️ 임시 계측 라우트. 측정이 끝나면 **삭제한다**.
 *
 * /kadera 의 서버 시간이 어디서 나오는지 프로덕션 리전(icn1)에서 재려고 둔다. 로컬로는
 * 두 번 틀렸다 — icn1↔Supabase 는 같은 리전이라 왕복이 싸고, 내 회선에서 재면 그게
 * 곱해져 없는 병목이 보인다. 그래서 반드시 배포해서 잰다.
 *
 * page.tsx 와 **같은 병렬 구조**로 부른다(전부 Promise.all, 종목 리포트만
 * getTopStocksWithTrend 에 이어 붙음). TTFB 는 합계가 아니라 가장 느린 가지라,
 * 구조를 바꿔 재면 답이 달라진다.
 */

export const dynamic = "force-dynamic";

function gate(req: NextRequest): boolean {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return false;
  const want = Buffer.from(createHmac("sha256", key).update("perf-kadera").digest("hex").slice(0, 16));
  const got = Buffer.from(req.nextUrl.searchParams.get("k") ?? "");
  return want.length === got.length && timingSafeEqual(want, got);
}

type Call = { host: string; ms: number };

export async function GET(req: NextRequest) {
  if (!gate(req)) return new Response(null, { status: 404 });

  const calls: Call[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const t0 = performance.now();
    try {
      return await orig(...args);
    } finally {
      const raw = typeof args[0] === "string" ? args[0] : ((args[0] as Request).url ?? String(args[0]));
      let host = "?";
      try {
        host = new URL(raw).host;
      } catch {}
      calls.push({ host, ms: performance.now() - t0 });
    }
  }) as typeof fetch;

  const marks: { name: string; ms: number }[] = [];
  const t = async <T,>(name: string, p: Promise<T>): Promise<T> => {
    const t0 = performance.now();
    const v = await p;
    marks.push({ name, ms: Math.round(performance.now() - t0) });
    return v;
  };

  const wall = performance.now();
  try {
    const topStocksPromise = getTopStocksWithTrend(3);
    const reportsPromise = t(
      "getTopStocksWithTrend+getStockReport x3",
      topStocksPromise.then((tops) => Promise.all(tops.map((s) => getStockReport(s.code)))),
    );
    await Promise.all([
      t("getTelegramSummary", getTelegramSummary()),
      t("getSurgingStocks", getSurgingStocks(5)),
      t("getTrendingMessages(today)", getTrendingMessages("today", 36)),
      t("getTrendingMessages(7)", getTrendingMessages(7, 36)),
      t("getTrendingMessages(30)", getTrendingMessages(30, 36)),
      t("getChannelRanking", getChannelRanking()),
      t("getRisingChannels", getRisingChannels(10)),
      t("getThemeRotation", getThemeRotation(10)),
      reportsPromise,
      t("getEcosystemSentiment", getEcosystemSentiment()),
      t("getIssueKeywords", getIssueKeywords(10)),
      t("getStockNarratives", getStockNarratives()),
    ]);
  } finally {
    globalThis.fetch = orig;
  }

  const byHost: Record<string, { n: number; total: number; max: number }> = {};
  for (const c of calls) {
    const b = (byHost[c.host] ??= { n: 0, total: 0, max: 0 });
    b.n += 1;
    b.total += c.ms;
    b.max = Math.max(b.max, c.ms);
  }

  return Response.json(
    {
      wallMs: Math.round(performance.now() - wall),
      slowestFirst: marks.sort((a, b) => b.ms - a.ms),
      fetchByHost: Object.fromEntries(
        Object.entries(byHost)
          .map(([h, b]) => [h, { n: b.n, totalMs: Math.round(b.total), maxMs: Math.round(b.max) }])
          .sort((a, b) => (b[1] as { totalMs: number }).totalMs - (a[1] as { totalMs: number }).totalMs),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

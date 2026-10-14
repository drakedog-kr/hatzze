import { shortDate } from "@/lib/format";
import { fmtKoDate } from "@/lib/stock-page";

/**
 * ETF 상세의 날짜 — 1년 기간이 해를 넘어 '10/1'만 적으면 작년 10월인지 이번 달인지 갈리지 않았다(2026-10-12 · 1년 최저가 작년 10/1).
 * 기준일보다 앞 해면 앞에 '작년'을 붙인다(기간이 1년 남짓이라 두 해 전은 없다). 짧은 꼴(10/1)과 긴 꼴(10월 1일) 둘.
 */
const lastYear = (iso: string, asOf: string) => iso.slice(0, 4) < asOf.slice(0, 4);
export const dayShort = (iso: string, asOf: string) => `${lastYear(iso, asOf) ? "작년 " : ""}${shortDate(iso)}`;
export const dayLong = (iso: string, asOf: string) => `${lastYear(iso, asOf) ? "작년 " : ""}${fmtKoDate(iso)}`;

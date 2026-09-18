// 담은 종목의 브라우저 저장소(localStorage + useSyncExternalStore). 2026-09-17 에 DividendCalculator.tsx(2,054줄)에서
// 그대로 옮겨 왔다. 동작은 안 바뀐다(본문 줄을 다중집합으로 대조했다).

import { isAccount } from "./tax";
import type { Account } from "./tax";

/** off 는 줄을 계산에서 뺀 것 — 종목·주수·평단은 그대로 두고 합계·달력·일정·목표에서만 빠진다("이걸 빼면 얼마지"를
    ×로 빼고 다시 담지 않고 보게, 2026-09-18 피드백). 없거나 false 면 센다. */
export type Holding = { id: string; code: string; shares: number; cost?: number; account?: Account; off?: boolean };

/** 이 코드의 새 줄 열쇠 — 아직 없으면 코드 그대로, 있으면 #2·#3. */
export function newId(code: string, prev: Holding[]): string {
  const used = new Set(prev.map((h) => h.id));
  if (!used.has(code)) return code;
  for (let n = 2; ; n++) if (!used.has(`${code}#${n}`)) return `${code}#${n}`;
}

/* ── 담은 종목 저장소 ─────────────────────────────────────────────────
   localStorage 는 React 바깥의 저장소라 useSyncExternalStore 로 읽는다(AppShell 의 PcHint ·
   insider/TapHint 와 같은 이유 — useEffect 안에서 setState 를 부르면 eslint
   react-hooks/set-state-in-effect 에 걸린다). 서버 스냅숏은 빈 목록이라 첫 HTML 은 빈
   채로 그려지고, 구독 직후 한 번 저장값을 읽어 다시 그린다(하이드레이션이 어긋나지 않는다).

   ⚠️ getSnapshot 은 같은 배열 참조를 돌려줘야 한다. 부를 때마다 새 배열을 만들면 React 가
      매 렌더 "바뀌었다"고 보고 무한 렌더에 빠진다. */

const STORAGE_KEY = "hz-dividend-holdings";

const NO_HOLDINGS: Holding[] = [];
let current: Holding[] = NO_HOLDINGS;
let loaded = false;

const listeners = new Set<() => void>();

function readSaved(): Holding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return NO_HOLDINGS;
    const out: Holding[] = [];
    for (const h of parsed as { id?: unknown; code?: unknown; shares?: unknown; cost?: unknown; account?: unknown; off?: unknown }[]) {
      if (!h || typeof h.code !== "string" || typeof h.shares !== "number") continue;
      // 저장된 id 가 없거나(옛 값) 겹치면 새로 붙인다.
      const id = typeof h.id === "string" && h.id && !out.some((o) => o.id === h.id) ? h.id : newId(h.code, out);
      out.push({
        id,
        code: h.code,
        shares: Math.max(0, Math.round(h.shares * 1e6) / 1e6),  // 소수점 주식(미국)은 소수 여섯 자리까지
        ...(typeof h.cost === "number" && h.cost > 0 ? { cost: h.cost } : {}),
        ...(isAccount(h.account) ? { account: h.account } : {}),
        ...(h.off === true ? { off: true } : {}),
      });
    }
    return out.length ? out : NO_HOLDINGS;
  } catch {
    // 사파리 사생활 보호 모드 등에서 localStorage 접근이 던진다. 그때는 빈 채로 시작한다.
    return NO_HOLDINGS;
  }
}

export const holdingsStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    // 구독 직후 한 번 저장값을 읽어 알린다. 마운트 때 반드시 불리므로 매 로드에서 한 번은 읽는다.
    const t = setTimeout(() => {
      if (!loaded) {
        loaded = true;
        current = readSaved();
      }
      cb();
    }, 0);
    return () => {
      clearTimeout(t);
      listeners.delete(cb);
    };
  },
  getSnapshot: () => current,
  getServerSnapshot: () => NO_HOLDINGS,
};

export function writeHoldings(next: Holding[] | ((prev: Holding[]) => Holding[])) {
  // ⚠️ 저장값을 아직 안 읽었으면 먼저 읽는다 — 마운트 직후(`?add=` 처리)에 쓰면 빈 목록 위에 덮어써서
  //    담아 둔 종목이 통째로 사라졌다(2026-09-14 실측). 구독의 setTimeout 보다 effect 가 먼저 돈다.
  if (!loaded) {
    loaded = true;
    current = readSaved();
  }
  current = typeof next === "function" ? next(current) : next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* 저장이 막힌 브라우저에서는 이번 방문 안에서만 산다 */
  }
  listeners.forEach((l) => l());
}

/* ── 세금 ─────────────────────────────────────────────────────────────
   어느 계좌에 담느냐로 세금이 갈린다. 다섯 가지 — 세전 · 일반 계좌 · ISA · 연금저축 · IRP.
   계좌마다 담을 수 있는 것이 다르다: ISA 는 국내 상장 주식·ETF 만(해외 주식 직접 보유 불가),
   연금저축·IRP 는 국내 상장 ETF 만(개별 주식 불가). 못 담는 줄은 일반 계좌 세율로 세고 줄에 그렇게 적는다.
   IRP 는 세금은 연금저축과 같고 위험자산 70% 한도가 더 있다(2026-09 현재 유효 · 폐지 논의 중) — 안전자산
   30% 를 못 채우면 히어로 아래 한 줄로 적는다. 2026-09 기준 수치 — 바뀌면 여기와 아래 안내문을 같이 고칠 것. */

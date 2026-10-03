import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/**
 * 전체보기(`/insider/list/[kind]`)의 자리표시자.
 *
 * ⛔ **부모(`app/insider/loading.tsx`)를 물려받으면 안 된다.** Next 는 가장 가까운
 *    경계를 쓰므로 이 파일이 없으면 전체보기를 눌러도 **짝 모듈 줄 셋**이 뜬다. 이 화면은
 *    판 폭 목록이 한두 장이라, 결과가 오는 순간 판이 통째로 다른 모양이었다가 제자리를 찾는
 *    것처럼 보인다(카더라 국장↔미장에서 같은 일이 있었다).
 *    v2(2026-10-03) — 되돌아가는 줄 · 첫 줄 띠 · 목록 모듈. 범위(v2-kd v2-in)도 실물과 같다.
 *
 * ⚠️ 부모 경계가 먼저 흐른다. HTML 안 등장 순서가 **부모 스켈레톤 → 이 스켈레톤 →
 *    본문**이라, 전체보기를 열면 부모 골격이 한 번 스쳤다가 이 골격으로 바뀐다.
 *    카더라도 국장→미장이 같은 구조이고, 레포는 "형태가 틀린 채 오래 서 있는 것보다
 *    한 번 더 바뀌더라도 제 모양으로 끝나는 편이 낫다"고 판단해 두었다. 그 판단을 따른다.
 *
 * ⚠️ 목록 모듈을 **둘** 그린다. 여덟 갈래 중 임원·의원이 두 장(산 것/판 것)이고 나머지는
 *    한 장인데, 한 장짜리에서 남는 한 장이 사라지는 편이 두 장짜리에서 없던 장이
 *    솟는 것보다 덜 튄다. 이 화면은 1.10초로 여덟 라우트 중 가장 느려서 눈에 띈다.
 */

function Block({ h, w = "100%", r = 4 }: { h: number; w?: number | string; r?: number }) {
  return <Skeleton style={{ height: h, width: w, borderRadius: r }} />;
}

/** v2 목록 모듈 — 머리 띠(제목 자리) + 긴 목록 자리. */
function ListMod() {
  return (
    <section className="v2-mod">
      <header className="v2-mod-head">
        <Block h={14} w={140} />
      </header>
      <div style={{ padding: "12px 14px 14px" }}>
        <Block h={360} />
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <div className="hz-tx v2-kd v2-in" style={{ position: "relative" }} aria-hidden>
      {/* 되돌아가는 줄(내부자 리포트 › 목록 이름). */}
      <Block h={16} w={180} />
      <div className="v2-cover" style={{ height: 41 }} />
      <ListMod />
      <ListMod />

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <Spinner />
          목록을 불러오는 중
        </span>
      </div>

      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        목록을 불러오는 중입니다.
      </span>
    </div>
  );
}

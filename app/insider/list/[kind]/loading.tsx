import { C } from "../../../ui";

/**
 * 전체보기(`/insider/list/[kind]`)의 자리표시자.
 *
 * ⛔ **부모(`app/insider/loading.tsx`)를 물려받으면 안 된다.** Next 는 가장 가까운
 *    경계를 쓰므로 이 파일이 없으면 전체보기를 눌러도 **히어로 세 칸 + 시트 여덟 장**
 *    이 뜬다. 이 화면은 히어로가 없고 시트가 한두 장이라, 결과가 오는 순간 판이 통째로
 *    다른 모양이었다가 제자리를 찾는 것처럼 보인다(카더라 국장↔미장에서 같은 일이 있었다).
 *
 * ⚠️ 부모 경계가 먼저 흐른다. HTML 안 등장 순서가 **부모 스켈레톤 → 이 스켈레톤 →
 *    본문**이라, 전체보기를 열면 히어로 골격이 한 번 스쳤다가 이 골격으로 바뀐다.
 *    카더라도 국장→미장이 같은 구조이고, 레포는 "형태가 틀린 채 오래 서 있는 것보다
 *    한 번 더 바뀌더라도 제 모양으로 끝나는 편이 낫다"고 판단해 두었다. 그 판단을 따른다.
 *
 * ⚠️ 시트를 **둘** 그린다. 여덟 갈래 중 임원·의원이 두 장(산 것/판 것)이고 나머지는
 *    한 장인데, 한 장짜리에서 남는 한 장이 사라지는 편이 두 장짜리에서 없던 장이
 *    솟는 것보다 덜 튄다. 이 화면은 1.10초로 여덟 라우트 중 가장 느려서 눈에 띈다.
 */

function Block({ h, w = "100%", r = 8 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, maxWidth: "100%", borderRadius: r, background: C.bg }} />;
}

function Sheet() {
  return (
    <section className="hz-sheet">
      {/* 머리는 SectionHead 와 같은 골격이다(아이콘 + 글 칸 + 오른쪽 알약). */}
      <div className="hz-sheet-head">
        <Block h={18} w={18} r={5} />
        <div className="hz-sheet-head-txt">
          <Block h={14} w={132} r={5} />
          <Block h={12} w={232} r={5} />
        </div>
        <Block h={20} w={128} r={999} />
      </div>
      {/* 열 머리 한 줄 + 데이터 열 줄. */}
      <div style={{ padding: "10px 22px" }}>
        <Block h={12} w={"60%"} r={5} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "6px 22px 20px" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <Block key={i} h={26} r={6} />
        ))}
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16 }} aria-hidden>
      {/* 제목 + 부제 + 되돌아가는 링크. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Block h={24} w={228} r={6} />
        <Block h={13} w={320} r={5} />
        <div style={{ marginTop: 6 }}>
          <Block h={13} w={96} r={5} />
        </div>
      </div>

      <Sheet />
      <Sheet />

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
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

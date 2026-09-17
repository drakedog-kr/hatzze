/**
 * 조회가 깨진 자료의 이름을 화면 머리에 적는 한 줄.
 *
 * 데이터 함수들은 조회가 깨져도 빈 값으로 물러난다(lib/load-state.ts 머리말). 그래서 실패가
 * "오늘은 없다"와 같은 얼굴이 되는데, 홈·카더라는 카드마다 "불러오지 못했습니다"를 적어 갈랐고
 * 내부자·배당은 못 갈랐다. 여기는 그 두 화면(과 내부자 상세 둘)이 쓰는 공용 한 줄이다 — 실패한
 * 축 이름을 받아 무엇이 빈 채로 보이는지 말한다. 목록이 비면 아무것도 안 그린다.
 *
 * 서버·클라이언트 어느 쪽에서도 그린다(훅도 상태도 없다). 아이콘은 안 붙인다 — 한 화면에 같은
 * 아이콘이 두 번 서면 안 되는데, 이 줄은 어느 화면에나 들어갈 수 있어 어떤 이름이든 겹칠 수 있다.
 */
export function LoadFailedNote({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;
  const names = [...new Set(sources)].join("·");
  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: "10px 14px",
        borderRadius: 10,
        borderLeft: "3px solid var(--c-hot)",
        background: "var(--c-hot-tint)",
        color: "var(--c-hot-ink)",
        fontSize: "var(--fs-13)",
        lineHeight: 1.6,
        wordBreak: "keep-all",
      }}
    >
      {names} 자료를 불러오지 못했습니다. 그 몫은 빈 채로 보입니다. 잠시 뒤 다시 열어 주십시오.
    </p>
  );
}

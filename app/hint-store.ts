/**
 * "한 번만 보여 주는 안내 쪽지"의 기억 장치. 내부자 리포트의 TapHint 와 테마 지도의 MapHint,
 * 명절 인사 팝업(app/HolidayGreeting.tsx)이 같이 쓴다.
 *
 * localStorage 에 `prefix + id` 로 '봤음'을 적고, useSyncExternalStore 가 읽을 스토어를 id 마다 하나씩
 * 만든다. 왜 이 모양인지(서버는 늘 '감춤', 구독 직후 스스로 한 번 알림, 스토어는 id 당 하나)는
 * app/insider/TapHint.tsx 머리 주석에 실측과 함께 적혀 있다 — 여기로 옮기며 내용은 손대지 않았다.
 *
 * ⚠️ prefix·event 를 바꾸면 이미 닫은 사람에게 다시 뜬다. 문구만 고칠 때는 건드리지 말 것.
 */
export function createHintStore(prefix: string, event: string) {
  type Store = { subscribe(cb: () => void): () => void; getSnapshot(): boolean };
  const stores = new Map<string, Store>();

  function makeStore(key: string): Store {
    return {
      subscribe(cb) {
        // ⭐ 구독 직후 한 번 알린다. 지우면 쪽지가 뜨다 말다 한다(TapHint 머리 주석 '둘').
        const t = setTimeout(cb, 0);
        window.addEventListener(event, cb);
        return () => {
          clearTimeout(t);
          window.removeEventListener(event, cb);
        };
      },
      // 사파리 사생활 보호 모드 등에서 localStorage 접근이 던진다. 그때는 안 띄운다 —
      // 껐다는 걸 기억할 수 없으니 띄우면 올 때마다 다시 뜬다.
      getSnapshot() {
        try {
          return localStorage.getItem(key) === null;
        } catch {
          return false;
        }
      },
    };
  }

  // 스토어는 id 마다 하나씩만 만든다. 매 렌더 새로 만들면 subscribe 가 매번 다시 걸려
  // 무한 루프가 된다(useSyncExternalStore 가 함수 동일성을 본다).
  function storeFor(id: string): Store {
    let st = stores.get(id);
    if (!st) {
      st = makeStore(prefix + id);
      stores.set(id, st);
    }
    return st;
  }

  function markSeen(id: string) {
    try {
      localStorage.setItem(prefix + id, "1");
    } catch {}
    window.dispatchEvent(new Event(event));
  }

  return { storeFor, markSeen };
}

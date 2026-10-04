/**
 * "한 번만 보여 주는 안내 쪽지"의 기억 장치. v2 쪽지(app/V2Hint.tsx)가 쓴다.
 *
 * localStorage 에 `prefix + id` 로 '봤음'을 적고, useSyncExternalStore 가 읽을 스토어를 id 마다 하나씩 만든다.
 * v1 의 내부자 리포트 TapHint · 테마 지도 MapHint 가 쓰던 것을 그대로 되살렸다(v2 에서 한때 걷었다가 2026-10-05 운영자 판단으로 되살림).
 *
 * 이 모양인 이유 — 실측으로 두 번 헛짚었다:
 * ① 서버는 늘 '감춤'이다. localStorage 는 서버가 모르는 값이라 첫 그림은 감춰 두고 클라이언트가 켠다. 그래서 쪽지는 `return null`
 *    이 아니라 `hidden` 으로 감춘다 — 서버가 null 을 그리면 하이드레이션할 자리가 없어 서버 컴포넌트 트리에 홀로 얹힌 잎은 클라이언트에서
 *    아예 실행되지 않았다(컴포넌트 첫 줄의 console.log 가 한 번도 안 찍혔다).
 * ② 구독 직후 스스로 한 번 알린다(아래 setTimeout). 자리를 만들어 준 뒤에도 하이드레이션 뒤 스냅샷을 다시 읽는 게 들쭉날쭉해
 *    어떤 로드에서는 안 켜졌다. 구독은 리액트가 마운트 때 반드시 부르므로, 이러면 매 로드에서 예외 없이 다시 읽는다.
 *
 * ⚠️ prefix · event 를 바꾸면 이미 닫은 사람에게 다시 뜬다. 문구만 고칠 때는 건드리지 말 것.
 */
export function createHintStore(prefix: string, event: string) {
  type Store = { subscribe(cb: () => void): () => void; getSnapshot(): boolean };
  const stores = new Map<string, Store>();

  function makeStore(key: string): Store {
    return {
      subscribe(cb) {
        // ⭐ 구독 직후 한 번 알린다. 지우면 쪽지가 뜨다 말다 한다(머리 주석 ②).
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

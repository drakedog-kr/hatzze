"""활성 텔레그램 채널의 최근 N일 메시지를 수집해 Supabase telegram_messages 에 upsert.

- 대상: telegram_channels 에서 is_active=true 이고 peer 캐시(channel_id·access_hash)가
  채워진 채널(먼저 sync_telegram_channels.py로 목록과 캐시를 맞춰둔다). 캐시가 없는
  채널은 건너뛴다 — 이 스크립트는 유저네임을 풀지 않는다(아래 상수 주석 참고).
- 방식: 채널마다 최신순으로 훑다가 WINDOW_DAYS 보다 오래된 메시지를 만나면 멈춘다.
  이 "최근 N일 창"을 매 실행마다 통째로 다시 upsert하므로, 신규 메시지 수집과
  기존 메시지의 조회수/포워드수 갱신이 동시에 이뤄진다(첫 실행 = N일 백필).
- upsert 키: (channel_handle, message_id). collected_at 은 payload에서 빼 최초
  수집 시각을 보존하고, updated_at 만 매번 현재 시각으로 갱신한다.

DB엔 telegram_messages 테이블(migration_009)과 telegram_channels 의 peer 캐시
컬럼(migration_021)이 있어야 한다.

종료 코드: 수집이 **통째로 빈** 실행은 exit 1 로 끝난다(활성 채널 0개 · peer 캐시가
찬 채널 0개 · 총 0건). 워크플로가 이 실패를 카더라 전용 알림으로 잡는다. 왜 그렇게
했는지는 main() 끝의 주석 참고.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_telegram.py            # 실제 수집·저장
    python scripts/fetch_telegram.py --dry-run  # 수집만, DB 안 씀
"""

from __future__ import annotations

import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from telethon.sessions import StringSession  # noqa: E402
from telethon.sync import TelegramClient  # noqa: E402
from telethon.tl.types import InputPeerChannel  # noqa: E402

from common.config import (  # noqa: E402
    TELEGRAM_API_HASH,
    TELEGRAM_API_ID,
    TELEGRAM_SESSION,
)
from common.supabase_client import get_client, load_all  # noqa: E402
from common.timeutil import KST  # noqa: E402

WINDOW_DAYS = 7  # 매 실행 재수집하는 창(= 첫 실행 백필 범위)
MAX_SCAN_PER_CHANNEL = 2000  # 폭주 채널 안전 상한(보통 창 경계에서 먼저 멈춤)
# 여기선 유저네임을 풀지 않는다(ResolveUsername 호출 0건). DB에 저장된
# (channel_id, access_hash) 로 InputPeerChannel 을 만들어 바로 연다.
#
# 예전엔 채널마다 get_entity 를 불렀다. sync_telegram_channels.py 가 바로 앞 스텝에서
# 같은 목록을 이미 풀었지만 StringSession 은 엔티티 캐시를 저장하지 않아 이 프로세스로
# 안 넘어왔고, 결국 같은 이름을 하루 두 번씩 풀었다. 채널이 317개가 되자 그게 계정
# FloodWait(약 14시간)으로 돌아왔다 — 2026-07-27 저녁 수집은 0건이었다.
# 이제 유저네임을 푸는 곳은 sync 한 곳뿐이고, 그쪽은 실행당 개수 상한이 걸려 있다.
SLEEP_BETWEEN_CHANNELS_SEC = 0.5
# Telethon 기본값(60초)보다 올려, 짧은 FloodWait 은 예외 대신 대기로 흡수한다.
# 이보다 긴 대기는 그대로 예외 → 그 채널만 건너뛴다(다음 실행에서 다시 잡는다).
FLOOD_SLEEP_THRESHOLD_SEC = 180


def load_active_channels(client) -> list[dict]:
    """활성 채널 + peer 캐시. 잘리면 그 채널은 조용히 수집에서 빠지므로 페이징해 읽는다."""
    rows = load_all(
        client, "telegram_channels", "handle,channel_id,access_hash,is_active"
    )
    return [r for r in rows if r["is_active"]]


def collect_channel(tg, ch: dict, cutoff: datetime) -> list[dict]:
    """한 채널에서 cutoff 이후 메시지를 [row dict] 로 모은다."""
    handle = ch["handle"]
    peer = InputPeerChannel(ch["channel_id"], ch["access_hash"])
    rows: list[dict] = []
    scanned = 0
    for msg in tg.iter_messages(peer, limit=MAX_SCAN_PER_CHANNEL):
        scanned += 1
        if msg.date is None:
            continue
        if msg.date < cutoff:
            break
        rows.append(
            {
                "channel_handle": handle,
                "message_id": msg.id,
                "posted_at": msg.date.astimezone(timezone.utc).isoformat(),
                "views": msg.views,
                "forwards": msg.forwards,
                "replies": msg.replies.replies if msg.replies else None,
                "text": msg.message or None,
                "has_media": msg.media is not None,
                "edited_at": (
                    msg.edit_date.astimezone(timezone.utc).isoformat()
                    if msg.edit_date
                    else None
                ),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return rows


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]

    if not (TELEGRAM_API_ID and TELEGRAM_API_HASH and TELEGRAM_SESSION):
        print("[오류] TELEGRAM_API_ID/API_HASH/SESSION 이 .env.local 에 없습니다.")
        sys.exit(1)

    db = get_client()
    channels = load_active_channels(db)
    if not channels:
        print("[실패] 활성 채널이 없습니다. 먼저 sync_telegram_channels.py 를 실행하세요.")
        sys.exit(1)

    # peer 캐시가 없는 채널은 건너뛴다. 여기서 유저네임을 풀어 버리면 sync 에 걸어 둔
    # resolve 상한이 무의미해지기 때문이다. 다음 sync 가 캐시를 채우면 그때부터 잡히고,
    # 창이 7일이라 하루 늦게 시작해도 그 사이 글은 백필로 함께 들어온다.
    ready, waiting = [], []
    for ch in channels:
        target = ready if ch.get("channel_id") and ch.get("access_hash") else waiting
        target.append(ch)
    if waiting:
        print(
            f"[안내] peer 캐시가 아직 없는 채널 {len(waiting)}개는 건너뜁니다"
            "(sync 가 채우면 다음 실행부터 수집)."
        )
    if not ready:
        print("[실패] 수집 가능한 채널이 없습니다. sync_telegram_channels.py 를 먼저 돌리세요.")
        sys.exit(1)

    cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    print(
        f"활성 채널 {len(ready)}개 · 최근 {WINDOW_DAYS}일"
        f"(≥ {cutoff.astimezone(KST):%Y-%m-%d %H:%M} KST) 수집"
        + (" · [dry-run]" if dry_run else "")
    )

    total = 0
    failed: list[str] = []
    with TelegramClient(
        StringSession(TELEGRAM_SESSION),
        int(TELEGRAM_API_ID),
        TELEGRAM_API_HASH,
        flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD_SEC,
    ) as tg:
        for i, ch in enumerate(ready):
            handle = ch["handle"]
            if i:
                time.sleep(SLEEP_BETWEEN_CHANNELS_SEC)
            try:
                rows = collect_channel(tg, ch, cutoff)
            except Exception as exc:  # noqa: BLE001
                # 캐시가 낡아 실패하는 경우도 여기로 온다. 다음 sync 가 유저네임으로
                # 다시 풀어 값을 고치므로 여기서 되돌리지 않는다(그게 resolve 창구를
                # 한 곳으로 묶는 이유다).
                print(f"  {handle:<18} 실패: {type(exc).__name__}: {exc}")
                failed.append(handle)
                continue

            total += len(rows)
            fwd_max = max((r["forwards"] or 0 for r in rows), default=0)
            view_max = max((r["views"] or 0 for r in rows), default=0)
            print(
                f"  {handle:<18} {len(rows):>3}건 · 최대조회 {view_max:>7,} · 최대포워드 {fwd_max:>4}"
            )

            if not dry_run and rows:
                db.table("telegram_messages").upsert(
                    rows, on_conflict="channel_handle,message_id"
                ).execute()

    if dry_run:
        print(f"\n--dry-run: 총 {total}건 수집(표시만, DB 안 씀).")
    else:
        print(f"\n[Supabase] telegram_messages upsert 완료: 총 {total}건")

    # 실패는 채널마다 한 줄씩 이미 찍히지만, 300줄 로그에 섞이면 눈에 안 띈다.
    # 건수가 계속 늘면 FloodWait 을 의심할 것.
    if failed:
        print(
            f"[경고] 채널 {len(failed)}/{len(ready)}개 수집 실패: "
            + ", ".join(failed[:20])
            + (f" 외 {len(failed) - 20}개" if len(failed) > 20 else "")
        )

    # ── 왜 여기서 죽는가 ────────────────────────────────────────────────────
    # 2026-07-28 01:28 UTC 실행은 peer 캐시가 0개라 위 '수집 가능한 채널이 없습니다'
    # 에서 조용히 return 했고, 워크플로는 success 로 끝났다. 그날 메시지 수집은 0건인데
    # 알림은 없었고, 복구는 사람이 손으로 돌려서야 됐다. 스텝이 성공으로 끝나면 그 위의
    # 어떤 감시도 붙일 수가 없다 — 그래서 '재료가 아예 안 들어온' 실행은 실패로 끝낸다.
    #
    # 문턱을 여기 하나만 둔 이유: 부분 실패(예: 절반이 실패)에도 비율 문턱을 걸까
    # 고민했지만, 그 숫자를 정할 실측이 없다. 게다가 peer 캐시가 차는 중인 날은 원래
    # 대상이 200/317 처럼 부분이라 정상인데, 그걸 실패로 세면 알림이 며칠 연속 울리고
    # 그러면 아무도 안 보게 된다. 0건은 다르다 — 300개대 채널의 7일 창이 비는 건
    # 정상적으로는 일어나지 않는다. 부분 실패는 위 [경고] 줄이 계속 맡는다.
    if total == 0:
        print(
            "\n[실패] 수집된 메시지가 0건입니다. FloodWait·세션 만료·peer 캐시 소실을"
            " 의심하고, sync_telegram_channels.py 로그를 먼저 보세요."
        )
        sys.exit(1)


if __name__ == "__main__":
    main()

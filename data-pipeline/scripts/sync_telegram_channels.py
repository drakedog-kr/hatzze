"""구글시트의 채널 목록을 Supabase telegram_channels 테이블로 동기화한다 (카더라 리포트).

흐름:
  1. 시트(TELEGRAM_CHANNELS_SHEET_ID)를 CSV export로 내려받아 핸들·타입을 파싱.
  2. 각 핸들을 텔레그램에서 조회(GetFullChannelRequest)해 표시명·구독자수를 얻는다.
     이때 얻은 (channel_id, access_hash) 를 DB에 남겨, 다음 실행부터는 유저네임을
     푸는 호출(ResolveUsername) 없이 바로 연다 — **이 스크립트가 레포에서 유저네임을
     푸는 유일한 곳**이고, 한 실행에 MAX_RESOLVES_PER_RUN 개까지만 푼다.
     프사는 아직 없는 채널만 내려받는다. 호출 사이엔 잠깐 쉰다(FloodWait 완화).
  3. telegram_channels 에 upsert(on_conflict=handle). added_at/notes 는 payload에서
     빼서 기존 값을 보존한다(insert 때만 default로 채워짐). 조회에 실패한 채널은
     title·subscriber_count 를 아예 안 보내 기존 값을 지킨다. 사진은 새로 받은 것만
     따로 나눠 보낸다(한 요청에 base64 수백 개를 싣지 않으려고).
  4. 시트에서 빠진(=DB에 is_active=true 인데 시트에 없는) 채널은 is_active=false 로
     내린다. 행 자체는 지우지 않아 과거 수집분과의 연결이 남는다.

시트가 source of truth라 매 실행마다 전체를 다시 맞춘다. 배치에선 수집기보다 먼저
돌려 목록·구독자수를 최신화한다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/sync_telegram_channels.py            # 실제 동기화
    python scripts/sync_telegram_channels.py --dry-run  # 조회만, DB 안 씀
"""

from __future__ import annotations

import base64
import csv
import io
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from telethon.errors import FloodWaitError  # noqa: E402
from telethon.sessions import StringSession  # noqa: E402
from telethon.sync import TelegramClient  # noqa: E402
from telethon.tl.functions.channels import GetFullChannelRequest  # noqa: E402
from telethon.tl.types import InputChannel  # noqa: E402

from common.config import (  # noqa: E402
    TELEGRAM_API_HASH,
    TELEGRAM_API_ID,
    TELEGRAM_CHANNELS_SHEET_ID,
    TELEGRAM_SESSION,
)
from common.supabase_client import get_client, load_all  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

REQUEST_TIMEOUT_SEC = 20
# 채널마다 GetFullChannel 을 부르므로 목록이 300개대면 호출도 300건대다. 연속 호출은
# FloodWait 을 부르기 쉬워 사이에 쉰다(캐시로 건너뛴 채널은 호출이 없으니 안 쉰다).
SLEEP_BETWEEN_CHANNELS_SEC = 0.5
# peer 캐시가 빈 채널을 한 실행에서 이만큼만 새로 푼다(ResolveUsername).
#
# 2026-07-26 에 채널이 12 → 317 개로 늘면서 sync·fetch 가 실행마다 317번씩 유저네임을
# 풀었고(그날은 수동 실행까지 겹쳐 5회), 텔레그램이 계정에 약 14시간짜리 FloodWait 을
# 걸었다. 07-27 저녁엔 317개 전부 실패해 그날 수집이 0건이었다. 실측으론 한 실행에
# 243개까지 풀리다 막혔으므로 그 절반 아래로 잡는다.
#
# 상한에 걸린 채널은 이번 실행에서 아예 건드리지 않고(기존 값 보존) 다음 실행이
# 이어받는다. 317개면 네 번(하루 2회 실행 = 이틀) 돌아 캐시가 다 차고, 그 뒤로는
# resolve 가 0건이 된다. 채널을 크게 늘린 날엔 그만큼 다시 며칠에 걸쳐 채워진다.
MAX_RESOLVES_PER_RUN = 100
# Telethon 기본값(60초)보다 올려, 짧은 FloodWait 은 예외 대신 대기로 흡수한다.
# 이보다 긴 대기는 그대로 예외 → 그 채널만 건너뛴다(기존 값은 보존된다).
FLOOD_SLEEP_THRESHOLD_SEC = 180
# base64 사진은 건당 ~12KB — 한 요청에 수백 개를 실으면 수 MB가 된다.
PHOTO_BATCH = 20
# 시트 첫 탭을 CSV로 내보내는 공개 export 엔드포인트. 시트가 "링크 있는 사람 보기"로
# 공유돼 있어야 인증 없이 읽힌다.
SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
# 헤더행일 수 있는 첫 칼럼 값들(있으면 건너뛴다).
HEADER_HINTS = {"handle", "채널", "핸들", "channel", "username", "유저네임"}


def normalize_type(raw: str) -> str:
    r = (raw or "").strip()
    if "그룹" in r or "채팅방" in r or r.lower() == "group":
        return "group"
    return "channel"


def fetch_sheet_channels(sheet_id: str) -> list[dict]:
    """시트 CSV를 읽어 [{handle, type}] 로. 헤더행·빈줄·중복(대소문자 무시) 제거."""
    url = SHEET_CSV_URL.format(sheet_id=sheet_id)
    resp = requests.get(url, timeout=REQUEST_TIMEOUT_SEC)
    resp.raise_for_status()
    resp.encoding = "utf-8"

    seen: set[str] = set()
    channels: list[dict] = []
    for row in csv.reader(io.StringIO(resp.text)):
        if not row:
            continue
        handle = (row[0] or "").strip().lstrip("@").strip()
        if not handle or handle.lower() in HEADER_HINTS:
            continue
        if handle.lower() in seen:
            continue
        seen.add(handle.lower())
        raw_type = row[1] if len(row) > 1 else ""
        channels.append({"handle": handle, "type": normalize_type(raw_type)})
    return channels


def download_photo_data_uri(client, entity) -> str | None:
    """채널 프로필 사진(작은 썸네일)을 base64 data URI로. 사진이 없으면 None."""
    try:
        raw = client.download_profile_photo(entity, file=bytes, download_big=False)
        if not raw:
            return None
        return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
    except Exception:  # noqa: BLE001
        return None


class ResolveBudget:
    """한 실행에서 유저네임을 풀 수 있는 횟수. **성공이 아니라 시도**를 센다.

    성공만 세면 FloodWait 이 걸린 날 상한이 무력해진다 — 전부 실패하니 잔량이 안 줄고,
    317개를 그대로 다 두드리게 된다. 막힌 문을 계속 미는 게 정확히 이 사달의 원인이었다.
    """

    def __init__(self, limit: int) -> None:
        self.left = limit
        self.used = 0

    def spend(self) -> bool:
        if self.left <= 0:
            return False
        self.left -= 1
        self.used += 1
        return True

    def exhaust(self) -> None:
        self.left = 0


def open_channel(client, handle: str, cached: tuple[int, int] | None, budget: ResolveBudget):
    """채널을 열어 (엔티티, 상세) 를 돌려준다.

    캐시가 있으면 유저네임을 풀지 않고 InputChannel 로 바로 연다. 캐시가 낡았을
    때만(채널 재생성 등으로 access_hash 가 무효) 유저네임으로 되돌아가며, 그 결과가
    다시 캐시에 덮인다. 즉 틀린 캐시는 한 번의 실패로 스스로 고쳐진다.
    """
    if cached:
        try:
            full = client(GetFullChannelRequest(InputChannel(*cached)))
            entity = next((c for c in full.chats if c.id == cached[0]), None)
            if entity is not None:
                return entity, full
        except FloodWaitError:
            raise
        except Exception as exc:  # noqa: BLE001
            if budget.left <= 0:
                raise
            print(f"  {handle:<18} 캐시된 peer 실패({type(exc).__name__}) — 유저네임으로 다시 풉니다")
    if not budget.spend():
        raise RuntimeError(
            f"이번 실행의 resolve 상한({MAX_RESOLVES_PER_RUN})에 걸렸습니다"
        )
    entity = client.get_entity(handle)  # ResolveUsername — 아껴 써야 하는 호출
    return entity, client(GetFullChannelRequest(entity))


def enrich_from_telegram(
    channels: list[dict], have_photo: set[str], peers: dict[str, tuple[int, int]]
) -> list[dict]:
    """각 핸들의 표시명·구독자수·프로필사진·peer 를 텔레그램에서 채운다.

    실패하면 None + error. 캐시가 없는데 이번 실행의 resolve 상한을 다 썼으면 아예
    건드리지 않고 deferred 로 표시한다(호출 0건 → 기존 값 그대로 보존).

    사진은 이미 DB에 있는 채널이면 다시 내려받지 않는다 — 매 실행 전 채널의 프사를
    받으면 목록 크기만큼 다운로드가 늘고(300개대면 매일 300건) 얻는 게 거의 없다.
    """
    budget = ResolveBudget(MAX_RESOLVES_PER_RUN)
    calls = 0
    with TelegramClient(
        StringSession(TELEGRAM_SESSION),
        int(TELEGRAM_API_ID),
        TELEGRAM_API_HASH,
        flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD_SEC,
    ) as client:
        for ch in channels:
            ch["title"] = None
            ch["subscriber_count"] = None
            ch["photo"] = None
            ch["channel_id"] = None
            ch["access_hash"] = None
            ch["error"] = None
            ch["deferred"] = False

            cached = peers.get(ch["handle"])
            if cached is None and budget.left <= 0:
                ch["deferred"] = True
                continue

            if calls:
                time.sleep(SLEEP_BETWEEN_CHANNELS_SEC)
            calls += 1
            try:
                entity, full = open_channel(client, ch["handle"], cached, budget)
                ch["title"] = getattr(entity, "title", None) or ch["handle"]
                ch["subscriber_count"] = full.full_chat.participants_count
                ch["channel_id"] = entity.id
                ch["access_hash"] = getattr(entity, "access_hash", None)
                ch["photo"] = (
                    None
                    if ch["handle"] in have_photo
                    else download_photo_data_uri(client, entity)
                )
            except Exception as exc:  # noqa: BLE001
                ch["title"] = None
                ch["subscriber_count"] = None
                ch["photo"] = None
                ch["channel_id"] = None
                ch["access_hash"] = None
                ch["error"] = f"{type(exc).__name__}: {exc}"
                if isinstance(exc, FloodWaitError):
                    # 지금 텔레그램이 조회를 막고 있다. 남은 채널을 계속 두드려 봐야
                    # 다 실패하고 제한만 길어진다 — 이번 실행은 여기서 손을 뗀다.
                    if budget.left:
                        print(
                            f"\n[중단] FloodWait({exc.seconds}초) — 이번 실행의 남은 "
                            f"유저네임 조회 {budget.left}건을 포기합니다(다음 실행에서 재시도).\n"
                        )
                    budget.exhaust()
    print(
        f"\n유저네임 조회(ResolveUsername) {budget.used}/{MAX_RESOLVES_PER_RUN}건 시도 · "
        f"캐시로 연 채널 {max(calls - budget.used, 0)}개"
    )
    return channels


def load_peer_cache(client) -> dict[str, tuple[int, int]]:
    """이미 알아 둔 (channel_id, access_hash). 둘 다 있는 채널만 캐시로 친다.

    load_all 로 읽는다 — 여기서 1,000행에 잘리면 잘린 채널이 '캐시 없음'으로 보여
    유저네임을 다시 풀게 되고, 그게 정확히 이 캐시가 막으려는 일이다.
    """
    rows = load_all(client, "telegram_channels", "handle,channel_id,access_hash")
    return {
        r["handle"]: (r["channel_id"], r["access_hash"])
        for r in rows
        if r.get("channel_id") is not None and r.get("access_hash") is not None
    }


def handles_with_photo(client) -> set[str]:
    """이미 프사가 저장된 핸들. photo 본문(base64)은 안 읽고 핸들만 받는다."""
    rows = (
        client.table("telegram_channels")
        .select("handle")
        .not_.is_("photo", "null")
        .execute()
        .data
    )
    return {r["handle"] for r in rows}


def print_table(channels: list[dict]) -> None:
    print(
        f"\n{'핸들':<18}{'타입':<9}{'구독자수':>10}   제목 / 오류"
    )
    print("-" * 72)
    for ch in channels:
        subs = ch.get("subscriber_count")
        subs_s = f"{subs:,}" if subs is not None else "-"
        if ch.get("deferred"):
            tail = "resolve 상한 — 다음 실행에서 조회(기존 값 유지)"
        else:
            tail = ch.get("error") or (ch.get("title") or "")
        print(f"{ch['handle']:<18}{ch['type']:<9}{subs_s:>10}   {tail}")


def sync_to_supabase(channels: list[dict]) -> None:
    client = get_client()
    now = datetime.now(timezone.utc).isoformat()

    # 조회 성공분과 실패분을 나눠 쓴다 — 실패한 채널에 title·subscriber_count 를
    # None 으로 보내면 **기존 값이 지워진다.** 채널이 12개일 땐 실패가 없어 안 드러났지만,
    # 목록이 300개대가 되면 비공개 전환·핸들 변경·긴 FloodWait 로 매 실행 몇 건은 실패한다.
    # (PostgREST 는 배열 안 객체의 키 구성이 달라도 받아준다 — 빠진 키는 그 행에만 안
    #  쓰인다. 그래서 행마다 키를 빼도 되지만, 묶음을 나누는 편이 의도가 눈에 보인다.)
    ok = [ch for ch in channels if not ch.get("error") and not ch.get("deferred")]
    failed = [ch for ch in channels if ch.get("error")]
    deferred = [ch for ch in channels if ch.get("deferred")]

    def base_row(ch: dict) -> dict:
        return {
            "handle": ch["handle"],
            "type": ch["type"],
            "title": ch["title"],
            "subscriber_count": ch["subscriber_count"],
            "is_active": True,
            "synced_at": now,
        }

    # peer 를 얻은 채널만 캐시 컬럼을 함께 쓴다. 못 얻은 채널에 None 을 보내면
    # 멀쩡한 캐시가 지워져 다음 실행이 또 유저네임을 푼다 — 정확히 피하려는 상황이다.
    # (한 요청 안의 객체들은 키 구성이 같아야 하므로 두 묶음으로 나눠 보낸다.)
    with_peer = [ch for ch in ok if ch.get("access_hash") is not None]
    without_peer = [ch for ch in ok if ch.get("access_hash") is None]

    if with_peer:
        client.table("telegram_channels").upsert(
            [
                base_row(ch)
                | {"channel_id": ch["channel_id"], "access_hash": ch["access_hash"]}
                for ch in with_peer
            ],
            on_conflict="handle",
        ).execute()
    if without_peer:
        client.table("telegram_channels").upsert(
            [base_row(ch) for ch in without_peer], on_conflict="handle"
        ).execute()
    if failed or deferred:
        # 목록엔 남기되(시트에 있으니 is_active=true) 제목·구독자수는 손대지 않는다.
        client.table("telegram_channels").upsert(
            [
                {
                    "handle": ch["handle"],
                    "type": ch["type"],
                    "is_active": True,
                }
                for ch in failed + deferred
            ],
            on_conflict="handle",
        ).execute()
    print(
        f"[Supabase] telegram_channels upsert 완료: {len(ok)}건"
        + (f" · peer 캐시 {len(with_peer)}건" if with_peer else "")
        + (f" · 조회 실패 {len(failed)}건은 기존 값 보존" if failed else "")
        + (f" · resolve 상한으로 미룬 {len(deferred)}건" if deferred else "")
    )

    # 사진은 새로 받은 것만 따로 쓴다(위 upsert 뒤라 항상 update 경로).
    # 첫 실행처럼 수백 개를 한꺼번에 받은 날엔 base64 가 통째로 수 MB라 나눠 보낸다.
    photo_rows = [
        {"handle": ch["handle"], "photo": ch["photo"]} for ch in ok if ch.get("photo")
    ]
    for i in range(0, len(photo_rows), PHOTO_BATCH):
        client.table("telegram_channels").upsert(
            photo_rows[i : i + PHOTO_BATCH], on_conflict="handle"
        ).execute()
    if photo_rows:
        print(f"[Supabase] 프로필 사진 {len(photo_rows)}건 갱신")

    # 시트에서 빠진 채널은 is_active=false 로 내린다(행은 보존).
    # 이 조회는 활성 채널 수가 1,000을 넘으면 조용히 잘린다(PostgREST 상한). 잘리면
    # 빠진 채널을 못 찾아 내리지 못하는 쪽으로만 틀리므로 데이터는 안 깨지지만,
    # 시트가 그 규모가 되면 load_all 류로 페이징할 것.
    sheet_handles = [ch["handle"] for ch in channels]
    existing = (
        client.table("telegram_channels")
        .select("handle")
        .eq("is_active", True)
        .execute()
    )
    stale = [r["handle"] for r in existing.data if r["handle"] not in sheet_handles]
    if stale:
        client.table("telegram_channels").update({"is_active": False}).in_(
            "handle", stale
        ).execute()
        print(f"[Supabase] 시트에서 빠진 채널 {len(stale)}건 비활성화: {stale}")

    # 오늘(KST) 구독자 스냅샷 기록 — "뜨는 채널" 시계열용(백필 불가라 매일 남긴다).
    today = today_kst().isoformat()
    snapshots = [
        {
            "channel_handle": ch["handle"],
            "date": today,
            "subscriber_count": ch["subscriber_count"],
        }
        for ch in channels
        if ch["subscriber_count"] is not None
    ]
    if snapshots:
        client.table("telegram_channel_stats").upsert(
            snapshots, on_conflict="channel_handle,date"
        ).execute()
        print(f"[Supabase] telegram_channel_stats 스냅샷 {len(snapshots)}건 ({today})")


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]

    if not TELEGRAM_CHANNELS_SHEET_ID:
        print("[오류] TELEGRAM_CHANNELS_SHEET_ID 가 .env.local 에 없습니다.")
        sys.exit(1)
    if not (TELEGRAM_API_ID and TELEGRAM_API_HASH and TELEGRAM_SESSION):
        print("[오류] TELEGRAM_API_ID/API_HASH/SESSION 이 .env.local 에 없습니다.")
        sys.exit(1)

    channels = fetch_sheet_channels(TELEGRAM_CHANNELS_SHEET_ID)
    print(f"시트에서 채널 {len(channels)}개 파싱")
    if not channels:
        print("[경고] 시트에 채널이 없습니다. 동기화를 건너뜁니다.")
        return

    db = get_client()
    have_photo = handles_with_photo(db)
    print(f"프로필 사진 보유 {len(have_photo)}개 — 나머지만 내려받습니다")
    peers = load_peer_cache(db)
    print(
        f"peer 캐시 보유 {len(peers)}/{len(channels)}개 — 나머지만 유저네임을 풉니다"
        f"(한 실행 최대 {MAX_RESOLVES_PER_RUN}개)"
    )
    enrich_from_telegram(channels, have_photo, peers)
    print_table(channels)

    failed = [ch["handle"] for ch in channels if ch.get("error")]
    if failed:
        print(f"\n[경고] 텔레그램 조회 실패 {len(failed)}건: {failed}")
    deferred = [ch["handle"] for ch in channels if ch.get("deferred")]
    if deferred:
        print(
            f"\n[안내] resolve 상한으로 {len(deferred)}건은 다음 실행으로 미뤘습니다"
            "(기존 값 유지). 캐시가 다 차면 이 줄은 사라집니다."
        )

    if dry_run:
        print("\n--dry-run: DB에 아무것도 쓰지 않았습니다.")
        return
    sync_to_supabase(channels)


if __name__ == "__main__":
    main()

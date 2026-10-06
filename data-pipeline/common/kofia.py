"""금융투자협회 통계 — 공공데이터포털 '금융위원회_금융투자협회종합통계정보' 공통 조각.

쓰는 곳: fetch_investor_deposit.py(증시자금추이 · 투자자예탁금) · fetch_credit_loan.py(신용공여 잔고 추이 · 신용거래융자).
전 기록 병합 upsert·미리보기 JSON 은 금투협과 상관없이 쓰여 common/indicator.py 에 있다.

    https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService/<기능>

이용허락범위 제한 없음 · 자동승인 · 하루 1만 회. 키는 공공데이터포털 계정 키(KSD_API_KEY)를 같이 쓰고, 이 서비스에
활용신청이 돼 있어야 한다(안 돼 있으면 403 "등록되지 않은 서비스키").

날짜를 안 주고 numOfRows 를 넉넉히 주면 **한 번에 전 기록이 온다**(2026-10-06 실측 증시자금 1,209행 · 신용공여 1,196행).
기록은 2021-10~11 부터다. 값은 금투협 FreeSIS 와 같다(1,209일 중 1,184일이 원 단위까지 같고 나머지도 1.1% 안쪽).
⚠️ 금투협 통계는 다음 영업일에 나오고 신용공여는 '결제일 기준'이라 실제 거래보다 이틀쯤 늦다.
"""

from __future__ import annotations

from common.config import KSD_API_KEY
from common.http_client import get_with_retry

BASE = "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService/"
# 한 번에 받는 행 수. 모자라면 쪽을 넘겨 받는다.
PAGE_ROWS = 3000


def fetch_daily(op: str, field: str, label: str) -> list[tuple[str, float]]:
    """기능 op 의 칸 field 를 (YYYY-MM-DD, 값) 날짜 오름차순으로 돌려준다."""
    items: list[dict] = []
    page = 1
    while True:
        resp = get_with_retry(
            BASE + op,
            label=label,
            params={"serviceKey": KSD_API_KEY, "resultType": "json", "numOfRows": PAGE_ROWS, "pageNo": page},
        )
        if resp.status_code == 403:
            raise PermissionError(
                f"공공데이터포털 403: {resp.text[:200]} — '금융위원회_금융투자협회종합통계정보'에 "
                "활용신청이 돼 있는지 확인하세요."
            )
        resp.raise_for_status()
        body = resp.json()["response"]
        code = body["header"].get("resultCode")
        if code != "00":
            raise RuntimeError(f"공공데이터포털 응답 코드 {code}: {body['header'].get('resultMsg')}")
        got = (body["body"].get("items") or {}).get("item") or []
        items.extend(got)
        total = int(body["body"].get("totalCount") or 0)
        if not got or len(items) >= total:
            break
        page += 1

    out: dict[str, float] = {}
    for x in items:
        d, v = x.get("basDt"), x.get(field)
        if not d or v in (None, ""):
            continue
        out[f"{d[:4]}-{d[4:6]}-{d[6:8]}"] = float(v)
    return sorted(out.items())

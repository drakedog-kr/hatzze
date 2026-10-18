"""국장 종목 로고를 22px 동그라미에 맞게 다듬는 손 설정 — scripts/refresh_stock_logo_sources.py 가 읽는다(마이그레이션 104).

화면에 보이는 국장 종목(홈 · 카더라 · 미리보기 · 테마 26장 · 배당 · 노트, 2026-10-18 기준 260개)을 90% 넘게 로고로 채우려고
자동 판정이 못 하는 곳만 손으로 적는다.

- DOMAIN_OVERRIDE  거래소 목록에 홈페이지가 없거나 logo.dev 가 모르는 주소일 때, logo.dev 에 물을 도메인.
- CROP_OVERRIDE    가로로 긴 글자 로고에서 잘라 쓸 상자 [x, y, w, h](logo.dev 512px 그림 안 비율). 자동(common/logo_shape.piece_box)이
                   못 자르거나 엉뚱한 데를 자를 때. [] 이면 자르지 않는다.
- OWN_LOGO         logo.dev 에 그림이 없는 종목 — 회사 홈페이지의 로고 그림 주소와 (필요하면) 자를 상자(그 그림 안 비율).
                   파이프라인이 받아 256px 정사각형 PNG 로 다듬어 판정표 image 칸에 둔다(source = own).

상자는 2026-10-18 에 그림을 보며 정했다. 회사가 로고를 바꾸면 다시 봐야 한다.
"""

DOMAIN_OVERRIDE: dict[str, str] = {
    "103590": "iljin.co.kr",  # 일진전기
    "087010": "peptron.com",  # 펩트론
    "403850": "pinkfong.com",  # 더핑크퐁컴퍼니
    "486990": "nota.ai",  # 노타
    "005940": "nonghyup.com",  # NH투자증권
    "250930": "yesuntech.com",  # 예선테크
}

CROP_OVERRIDE: dict[str, list[float]] = {
    "000270": [0.082, 0.4004, 0.3418, 0.1973],  # 기아
    "002990": [0.8301, 0.2969, 0.1504, 0.1484],  # 금호건설
    "003010": [0.6562, 0.3281, 0.2539, 0.2539],  # 혜인
    "010140": [0.3145, 0.375, 0.373, 0.123],  # 삼성중공업
    "028670": [0.0703, 0.4297, 0.0977, 0.1367],  # 팬오션
    "033780": [0.0703, 0.4199, 0.1562, 0.1855],  # KT&G
    "041830": [0.1562, 0.334, 0.1621, 0.1621],  # 인바디
    "073240": [0.0918, 0.4043, 0.1016, 0.1094],  # 금호타이어
    "077970": [0, 0.3809, 0.4922, 0.2109],  # STX엔진
    "084370": [0.125, 0.4355, 0.2617, 0.1211],  # 유진테크
    "090460": [0.0605, 0.4316, 0.3809, 0.1309],  # 비에이치
    "099220": [],  # SDN
    "100090": [0.0781, 0.3027, 0.3359, 0.2637],  # SK오션플랜트
    "103140": [0.0508, 0.4434, 0.0918, 0.1309],  # 풍산
    "108490": [0.0703, 0.3594, 0.1543, 0.1641],  # 로보티즈
    "174900": [0.0352, 0.4453, 0.2422, 0.123],  # 앱클론
    "241560": [0.0293, 0.4395, 0.123, 0.123],  # 두산밥캣
    "247540": [0.0176, 0.4004, 0.1289, 0.1621],  # 에코프로비엠
    "336260": [0.0645, 0.4434, 0.1152, 0.1191],  # 두산퓨얼셀
    "375500": [0.125, 0.3926, 0.2324, 0.2324],  # DL이앤씨
    "454910": [0.0703, 0.4395, 0.1094, 0.1113],  # 두산로보틱스
    "457550": [0.6367, 0.3789, 0.155, 0.248],  # 우진엔텍
}

OWN_LOGO: dict[str, tuple[str, list[float] | None]] = {
    "011780": ("https://www.kkpc.com/resources/kor/images/common/header/img_logo01.gif", [0, 0, 0.165, 1]),  # 금호석유화학
    "011930": ("https://www.shinsungeng.com/images/common/foot_logo.jpg", [0, 0, 0.19, 1]),  # 신성이엔지
    "043260": ("http://www.sungho.net/images/common/logo.png", None),  # 성호전자
    "083650": ("https://img.bhi.wizone.kr/files/attach/images/130/701a088037073f4b0ae5e2efce2b615a.png", None),  # 비에이치아이
    "091590": ("http://www.namhwaconst.co.kr/images/top/logo.gif", None),  # 남화토건
    "170920": ("http://www.l-tech.co.kr/images/06e041c08d357.png", None),  # 엘티씨
    "178320": ("https://www.seojinsystem.net/theme/basic/img/favicon.ico", None),  # 서진시스템
    "229640": ("https://www.lsecoenergy.com/theme/sample20/img/logo_gray.png", [0, 0, 0.26, 1]),  # LS에코에너지
    "241710": ("http://cosmecca.co.kr/frontend/assets/images/cosmecca_og.jpg", None),  # 코스메카코리아
    "250030": ("https://www.jincostech.com/assets/upload/favi.png", None),  # 진코스텍
    "255440": ("https://www.yasoled.com/images/logo.png", [0, 0, 0.62, 0.78]),  # 야스
    "263750": ("https://static.pearlcdn.com/asset/company/global/contents/img/common/favicon256.ico", None),  # 펄어비스
    "282330": ("https://www.bgfretail.com/assets/image/favicon.png", None),  # BGF리테일
    "290740": ("http://www.actro.co.kr/images/kor09r-22-0461/common/footer_logo.png", None),  # 액트로
    "317240": ("https://tstrillion.co.kr/wp-content/uploads/2023/08/cropped-logo-192x192.png", None),  # TS트릴리온
    "333430": ("http://www.ilseung.co.kr/_public/images/common/logo3.png", None),  # 일승
    "356860": ("https://www.tlbpcb.com/img/favicon_144.png", None),  # 티엘비
}

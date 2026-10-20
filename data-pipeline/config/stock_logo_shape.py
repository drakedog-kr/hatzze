"""국장 종목 로고를 22px 동그라미에 맞게 다듬는 손 설정 — scripts/refresh_stock_logo_sources.py 가 읽는다(마이그레이션 104).

화면에 보이는 국장 종목(홈 · 카더라 · 미리보기 · 테마 26장 · 배당 · 노트, 2026-10-18 기준 260개)을 90% 넘게 로고로 채우려고
자동 판정이 못 하는 곳만 손으로 적는다.

- DOMAIN_OVERRIDE  거래소 목록에 홈페이지가 없거나 logo.dev 가 모르는 주소일 때, logo.dev 에 물을 도메인.
- CROP_OVERRIDE    가로로 긴 글자 로고에서 잘라 쓸 상자 [x, y, w, h](logo.dev 512px 그림 안 비율). 자동(common/logo_shape.piece_box)이
                   못 자르거나 엉뚱한 데를 자를 때. [] 이면 자르지 않는다.
- OWN_LOGO         logo.dev 에 그림이 없는 종목 — 회사 홈페이지의 로고 그림 주소와 (필요하면) 자를 상자(그 그림 안 비율).
                   파이프라인이 받아 256px 정사각형 PNG 로 다듬어 판정표 image 칸에 둔다(source = own).
- PREFER_DOMAIN    티커 그림이 있어도 도메인 그림(DOMAIN_OVERRIDE 또는 거래소 목록의 홈페이지)을 쓸 종목 — 티커 그림이 흐릴 때.
                   흐린 원본은 실행 로그에 '흐린 원본' 으로 찍힌다(시가총액 순). 도메인 그림을 눈으로 보고 맞는 회사 로고일 때만 적는다
                   — 저절로 바꾸지 않는 이유는 refresh_stock_logo_sources.py STEEP_MIN 주석.

상자는 2026-10-18 에 그림을 보며 정했다. 회사가 로고를 바꾸면 다시 봐야 한다.
"""

DOMAIN_OVERRIDE: dict[str, str] = {
    "103590": "iljin.co.kr",  # 일진전기
    "087010": "peptron.com",  # 펩트론
    "403850": "pinkfong.com",  # 더핑크퐁컴퍼니
    "486990": "nota.ai",  # 노타
    "005940": "nonghyup.com",  # NH투자증권
    "250930": "yesuntech.com",  # 예선테크
    "394800": "3billion.io",  # 쓰리빌리언 — 거래소 목록에 홈페이지가 없다
    "066570": "lg.com",  # LG전자 — 티커 · lge.co.kr 둘 다 흐린 원본, lg.com 은 선명한 LG 심볼(PREFER_DOMAIN)
    "066575": "lg.com",  # LG전자우
    "007660": "isupetasys.com",  # 이수페타시스 — 티커 · petasys.com 둘 다 흐린 원본(PREFER_DOMAIN · 상자 ISU)
    # 2026-10-20 — 거래소 목록에 홈페이지가 없거나 옛 주소라 배지이던 종목. 네이버 기업정보의 홈페이지로 logo.dev 에 묻는다(그림은 눈으로 봄).
    "0004V0": "nbr-motion.com",  # 엔비알모션
    "003800": "acebed.com",  # 에이스침대
    "004590": "koreafurniture.com",  # 한국가구
    "006050": "kukyounggnm.com",  # 국영지앤엠
    "0088M0": "me-zoo.com",  # 메쥬
    "009620": "samboind.kr",  # 삼보산업
    "017250": "inter-m.com",  # 인터엠
    "025870": "sillasg.co.kr",  # 신라에스지
    "027040": "seoulset.co.kr",  # 서울전자통신
    "031510": "austem.co.kr",  # 오스템
    "032940": "wonik.co.kr",  # 원익
    "042000": "cafe24corp.com",  # 카페24
    "047560": "estsoft.co.kr",  # 이스트소프트
    "048870": "synergyinno.com",  # 시너지이노베이션
    "053280": "yes24.com",  # 예스24
    "053700": "sambomotors.com",  # 삼보모터스
    "059210": "meta-biomed.com",  # 메타바이오메드
    "060900": "daehangreenpower.com",  # 에이전트AI
    "065690": "pakers.co.kr",  # 파커스
    "066700": "theragenetex.com",  # 테라젠이텍스
    "073490": "innowireless.com",  # LIG아큐버
    "090150": "iwin.kr",  # 아이윈
    "094850": "verygoodtour.com",  # 참좋은여행
    "100590": "mercury.co.kr",  # 머큐리
    "101170": "woorimpts.com",  # 우림피티에스
    "101670": "hydroli.co.kr",  # 하이드로리튬
    "128660": "pjmetal.co.kr",  # 피제이메탈
    "131180": "dilli.co.kr",  # 딜리
    "133750": "megamd.co.kr",  # 메가엠디
    "136480": "harim.com",  # 하림
    "138610": "nibec.co.kr",  # 나이벡
    "154030": "asiaseed.net",  # 아시아종묘
    "192250": "ksign.com",  # 케이사인
    "208710": "photon25.com",  # 포톤
    "266690": "navcours.com",  # 덕산넵코어스
    "270660": "everybot.co.kr",  # 에브리봇
    "278650": "hlbbiostep.com",  # HLB바이오스텝
    "307750": "kukjeon.co.kr",  # 국전
    "322780": "copus.co.kr",  # 코퍼스코리아
    "331520": "valofe.com",  # 밸로프
    "331740": "autocrypt.io",  # 아우토크립트
    "336060": "wavus.co.kr",  # 웨이버스
    "353190": "hurumcorp.com",  # 휴럼
    "363260": "mobidays.com",  # 모비데이즈
    "369370": "blitzway.com",  # 블리츠웨이엔터테인먼트
    "387570": "finemedix.com",  # 파인메딕스
    "391710": "kornic.co.kr",  # 코닉오토메이션
    "396690": "globalreit.miraeasset.com",  # 미래에셋글로벌리츠
    "451800": "hanwhareit.com",  # 한화리츠
    "453860": "astech.co.kr",  # 에이에스텍
    "462310": "newkiki.com",  # 뉴키즈온
    "466410": "synapsoft.co.kr",  # 사이냅소프트
    "478340": "naraspace.com",  # 나라스페이스테크놀로지
    "493330": "gfi-aegis.com",  # 지에프아이
}

CROP_OVERRIDE: dict[str, list[float]] = {
    "000270": [0.082, 0.4004, 0.3418, 0.1973],  # 기아
    "002990": [0.8301, 0.2969, 0.1504, 0.1484],  # 금호건설
    "003010": [0.6562, 0.3281, 0.2539, 0.2539],  # 혜인
    "010140": [0.3145, 0.375, 0.373, 0.123],  # 삼성중공업
    "028670": [0.0703, 0.4297, 0.0977, 0.1367],  # 팬오션
    "033780": [],  # KT&G — 글자 전체가 로고다(첫 글자 K 만 자르면 KT&G 로 안 읽힌다)
    "041830": [0.1562, 0.334, 0.1621, 0.1621],  # 인바디
    "073240": [0.0918, 0.4043, 0.1016, 0.1094],  # 금호타이어
    "077970": [0, 0.3809, 0.4922, 0.2109],  # STX엔진
    "084370": [0.125, 0.4355, 0.2617, 0.1211],  # 유진테크
    "090460": [0.0605, 0.4316, 0.3809, 0.1309],  # 비에이치
    "005960": [0.0078, 0.4238, 0.1426, 0.1426],  # 동부건설 — 꽃 심볼(작아서 자동 흐림 거름에 걸린다)
    "006730": [0.0996, 0.418, 0.0645, 0.1094],  # 서부T&D — 네 칸 심볼(작아서 자동 흐림 거름에 걸린다)
    "007660": [0.0195, 0.4082, 0.3125, 0.1641],  # 이수페타시스 — ISU(자동은 첫 글자 I 만 잘라 못 쓴다)
    "007980": [],  # 태평양물산 — TP 두 글자(자동은 T 만 자른다)
    "020560": [0.8125, 0.3203, 0.1484, 0.1484],  # 아시아나항공 — 빨간 날개(ASIANA AIRLINES 글자는 칸에서 못 읽는다)
    "060370": [0.1035, 0.4121, 0.3398, 0.1445],  # LS마린솔루션 — LS
    "060720": [0.2969, 0.3301, 0.416, 0.3105],  # KH바텍 — 큰 글자 KH(KH VATEC 전체는 칸에서 못 읽는다)
    "099220": [],  # SDN
    "257720": [0.6875, 0.4258, 0.1621, 0.1504],  # 실리콘투 — 빨간 2(SILICON 글자는 칸에서 못 읽는다)
    "281740": [0.123, 0.4258, 0.168, 0.1504],  # 레이크머티리얼즈 — 부채꼴 심볼(가는 선이라 자동 흐림 거름에 걸린다)
    "100090": [0.1953, 0.3027, 0.2148, 0.1465],  # SK오션플랜트 — 날개만(글자 SK · oceanplant 와 겹쳐 둘 다 넣으면 잘린다)
    "103140": [0.1445, 0.4414, 0.1973, 0.1348],  # 풍산 — 두 고리(OO). 첫 글자 P 는 원본이 작아 흐리다
    "108490": [0.0703, 0.3594, 0.1543, 0.1641],  # 로보티즈
    "174900": [],  # 앱클론 — 첫 덩어리(A)가 옅은 회색이라 동그라미에서 안 보인다
    "241560": [0.0293, 0.4395, 0.123, 0.123],  # 두산밥캣
    "247540": [0.0176, 0.4004, 0.1289, 0.1621],  # 에코프로비엠
    "336260": [0.0645, 0.4434, 0.1152, 0.1191],  # 두산퓨얼셀
    "375500": [0.125, 0.3926, 0.2324, 0.2324],  # DL이앤씨
    "454910": [0.0703, 0.4395, 0.1094, 0.1113],  # 두산로보틱스
    "457550": [0.6367, 0.3789, 0.155, 0.248],  # 우진엔텍
    # 2026-10-18 자동으로 잘린 578장을 눈으로 본 것 가운데 쓰면 안 되는 66장 — 흐린 글자 · 빈 조각 · 가는 막대 · 기호 조각 ·
    # 깨진 픽셀 · 어두운 배너. 자르지 않는다(긴 로고 그대로 — 화면이 배지로 돌린다). 흐린 것은 CROP_BLUR_MAX 가 앞으로 스스로 거른다.
    "000320": [],  # 노루홀딩스
    "000325": [],  # 노루홀딩스우
    "000540": [],  # 흥국화재
    "000545": [],  # 흥국화재우
    "004960": [],  # 한신공영
    "004980": [],  # 성신양회
    "004985": [],  # 성신양회우
    "005950": [],  # 이수화학
    "007570": [],  # 일양약품
    "007575": [],  # 일양약품우
    "011210": [],  # 현대위아
    "011930": [],  # 신성이엔지
    "012170": [],  # 아센디오
    "012200": [],  # 계양전기
    "012205": [],  # 계양전기우
    "014790": [],  # HL D&I
    "016090": [],  # 대현
    "019770": [],  # 서연탑메탈
    "027360": [],  # 아주IB투자
    "033050": [],  # 제이엠아이
    "036630": [],  # 세종텔레콤
    "038010": [],  # 제일테크노스
    "043710": [],  # 코스리거글로벌
    "049950": [],  # 미래컴퍼니
    "054780": [],  # 키이스트
    "057030": [],  # YBM넷
    "064520": [],  # 테크엘
    "065350": [],  # 신성델타테크
    "065370": [],  # 위세아이텍
    "066130": [],  # 하츠
    "070590": [],  # 인티큐브
    "084990": [],  # 헬릭스미스
    "092220": [],  # KEC
    "092730": [],  # 네오팜
    "092780": [],  # DYP
    "094170": [],  # 동운아나텍
    "094280": [],  # 효성ITX
    "099430": [],  # 바이오플러스
    "114810": [],  # 한솔아이원스
    "122450": [],  # KX
    "123420": [],  # 위메이드플레이
    "147830": [],  # 제룡산업
    "163730": [],  # 핑거
    "175140": [],  # 아고스
    "208640": [],  # 썸에이지
    "215090": [],  # 솔디펜스
    "229640": [],  # LS에코에너지
    "235980": [],  # 메드팩토
    "240810": [],  # 원익IPS
    "246960": [],  # SCL사이언스
    "253840": [],  # 수젠텍
    "255440": [],  # 야스
    "264660": [],  # 씨앤지하이테크
    "274400": [],  # 이노시뮬레이션
    "286750": [],  # 나노실리칸첨단소재
    "294630": [],  # 서남
    "307930": [],  # 컴퍼니케이
    "308080": [],  # 바이젠셀
    "315640": [],  # 딥노이드
    "381970": [],  # KG모빌리티플랫폼
    "408920": [],  # 메쎄이상
    "462510": [],  # 라메디텍
    "464500": [],  # 아이언디바이스
    "469750": [],  # 아이비젼웍스
    # 2026-10-20 — 짧은 글자 로고는 첫 글자만 자르지 않고 통째로(DOMAIN_OVERRIDE 로 새로 받은 것).
    "004590": [],  # 한국가구
    "0088M0": [],  # 메쥬
    "053280": [],  # 예스24
    "131180": [],  # 딜리
    "353190": [],  # 휴럼
    "266690": [0.1289, 0.3691, 0.2617, 0.248],  # 덕산넵코어스 — DS 와 빨간 획(뒤 Navcours 는 뺀다)
    "278650": [0.0234, 0.2266, 0.9531, 0.375],  # HLB바이오스텝 — HLB 타원(글자 줄은 뺀다)
}

OWN_LOGO: dict[str, tuple[str, list[float] | None]] = {
    "002140": ("http://www.hafeed.co.kr/images/common/logo_hafeed_gray.png", [0, 0, 0.3913, 0.9556]),  # 고려산업 — 해피드 웃는 얼굴(logo.dev 에 없다)
    "006340": ("http://www.daewoncable.co.kr/images/common/logo.png", [0, 0, 0.1628, 1]),  # 대원전선 — 빨간 두 고리(logo.dev 에 없다)
    "317400": ("http://www.xisnd.com/resource/frontend/images/logo1.png", [0, 0, 0.3609, 1]),  # 자이에스앤디 — XI(logo.dev 에 없다)
    "003160": ("http://www.di.co.kr/images/common/h1_logo.gif", [0.455, 0.2, 0.322, 0.5467]),  # 디아이 — 'INSIGHT DI' 에서 DI 와 점 심볼
    "009190": ("http://www.daiyangmetal.com/korean/img/logo_mini.png", [0, 0, 0.2404, 1]),  # 대양금속 — 파란 원형 심볼(logo.dev 에 없다)
    "006110": ("https://www.sama-al.com/kor/img_sns_sama.png", [0.25, 0, 0.5, 1]),  # 삼아알미늄 — 남색 네모 SAMA(logo.dev 는 흐림)
    "006120": ("https://www.skdiscovery.com/images/logo_header_kr.png", [0, 0, 0.4, 1]),  # SK디스커버리 — SK 나비(나비 끝이 '디' 위로 넘어가 0.4 에서 자른다)
    "007390": ("https://www.naturecell.co.kr/images/naturecell-logo3.png", [0.0289, 0, 0.1302, 1]),  # 네이처셀 — 글자 로고의 N
    "030530": ("https://www.wonikholdings.kr/imgs/common/logo.png", [0, 0, 0.1928, 1]),  # 원익홀딩스 — 파란 타원 심볼
    "035250": ("https://www.high1.com/DATA/site/logo/www/logo.png", [0.0087, 0.5825, 0.2783, 0.4175]),  # 강원랜드 — 하이원 꽃(logo.dev 는 홍보 사진)
    "036540": ("https://www.sfasemicon.com/assets/images/www/common/logo.jpg", [0, 0, 0.4848, 1]),  # SFA반도체 — SFA
    "093370": ("https://www.foosungchem.com/images/logo.png", [0, 0, 0.4268, 1]),  # 후성 — 마름모 심볼
    "169330": ("https://www.embrain.com/resources/kor/pc/_asset/common/images/common/favicon.png", None),  # 엠브레인 — 화살표 심볼(logo.dev 는 유튜브 채널 그림)
    "323280": ("https://www.taesung2000.com/images/common/logo.png", [0, 0, 0.2095, 1]),  # 태성 — T 동그라미
    "395400": ("https://www.skreit.co.kr/static/images/meta.png", [0.07, 0.25, 0.865, 0.5025]),  # SK리츠 — SK 나비와 리츠(logo.dev 는 흐림)
    "457190": ("https://www.isuspecialtychemical.com/img/logo.png", [0, 0, 0.2619, 1]),  # 이수스페셜티케미컬 — ISU
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
    # 2026-10-19 — logo.dev 에 없는 종목(배지)을 홈페이지 그림으로 채웠다. 옛 이름 · 제품 · 다른 회사 이름이 적힌 로고와 호스팅 기본 그림은 뺐다.
    "0001A0": ("https://www.dyenergen.com/favicon-152.png", [0, 0, 1, 1]),  # 덕양에너젠
    "000590": ("http://www.chosunwelding.com/kr/images/logo.gif", None),  # CS홀딩스
    "000650": ("https://www.chunilexpress.com/images/main/logo.jpg", [0, 0, 0.14, 1]),  # 천일고속
    "000950": ("http://www.chonbang.co.kr/wp-content/uploads/2020/09/logo_top.png", None),  # 전방
    "001080": ("http://www.manhorope.com/images/common/logo.gif", None),  # MH머트리얼즈
    "0010F0": ("http://www.bowonchem.co.kr/image/logo.png?v=2", None),  # 보원케미칼
    "001380": ("http://www.sgglobal.co.kr/images/logo.gif", [0, 0, 1, 1]),  # SG글로벌
    "001840": ("http://www.ee-hwa.co.kr/2010/images/eehwa/eehwa_logo.PNG", None),  # 이화공영
    "001940": ("https://www.kiscoholdings.co.kr/holdings/_Img/Layout/logo_c.png", None),  # KISCO홀딩스
    "002030": ("https://www.asiaholdings.co.kr/skin/default/img/common/top_logo.png", [0, 0, 1, 1]),  # 아세아
    "002680": ("http://www.hantop.com/image/head/logo.png", [0, 0, 1, 1]),  # 한탑
    "002870": ("http://spinc.co.kr/images/sns_link.png", None),  # 신풍
    "003480": ("http://www.hhic-holdings.com/html/images/common/logo.gif", None),  # 한진중공업홀딩스
    "003580": ("http://hlb.softjs.kr/logo.png", [0, 0, 1, 1]),  # HLB글로벌
    "003780": ("https://www.cyc1963.com/theme/m/img/logo.png", None),  # 진양산업
    "004080": ("https://www.shinhung.co.kr/images/head/logo.png", [0, 0, 1, 1]),  # 신흥
    "004650": ("http://www.chethanol.com/homek/assets/images/common/logo.png", None),  # 창해에탄올
    "005820": ("http://www.wonlim.co.kr/file/logo.jpg", None),  # 원림
    "005860": ("http://hanilfeed.com/wp-content/uploads/2019/08/logo_s.png", None),  # 한일사료
    "006140": ("http://pjes.kjhhkh.gethompy.com/wp-content/uploads/2018/02/asgahjki.png", None),  # 피제이전자
    "006910": ("https://www.bosungpower.co.kr/images/main/flogo.jpg", None),  # 보성파워텍
    "007770": ("http://www.hanzinc.com/new/images/common/logo.png", None),  # 한일화학
    "008420": ("http://www.moonbaesteel.co.kr/asset/img/mb/mb_logo_new.png", None),  # 문배철강
    "009310": ("http://www.charmeng.com/img/common/logo.png", None),  # 참엔지니어링
    "009460": ("https://www.hanchangpaper.co.kr/img/logo_up.png", None),  # 한창제지
    "009520": ("https://www.poscomtech.com/resources/images/common/footer-logo.png", [0, 0, 1, 0.4231]),  # 포스코엠텍
    "009780": ("http://www.msckorea.com/_img/msc_logo1.png", [0, 0, 1, 1]),  # 엠에스씨
    "010100": ("https://www.koreamovenex.com/image/common/logo_on_n.png", [0, 0, 1, 1]),  # 한국무브넥스
    "010470": ("https://www.oricom.com/common/images/logo.gif", [0, 0, 1, 1]),  # 오리콤
    "010640": ("https://www.chinyangpoly.kr/img/main/logo.jpg", None),  # 진양폴리
    "011040": ("https://www.kdpharma.co.kr/img/common/2024_redesign_logo_1.png", None),  # 경동제약
    "012160": ("http://www.youngwire.com/kor/images/common/logo2.jpg", [0.0609, 0, 0.4213, 1]),  # 영흥
    "012210": ("http://www.sammimetal.com/images/common/logo_Sammi.jpg", None),  # 삼미금속
    "012320": ("https://www.kdinvest.co.kr/images/logo.jpg", None),  # 경동인베스트
    "012700": ("https://www.leadcorp.co.kr/logo192.png", [0, 0, 1, 1]),  # 리드코프
    "012790": ("https://www.sinilpharm.com/images/ci.png", None),  # 신일제약
    "013030": ("https://www.hy-lok.com/img/logo.png", [0, 0, 1, 1]),  # 하이록코리아
    "013700": ("http://www.camusenc.com/files/attach/xeicon/mobicon.png", [0, 0, 1, 1]),  # 까뮤이앤씨
    "014470": ("http://www.bubang.com/img/common/top_ci_black.png", None),  # 부방
    "015020": ("http://www.e-starco.co.kr/img/main_logo.gif", None),  # 이스타코
    "016250": ("https://sgcenc.co.kr/images/nav/new_logo2.png", [0, 0, 1, 1]),  # SGC E&C
    "016580": ("https://whanin.com/_theme/basic/img/ci.png", None),  # 환인제약
    "016740": ("https://www.idual.co.kr/theme/basic/img/layout/logo-b.png", [0, 0, 1, 1]),  # 두올
    "017480": ("https://www.samsteel.co.kr/images/inc/copy_logo.gif", [0, 0, 1, 1]),  # 삼현철강
    "017650": ("http://www.daelimpaper.co.kr/images/header/logo.png", None),  # 대림제지
    "017860": ("https://www.dsdansuk.com/include/images/logo_new.png", None),  # DS단석
    "017900": ("https://www.auk.co.kr/img/logo.png", None),  # 광전자
    "019010": ("http://www.venueg.com/images/common/logo.png", [0, 0, 1, 1]),  # 베뉴지
    "019550": ("https://www.sbik.co.kr/common/images/common/main_logo.gif", None),  # SBI인베스트먼트
    "021050": ("http://www.swbrass.co.kr/kor/images/common/logo.gif", None),  # 서원
    "021320": ("https://www.kccworld.net/images/common/logo.png", None),  # KCC건설
    "021650": ("https://cubic.co.kr:443/common/img_kr/main/flogo.png", [0, 0, 1, 1]),  # 한국큐빅
    "023000": ("http://www.samwon-steel.co.kr/common/img/logo.gif", None),  # 삼원강재
    "023910": ("https://www.daihan.com/images/inc/t_logo.png", None),  # 대한약품
    "024800": ("https://www.yoosungtns.co.kr/home/tns/base/img/logo_intro_menu.png", None),  # 유성티엔에스
    "025530": ("http://www.sjmholdings.co.kr/images/logo3_2025.gif", [0, 0, 1, 1]),  # SJM홀딩스
    "025890": ("https://www.hascokorea.co.kr:443/images/top_logo.png", None),  # 한국주강
    "026150": ("https://www.tuksu.co.kr/home/img/logo.jpg", [0, 0, 0.29, 1]),  # 특수건설
    "027710": ("http://www.dodrambnf.co.kr/html/images/main_logo_2.png", None),  # 팜스토리
    "029460": ("https://www.kct.co.kr/img/logo.png", None),  # 케이씨
    "030960": ("http://yangjisa.com/eng/images/header/h_logo.png", None),  # 양지사
    "032500": ("https://www.kmwinc.com/img/footer_logo.jpg", [0, 0, 1, 1]),  # 케이엠더블유
    "033200": ("https://www.moatech.co.kr/hd/top_menu/logo_bk.png", [0, 0, 1, 1]),  # 모아텍
    "033320": ("https://www.jchyun.com/Common/img/LOGO_D.png", None),  # 제이씨현시스템
    "034810": ("https://www.haesungind.co.kr/images/front/ko/web/img_logo.png", None),  # 해성산업
    "035200": ("http://www.plumbfast.co.kr/file/img/s_img/logo.gif", None),  # 프럼파스트
    "035810": ("https://www.easyholdings.co.kr/img/logo_main_200605.png", None),  # 이지홀딩스
    "036120": ("https://www.sci.co.kr/images/common/sci-og.png", None),  # 서울평가정보
    "036480": ("https://dsmbio.com/wp-content/uploads/2026/07/cropped-favicon-180x180.png", [0, 0, 1, 1]),  # 대성미생물
    "036560": ("https://www.kzpc.co.kr/img/common/ft_logo_2.png", None),  # KZ정밀
    "036710": ("https://www.simmtechholdings.co.kr/skin/images/gnb/holdings_logo.png", None),  # 심텍홀딩스
    "037230": ("https://www.hkpak.co.kr/img/logo_active.png", None),  # 한국팩키지
    "037330": ("https://www.inzidisplay.co.kr/img/common/og_img.jpg", [0, 0, 1, 1]),  # 인지디스플레
    "039310": ("https://www.sejoong.com/_img/comn/logo.gif", [0, 0, 1, 1]),  # 세중
    "039340": ("https://img.wownet.co.kr/wownet20/front/images/static/logo.png", [0, 0, 1, 1]),  # 한국경제TV
    "039560": ("https://www.dasannetworks.com/images/sns_link.png", None),  # 다산네트웍스
    "040350": ("https://www.curocom.com/images/logo/creosg.png", None),  # 크레오에스지
    "040610": ("http://www.sgng.com/img/logo_on.png", [0, 0, 1, 1]),  # SG&G
    "041190": ("https://www.wooricapital.co.kr/img/common/nav_logo.png", [0.083, 0.0556, 0.2988, 0.8333]),  # 우리기술투자
    "041460": ("https://www.crosscert.com/images/logo_bottom.gif", [0.2845, 0, 0.1724, 1]),  # 한국전자인증
    "041520": ("https://www.elckor.com/uploads/dropzone/2026/08/b151887f8f5328e8af1784685f3e8c52.png", None),  # 이엘씨
    "041910": ("https://www.polarisaipharma.com/ko/front/image/common/logo.png", None),  # 폴라리스AI파마
    "044180": ("https://www.kdcon.co.kr/images/main/menu_on_logo.png", [0, 0, 1, 1]),  # KD
    "044990": ("https://www.hnshightech.com/img/logo.png", [0, 0, 1, 1]),  # 에이치엔에스하이텍
    "046120": ("https://www.orbitech.co.kr/images/common/logo-footer.png", [0, 0, 1, 1]),  # 오르비텍
    "046940": ("https://www.woowonerd.com/new/common/images/title/ci.jpg", None),  # 우원개발
    "047820": ("https://chorokbaem.com/design/ko/images/newimg/t_logo.jpg", None),  # 초록뱀미디어
    "048410": ("https://cdn.imweb.me/thumbnail/20260122/bb52def5a2e38.png", [0, 0, 1, 1]),  # 현대바이오
    "049120": ("https://www.finednc.com/m/img/logo.png", [0, 0, 1, 1]),  # 파인디앤씨
    "049520": ("https://www.e-uil.com/images/main/logo.png", None),  # 유아이엘
    "049630": ("https://www.jysolutec.com/common/img/layout/logo.png", [0, 0, 1, 1]),  # 재영솔루텍
    "050120": ("http://www.escube.co.kr/images/main/head_logo.png", None),  # ES큐브
    "051490": ("https://www.naramnd.com/kor/image/layout/toplogo.jpg", None),  # 나라엠앤디
    "051780": ("https://www.curoholdings.com/images/logo/top_logo.png", [0, 0, 1, 1]),  # 큐로홀딩스
    "052300": ("https://www.oceaninw.co.kr/shh1/images/logo.jpg", [0, 0, 1, 1]),  # 오션인더블유
    "052900": ("http://kxhitech.com/theme/business/extend/sections/header/kmhhitech_header2/img/logo-b.png", [0, 0, 1, 1]),  # KX하이텍
    "054040": ("http://www.kci.co.kr/project/design/lnb/h_ci.png", None),  # 한국컴퓨터
    "054090": ("https://samjin.co.kr/favicon.png", [0, 0, 1, 1]),  # 삼진엘앤디
    "054210": ("https://www.elentec.co.kr/ko/images/logo.png", None),  # 이랜텍
    "054300": ("https://www.heshbon.com/files/attach/images/19295/8cc051055c38228ff14820daed3332ca.png", None),  # 팬스타엔터프라이즈
    "054940": ("https://www.exaenc.com/theme/basic/images/logo.png", [0, 0, 1, 1]),  # 엑사이엔씨
    "057680": ("https://delete.or.kr/img/new_logo_LR.png", None),  # 티사이언티픽
    "058400": ("https://www.knn.co.kr/images/logo_knn.png", [0, 0, 1, 1]),  # KNN
    "060540": ("https://www.satech.co.kr/images/logo.jpg", None),  # 에스에이티
    "060560": ("https://www.hchomecenter.co.kr/images/logo.gif?20170331", [0.014, 0.1556, 0.2651, 0.6889]),  # HC홈센타
    "064820": ("https://cape.co.kr/images/favicon.png", [0, 0, 1, 1]),  # 케이프
    "065130": ("https://www.topengnet.com/common/images/logo.png", None),  # 탑엔지니어링
    "065530": ("https://www.wiable.co.kr/images/common/logo.png", None),  # 와이어블
    "065770": ("https://cs-holdings.co.kr/wp-content/uploads/2020/08/logo.png", None),  # CS
    "067170": ("http://www.autech.co.kr/img/logo_simbol.png", [0, 0, 1, 1]),  # 오텍
    "067570": ("https://www.nvhkorea.com/Images/footer_logo.png", [0, 0, 1, 1]),  # 엔브이에이치코리아
    "067630": ("https://www.hlb-ls.com/include/images/common/logo.png", [0, 0, 0.5272, 1]),  # HLB생명과학
    "067730": ("http://www.logisys.co.kr/static/images/logisys_logo.jpg", [0.1167, 0.2794, 0.2167, 0.4559]),  # 로지시스
    "067770": ("http://www.sejints.co.kr/img/Common/logo.png", None),  # 세진티에스
    "067900": ("http://www.y-entec.co.kr/wp-content/uploads/2020/07/logo_footer.png", [0, 0, 0.32, 1]),  # 와이엔텍
    "069330": ("http://www.uidkorea.co.kr/file/img/s_img/logo.png", None),  # 유아이디
    "069510": ("https://www.estec.co.kr/kr/_Img/logo.png", None),  # 에스텍
    "073010": ("http://www.kspvalve.com/images/common/logo_kumkang.png", None),  # 케이에스피
    "075970": ("https://www.dkref.co.kr/img/m_logo.png", [0.006, 0, 0.4167, 1]),  # 동국알앤에스
    "077360": ("https://www.dshm.co.kr/images/logo.png", [0.1361, 0, 0.355, 1]),  # 덕산하이메탈
    "081150": ("http://www.tplex.co.kr/images/common/f_logo.png", [0, 0, 1, 1]),  # 티플랙스
    "083930": ("http://www.avaco.co.kr/pages/layout/A_layout/A_type/images/common/m_logo.png", [0, 0, 1, 1]),  # 아바코
    "086670": ("https://www.superlok.com/kr/_Img/Intro/intro_logo.png", None),  # 비엠티
    "088390": ("http://www.innoxcorp.com/img/common/logo.png", [0, 0, 1, 1]),  # 이녹스
    "089470": ("https://www.hdc-hyundaiep.com/assets/user/img/common/HDCEP-logo.png", [0, 0, 0.5736, 1]),  # HDC현대EP
    "089790": ("https://www.jtcorp.co.kr/img/logo.png?var", [0, 0, 1, 1]),  # 제이티
    "089970": ("https://www.vmsemi.com/kor/img/ci.jpg", [0, 0, 1, 1]),  # 브이엠
    "090370": ("https://www.metalabs.co.kr/new/kor/images/logo_.png", [0, 0, 0.2241, 1]),  # 메타랩스
    "092070": ("https://www.dnfsolution.com/html_new/images/layout/logo_on.png", [0, 0, 1, 1]),  # 디엔에프
    "092130": ("https://www.ecredible.co.kr/images/common/icon-512.png", [0, 0, 1, 1]),  # 이크레더블
    "092230": ("https://kpxholdings.com:443/_public/images/main/main_logo_kpxch.jpg", None),  # KPX홀딩스
    "095270": ("https://wavetc.com/wp-content/uploads/2024/09/logo.png", [0, 0, 1, 1]),  # 웨이브일렉트로
    "097780": ("http://ecovoltdynamics.co.kr/images/common/h1_logo_1.jpg", None),  # 에코볼트
    "099520": ("http://www.itxai.com/KR/images/logo_dg-itx.png", [0, 0, 1, 1]),  # DGI
    "100660": ("https://www.smiltd.co.kr/wp_images/logo.gif", [0, 0, 1, 1]),  # 서암기계공업
    "104700": ("https://www.kisco.co.kr/kor/_Img/Layout/logo_c.png", None),  # 한국철강
    "104830": ("https://www.wimco.co.kr/views/_layout/bootstrap/images/header/logo.png", None),  # 원익머트리얼즈
    "105330": ("http://www.knwkorea.com/images/common/logo.gif", [0, 0, 1, 1]),  # 케이엔더블유
    "106190": ("http://www.htpharm.com/images/common/f_logo.gif", [0, 0, 0.2952, 1]),  # 하이텍팜
    "106240": ("https://www.finetechnix.com/html/_img/comm/logo.png", [0, 0, 1, 1]),  # 파인테크닉스
    "111710": ("http://www.muangc.co.kr/images_cc/logo.png", None),  # 남화산업
    "115500": ("https://kcins.co.kr/brand/favicon-180.png", [0, 0, 1, 1]),  # 케이씨에스
    "115570": ("http://www.star-flex.com/new/img/logo_img.png", [0, 0, 1, 1]),  # 스타플렉스
    "120030": ("http://www.chosunwelding.com/kr/images/logo.gif", None),  # 조선선재
    "120240": ("http://www.daejungchem.co.kr/images/logo.png", None),  # 대정화금
    "123750": ("https://www.altonsports.co.kr/frontend/assets/images/icons/header_ci.png", [0, 0, 1, 1]),  # 알톤
    "125490": ("http://www.hlcast.co.kr/images/logo.png", [0.0549, 0, 0.3765, 1]),  # 한라캐스트
    "126720": ("https://www.soosanind.co.kr/apple-icon-60x60.png", [0, 0, 1, 1]),  # 수산인더스트리
    "131220": ("https://mall.daihan-sci.com/images/logo.png", [0, 0, 1, 1]),  # 대한과학
    "131400": ("https://evam.co.kr/img/logo-evam.png", None),  # 이브이첨단소재
    "136150": ("http://www.woniltni.co.kr/img/logo.png", None),  # 원일티엔아이
    "138360": ("http://www.hjfm.co.kr/image/bottom_logo_Nrobotics.png", None),  # 앤로보틱스
    "140430": ("https://www.catis.co.kr/img/logo2.png", [0, 0, 1, 1]),  # 카티스
    "142210": ("https://unitrontech.com/wp-content/uploads/2017/07/unitrontech_logo.png", None),  # 유니트론텍
    "144960": ("https://www.newpower.co.kr/sub/img/logo.jpg", [0, 0, 1, 1]),  # 뉴파워프라즈마
    "147760": ("http://www.pmt23.com/img/footer_logo_color_R2.png", [0, 0, 1, 1]),  # 피엠티
    "149950": ("https://www.avatec.co.kr/pages/layout/images/common/logo.png", [0, 0, 1, 1]),  # 아바텍
    "149980": ("https://www.hironic.com/static/image/common/logo.png", [0, 0, 1, 1]),  # 하이로닉
    "155650": ("https://www.ymc-inc.com/default/img/logo_bottom.png", [0, 0, 1, 1]),  # 와이엠씨
    "160980": ("http://cymechsnew.helloweb.co.kr/wp-content/uploads/2015/07/logo.png", [0, 0, 1, 1]),  # 싸이맥스
    "161580": ("https://www.philoptics.com/images/common/logo.png", None),  # 필옵틱스
    "171120": ("https://www.lctkorea.com/static/imgs/front/cw/icon/taekyung_logo.png", None),  # 라이온켐텍
    "179900": ("https://www.utikorea.com/ko/front/image/common/logo.png", [0, 0, 1, 1]),  # 유티아이
    "198940": ("https://www.hanjoolightmetal.com/images/main_company_logo_m.png", [0, 0, 1, 1]),  # 한주라이트메탈
    "211050": ("https://www.incar.co.kr/files/attach/xeicon/mobicon.png?20221020112035", [0, 0, 1, 1]),  # 인카금융서비스
    "214610": ("https://rolling-stone.co.kr/images/common/logo_R2_c.png?ver=251104", None),  # 롤링스톤
    "220260": ("http://chemtros.com/wp-content/uploads/logo.png", [0, 0, 1, 1]),  # 켐트로스
    "222110": ("https://pangen.com/layout/images/common/logo_on.png", None),  # 팬젠
    "224060": ("http://thecodi.kr/wp-content/uploads/2022/12/logo_thecodi-e1670395721193.png", None),  # 더코디
    "225430": ("https://www.kmkmp.com/web/upload/share-image-1-c69cf7d5442ac29c96267d79c40fbda2.jpg", [0, 0, 1, 1]),  # 케이엠제약
    "225530": ("https://www.hcbokwangindustry.co.kr/assets/images/logo.png?20170331", [0, 0.2951, 0.3424, 0.4098]),  # HC보광산업
    "227950": ("http://www.n2tech.kr/images/_main/logo_2_211202.gif", [0, 0, 1, 1]),  # 엔투텍
    "238490": ("https://www.hims.co.kr/img/body/logo.png", [0, 0, 0.5968, 1]),  # 힘스
    "240550": ("https://dbneedle.com/theme/response/img/logo.png", None),  # 동방메디컬
    "241770": ("https://www.mecaro.com/assets/images/main/logo-color.png", [0, 0, 1, 1]),  # 메카로
    "260660": ("https://www.arlico.co.kr/images/inc/favicon.png", [0, 0, 1, 1]),  # 알리코제약
    "260970": ("http://www.isnd.co.kr/images/logo.png", None),  # 에스앤디
    "263770": ("https://u-st.co.kr/assets/favicon/apple-touch-icon.png", [0, 0, 1, 1]),  # 유에스티
    "267320": ("https://www.naintec.co.kr/images/logo_m.png", None),  # 나인테크
    "282880": ("https://cowinrobotics.com/img/common/logo.png", None),  # 코윈로보틱스
    "284620": ("https://www.kainosmedicine.com/images/user/common/logo.jpg", None),  # 카이노스메드
    "286750": ("https://ns-am.com/theme/nanobrick/images/favicon.png", [0, 0, 1, 1]),  # 나노실리칸첨단소재
    "287840": ("https://intocell.com/img/logo.png", None),  # 인투셀
    "290520": ("https://www.lcd.co.kr/img/logo.png", None),  # 신도기연
    "307280": ("https://www.wonbiogen.co.kr/kor/images/footer_logo.png", [0, 0, 1, 1]),  # 원바이오젠
    "310870": ("https://www.dycauto.com/images/common/h1_logo_bk.png", [0, 0, 0.395, 1]),  # 디와이씨
    "311320": ("http://www.goelement.co.kr/images/common/footer_logo.png", [0, 0, 1, 1]),  # 지오엘리먼트
    "311390": ("https://framerusercontent.com/images/waECj35I34SaUzphOvgwDyGvg.png", None),  # 네오크레마
    "314140": ("https://rpbio.co.kr/images/img_logo.png", [0, 0, 1, 1]),  # 알피바이오
    "317450": ("https://myunginph.co.kr/design/ko/images/default/logo.png", None),  # 명인제약
    "317530": ("https://cdn.imweb.me/thumbnail/20260402/6cd255fb4584c.png", [0, 0, 1, 1]),  # 에피소드컴퍼니
    "323350": ("https://www.nexview.co.kr/images/logo.png", None),  # 다원넥스뷰
    "336680": ("https://www.toprun.co.kr/images/common/logo_on.png", None),  # 탑런토탈솔루션
    "348350": ("https://www.withtech.co.kr/kr_m/img/gnbLogo.png", None),  # 위드텍
    "352940": ("http://www.enbio.co.kr/img/head/logo_k.jpg", None),  # 인바이오
    "355690": ("https://ecimg.cafe24img.com/pg1608b21617766050/iatum3322/web/upload/free_design/head_logo.png", [0, 0, 1, 1]),  # 에이텀
    "364950": ("http://www.aik.co.kr/RAD/PEG/logo_17467761292855.png", None),  # 에이아이코리아
    "365330": ("https://www.systeeltech.com/image/main/logo2.png", [0, 0, 1, 1]),  # 에스와이스틸텍
    "372320": ("https://curocellbtx.com/wp-content/uploads/2023/10/cropped-favicon-180x180.png", [0, 0, 1, 1]),  # 큐로셀
    "382800": ("https://www.gnbseco.com/images/common/logo.png", [0, 0, 1, 1]),  # 지앤비에스 에코
    "402490": ("http://www.greenresource.kr/logo.jpg", None),  # 그린리소스
    "412350": ("https://static.wixstatic.com/media/593654_fd622b3f26f445818aa95177d6a45477%7Emv2.png/v1/fill/w_180%2Ch_180%2Clg_1%2Cusm_0.66_1.00_0.01/593654_fd622b3f26f445818aa95177d6a45477%7Emv2.png", [0, 0, 1, 1]),  # 레이저쎌
    "416180": ("http://www.shinsungst.co.kr/images/common/logo.png", [0.0114, 0.0238, 0.2015, 0.9048]),  # 신성에스티
    "417840": ("http://www.justem.co.kr/main/img/logo.png", None),  # 저스템
    "420570": ("https://www.j2kbio.com/theme/basic/img/layout/hd_logo_h.png", [0, 0, 1, 1]),  # 제이투케이바이오
    "424980": ("https://lh3.googleusercontent.com/pkilLrwfrAJYjLwwvIqpuXcmvTX4kBtQWBkdI0ByIjc1Sb0iczop31s0dFjUu7zvkAV1MPvSmQgN6KS27lIHm4mEA-OD6u--ZbQEnS7v9pPp82ah5Cc-Lg", [0.0059, 0, 0.3887, 1]),  # 마이크로투나노
    "432470": ("https://knssystem.com/design/ko/images/newimg/logo.png", [0, 0, 1, 1]),  # 케이엔에스
    "448730": ("http://www.samsungfnreit.com/img/header_fixed_logo.png", None),  # 삼성FN리츠
    "457370": ("https://www.hanchem.net/public/images/layout/logo.png", None),  # 한켐
    "458650": ("https://www.e-sungwoo.co.kr/img/footer_logo.jpg", [0, 0, 0.3361, 1]),  # 성우
    "460850": ("https://www.dongkukcm.com/assets/ko/images/common/logo.png", None),  # 동국씨엠
    "460930": ("https://www.hyms.kr/Images/toplogo.jpg", None),  # 현대힘스
    "465770": ("https://www.stxgreenlogis.co.kr/images/common/h_logo_footer.png", [0, 0, 0.3015, 0.9118]),  # STX그린로지스
    "475430": ("https://www.kistron.com/images/logo.png", None),  # 키스트론
    "475580": ("https://cdn.imweb.me/thumbnail/20230818/2c75ed14a707d.png", [0, 0, 1, 1]),  # 에이럭스
    "476830": ("https://www.rznomics.com/images/main/h-logo.png", None),  # 알지노믹스
    "479960": ("http://www.wns21.co.kr/images/logo.gif", None),  # 위너스일렉
    "900070": ("http://globalsmtech.com/korean/img/main/logo.png", None),  # 글로벌에스엠
    "900250": ("http://www.crystalnewmaterial.com/image/common/logo.png", [0, 0, 1, 1]),  # 크리스탈신소재
    "900270": ("http://hengsheng.co.kr/wp-content/uploads/2016/07/hs-logo-2.png", None),  # 헝셩그룹
    # 2026-10-20 — 위와 같은 종목 중 logo.dev 에 없거나 맞지 않는 곳은 새 홈페이지의 그림으로.
    "007370": ("https://www.jinyangpharm.com/theme/102114/kr/images/main/header_logo.png", None),  # 진양제약
    "024900": ("https://dydeokyang.co.kr/wp-content/themes/dyauto/favicons/apple-touch-icon.png", [0, 0, 1, 1]),  # 디와이덕양
    "033340": ("https://www.gpin.co.kr/include/images/topmenu_ci.gif", [0, 0, 1, 1]),  # 좋은사람들
    "037350": ("https://www.sungdokorea.com/images/common/new_logo_250916.png", [0, 0, 1, 1]),  # 성도이엔지
    "038620": ("https://www.wizcorp.co.kr/img/logo.png", [0, 0, 1, 1]),  # 위즈코프
    "046440": ("https://www.mobilians.co.kr/mpay/images/2026/og_img.jpg", [0.17, 0.3, 0.66, 0.45]),  # KG파이낸셜
    "079900": ("https://www.junjin.com/images/common/logo.png", [0, 0, 1, 1]),  # 전진건설로봇
    "081180": ("https://www.seceng.co.kr/wp-content/uploads/2016/04/cropped-icon-180x180.png", [0, 0, 1, 1]),  # 쎄크
    "088290": ("https://www.ewonseat.com/theme/ewon/img/logo2.png", None),  # 이원컴포텍
    "094970": ("http://www.jmtkorea.com/img/logo.gif", None),  # 제이엠티
    "101160": ("http://www.worldexint.com/img/common/logo.jpg", None),  # 월덱스
    "123700": ("https://www.sjmflex.com/theme/responsive_sjm/include/img/sns_logo.png", [0, 0, 1, 1]),  # SJM
    "129920": ("http://www.topdsht.com/images/apple-touch-icon.png", [0, 0, 1, 1]),  # 대성하이텍
    "134060": ("http://www.e-future.kr/img/efuture_logo.jpg", None),  # 이퓨쳐
    "137940": ("https://www.nexteye.com/layout/img/logo.png", [0, 0, 1, 1]),  # 넥스트아이
    "171010": ("https://www.ramtech.co.kr/images/common/allmenu_logo.png", None),  # 램테크놀러지
    "179530": ("http://www.adbiotech.com/img/favicon/apple-touch-icon.png", [0, 0, 1, 1]),  # 애드바이오텍
    "210120": ("https://cdn.imweb.me/thumbnail/20260917/60785bc5a615b.png", [0, 0, 1, 1]),  # 빅텐츠
    "215790": ("https://innoinstrument.com/wp-content/uploads/2023/10/inno-favicon-green.png", [0, 0, 1, 1]),  # 이노인스트루먼트
    "290550": ("https://www.dkttech.co.kr/images/main/visual_logo_03.png", [0, 0, 1, 1]),  # 디케이티
    "308170": ("https://centralmotek.co.kr/img/head/head_logo2.png", [0, 0, 0.4805, 1]),  # 씨티알모빌리티
    "340440": ("https://www.serimbng.co.kr/upload/siteset/og_img.png", None),  # 세림B&G
    "373110": ("https://www.xcell.co.kr/img/common/main_logo.png", [0, 0, 1, 1]),  # 엑셀세라퓨틱스
    "377330": ("http://www.egtronics.co.kr/html/_skin/img/common/logo_header_black.png", None),  # 이지트로닉스
    "010580": ("https://smbexel.com/images/intro_logo.png", [0.0681, 0.25, 0.3362, 0.5]),  # 에스엠벡셀 — SM(logo.dev 는 깨진 픽셀 그림)
    "417200": ("https://www.lsmaterials.co.kr/ico/apple-icon-180x180.png", [0, 0, 1, 1]),  # LS머트리얼즈 — LS(logo.dev 는 긴 글자)
    "456160": ("https://www.g2gbio.com/images/common/header_logo_color.png", None),  # 지투지바이오
    "462520": ("https://www.chosunref.co.kr/assets/images/common/logo-gray.png", None),  # 조선내화
    "464580": ("https://www.dot-mill.com/_File/siteMng//ogImageFile_1690284621_0.jpg", [0, 0, 1, 1]),  # 닷밀
    "900120": ("http://www.ckhfnh.co.kr/i/logo_cxi.png", [0, 0, 1, 1]),  # 씨엑스아이
    "900260": ("http://www.rothwell.tech/images/common/logo.png", None),  # 로스웰
}

PREFER_DOMAIN: set[str] = {
    "066570",  # LG전자
    "066575",  # LG전자우
    "007660",  # 이수페타시스
    "281740",  # 레이크머티리얼즈 — lake-led.com(상자 부채꼴 심볼)
}

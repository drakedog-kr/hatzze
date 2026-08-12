"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { track } from "@/lib/ga";
import { C, Icon, R } from "./ui";
import { BetaBadge, LogoLockup } from "./Logo";
import Footer from "./Footer";
import GaEvents from "./GaEvents";
import { TipTap } from "./TipTap";

// sub 는 본문 헤더의 페이지 부제다(목업이 사이드바 로고 밑에 있던 문장을 여기로 옮겼다).
// 사이드바 항목에는 안 쓰이고 PageHeader 만 읽는다.
// badge 는 제목 옆 회색 알약이다(콘솔 리디자인). "이 화면이 몇 개를 다루나"를 제목 줄에서
// 바로 말해 준다 — 부제 문장으로 적으면 읽어야 알 수 있다. 없는 화면엔 안 그린다.
type Glyph = (props: { size?: number; dimmed?: boolean }) => React.ReactElement;

/**
 * 카더라 서브 항목의 표식 둘(호랑이·독수리)은 **시안 이미지를 벡터로 뜬 것**이다.
 *
 * ⭐⭐ 처음엔 맨손으로 좌표를 찍었는데 독수리 하나를 열 번 넘게 고쳐도 매번 근사치였다
 * ("삐죽삐죽 이상하다"). potrace 로 원본 윤곽을 그대로 뜨니 한 번에 끝났다.
 * **시안이 있으면 눈대중으로 옮기지 말고 벡터로 뜰 것.**
 *
 * 재현 방법(스크래치패드에 도구가 있다):
 *   node vectorize/trace.mjs <이미지> [--flip] [--threshold 128]
 *   → traced.jsx(붙여넣을 JSX) · preview.png(18/20/32/96px 를 라이트·다크로)
 *
 * transform 은 원본 좌표를 24 박스로 옮기는 것이다(여백을 잘라 가운데 맞춤).
 * 경로 좌표를 직접 고치지 말고 **시안을 고쳐 다시 뜰 것** — 손으로 만지면 원본과 갈린다.
 *
 * 이모지(🇰🇷 🇺🇸)를 그대로 안 쓰는 이유: currentColor 를 안 따라 활성 알약(파랑) 위에서
 * 아이콘 열이 깨지고, 플랫폼마다 그림이 달라진다(🇰🇷 는 윈도우에서 글자 "KR").
 *
 * ⚠️ 두 시안 모두 출처가 확인되지 않았다. 저장소가 public 이라 라이선스를 확인하거나,
 *    비율만 참고하고 세부를 다르게 다듬어야 할 수 있다.
 */

/**
 * 호랑이 — 국장. 앞서 쓰던 태극(🇰🇷 에서 태극만 남긴 것)을 갈아 끼웠다.
 *
 * 태극은 "대한민국"이지 "시장"이 아니었다. 옆자리 미장이 독수리(국조)라서 둘이 짝이
 * 아니라 국기 대 동물로 어긋나 있었다. 호랑이는 한반도의 상징 동물이라 같은 결이 된다.
 *
 * 18px(서브 항목의 실제 크기)에서 줄무늬가 뭉개지지만 고양잇과 얼굴 윤곽은 남는다 —
 * 부품이 흩어진 그림(여신상)은 이 크기에서 얼룩이 됐지만 이건 이마·눈·주둥이가
 * 한 덩어리로 모여 있어 버틴다. 바꾸기 전에 compare.mjs 로 18·20px 을 직접 보고 골랐다.
 */
function KrTigerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      <g transform="translate(1.200 2.103) scale(0.17119) translate(-136.827 -91.429)">
        <path fillRule="evenodd" d="M 141 93.752 C 137.528 95.486, 137.498 95.558, 137.204 102.837 C 136.827 112.209, 138.891 119.409, 143.427 124.548 C 147.168 128.784, 147.835 128.272, 145.612 122.872 C 143.386 117.465, 142.776 111.546, 143.982 107.067 C 146.122 99.118, 154.281 97.042, 163.963 101.981 C 168.426 104.258, 169 104.383, 169 103.077 C 169 101.090, 163.377 95.622, 159.541 93.880 C 154.331 91.513, 145.602 91.453, 141 93.752 M 240.459 93.826 C 236.608 95.626, 231 101.111, 231 103.077 C 231 104.303, 230.994 104.304, 235.800 101.983 C 245.922 97.092, 253.870 99.091, 256.018 107.067 C 257.224 111.546, 256.614 117.465, 254.388 122.872 C 252.167 128.267, 252.832 128.785, 256.558 124.564 C 260.907 119.639, 263 112.743, 263 103.342 C 263 96.539, 262.820 95.928, 260.329 94.296 C 256.343 91.684, 245.584 91.429, 240.459 93.826 M 189.500 96.736 C 186.750 97.722, 183.375 99.361, 182 100.379 L 179.500 102.228 182 101.585 C 187.243 100.236, 205.734 99.783, 212.452 100.838 C 216.275 101.439, 219.566 101.768, 219.764 101.569 C 219.963 101.371, 217.587 99.967, 214.485 98.449 C 207.108 94.840, 196.768 94.131, 189.500 96.736 M 192.780 107.030 C 187.468 107.925, 178.204 111.907, 174.313 114.969 C 172.892 116.086, 171.903 117, 172.115 117 C 172.327 117, 176.027 116.325, 180.338 115.500 C 184.649 114.675, 193.497 114, 200 114 C 206.503 114, 215.351 114.675, 219.662 115.500 C 223.973 116.325, 227.673 117, 227.885 117 C 228.870 117, 223.045 113.044, 219.144 111.063 C 214.769 108.842, 203.234 105.948, 199.500 106.135 C 198.400 106.190, 195.376 106.593, 192.780 107.030 M 154.052 127.215 C 155.349 130.062, 159.862 133, 162.938 133 C 164.309 133, 165.798 134.238, 167.119 136.476 C 169.280 140.140, 174.143 142.298, 177.976 141.296 C 179.310 140.947, 180 141.253, 180 142.195 C 180 143.783, 183.591 148, 184.944 148 C 186.137 148, 185.185 140.405, 183.344 135.239 C 182.509 132.895, 180.853 130.439, 179.663 129.782 C 178.473 129.124, 172.775 128.054, 167 127.404 C 161.225 126.754, 155.698 125.893, 154.717 125.491 C 153.137 124.844, 153.061 125.041, 154.052 127.215 M 243.500 125.931 C 242.400 126.373, 237.450 127.068, 232.500 127.475 C 221.287 128.397, 218.631 129.697, 216.659 135.229 C 214.815 140.403, 213.862 148, 215.056 148 C 216.409 148, 220 143.783, 220 142.195 C 220 141.253, 220.690 140.947, 222.024 141.296 C 225.857 142.298, 230.720 140.140, 232.881 136.476 C 234.202 134.238, 235.691 133, 237.062 133 C 240.089 133, 244.643 130.078, 245.893 127.335 C 247.024 124.853, 246.681 124.652, 243.500 125.931 M 141.710 145.261 C 140.176 150.342, 138.938 156.006, 138.960 157.846 C 139.013 162.259, 141.602 166.471, 145.580 168.613 C 148.070 169.954, 148.937 171.203, 149.404 174.122 C 150.162 178.867, 153.350 182.518, 158.500 184.538 L 162.500 186.107 158.774 182.803 C 154.878 179.349, 153 175.617, 153 171.329 C 153 169.932, 151.887 167.466, 150.526 165.849 C 147.234 161.936, 145.782 156.121, 146.586 150.064 C 147.270 144.904, 146.384 135.992, 145.189 136.011 C 144.810 136.017, 143.245 140.180, 141.710 145.261 M 253.440 140.554 C 253.064 143.059, 253.053 147.338, 253.414 150.064 C 254.218 156.121, 252.766 161.936, 249.474 165.849 C 248.113 167.466, 247 169.932, 247 171.329 C 247 175.637, 245.114 179.360, 241.226 182.724 L 237.500 185.948 241.320 184.785 C 246.064 183.340, 249.813 179.022, 250.601 174.096 C 251.063 171.205, 251.937 169.950, 254.420 168.613 C 258.398 166.471, 260.987 162.259, 261.040 157.846 C 261.084 154.162, 255.911 136.029, 254.811 136.011 C 254.432 136.005, 253.815 138.049, 253.440 140.554 M 152 139.007 C 152 140.036, 153.840 143.005, 156.090 145.603 L 160.179 150.329 159.495 158.055 C 158.725 166.754, 159.650 169.180, 164.921 172.294 L 167.927 174.070 166.472 170.588 L 165.017 167.106 169.259 169.031 C 171.591 170.090, 174.625 170.946, 176 170.934 C 178.259 170.914, 178.139 170.721, 174.761 168.938 C 169.346 166.078, 167.766 163.034, 167.211 154.385 C 166.684 146.177, 167.364 147.121, 157.250 140.548 C 152.669 137.570, 152 137.374, 152 139.007 M 242.500 140.578 C 239.750 142.433, 236.548 144.612, 235.385 145.420 C 233.641 146.632, 233.186 148.205, 232.789 154.385 C 232.234 163.034, 230.654 166.078, 225.239 168.938 C 221.861 170.721, 221.741 170.914, 224 170.934 C 225.375 170.946, 228.409 170.090, 230.741 169.031 L 234.983 167.106 233.528 170.588 L 232.073 174.070 235.079 172.294 C 240.350 169.180, 241.275 166.754, 240.505 158.055 L 239.821 150.329 243.910 145.603 C 246.160 143.005, 248 140.006, 248 138.939 C 248 137.873, 247.887 137.046, 247.750 137.103 C 247.613 137.160, 245.250 138.724, 242.500 140.578 M 185.504 158.294 C 184.325 161.107, 185.703 167.055, 188.132 169.641 C 189.349 170.936, 191.841 172.536, 193.672 173.198 C 195.502 173.860, 196.997 174.649, 196.993 174.951 C 196.980 175.984, 190.503 179.780, 186.693 180.987 C 182.955 182.171, 176.691 181.962, 172.250 180.505 C 170.134 179.811, 170 180.043, 170 184.405 C 170 187.422, 171.049 191.357, 173 195.660 C 174.650 199.299, 176 203.330, 176 204.617 C 176 206.750, 176.221 206.856, 178.500 205.818 C 180.403 204.951, 182.679 204.996, 188.033 206.006 C 193.311 207.002, 195.352 207.048, 196.210 206.190 C 197.069 205.331, 196.445 204.666, 193.709 203.523 C 191.704 202.685, 189.357 202, 188.492 202 C 184.627 202, 178.823 197.823, 176.947 193.691 C 173.707 186.555, 173.847 186.398, 184.250 185.481 C 195.937 184.451, 204.063 184.451, 215.750 185.481 C 226.153 186.398, 226.293 186.555, 223.053 193.691 C 221.177 197.823, 215.373 202, 211.508 202 C 210.643 202, 208.296 202.685, 206.291 203.523 C 203.555 204.666, 202.931 205.331, 203.790 206.190 C 204.648 207.048, 206.689 207.002, 211.967 206.006 C 217.321 204.996, 219.597 204.951, 221.500 205.818 C 223.779 206.856, 224 206.750, 224 204.617 C 224 203.330, 225.350 199.299, 227 195.660 C 228.951 191.357, 230 187.422, 230 184.405 C 230 180.043, 229.866 179.811, 227.750 180.505 C 223.309 181.962, 217.045 182.171, 213.307 180.987 C 209.497 179.780, 203.020 175.984, 203.007 174.951 C 203.003 174.649, 204.498 173.860, 206.328 173.198 C 211.271 171.411, 214.155 167.806, 214.731 162.693 C 215.036 159.989, 214.796 157.992, 214.115 157.571 C 213.437 157.152, 213 157.666, 213 158.885 C 213 159.987, 211.914 162.151, 210.587 163.694 C 208.317 166.333, 207.697 166.500, 200.192 166.500 C 191.232 166.500, 188.659 165.139, 187.113 159.581 C 186.399 157.017, 186.129 156.801, 185.504 158.294" />
      </g>
    </svg>
  );
}

/** 독수리 — 미장. 위 주석의 방법으로 뜬 것이다. */
function EagleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      <g transform="translate(3.702 1.200) scale(0.05179) translate(-329.519 -280.902)">
        <path fillRule="evenodd" d="M 330.446 282.610 C 330.869 283.650, 334.044 292.150, 337.504 301.500 C 348.762 331.929, 374.872 402.589, 389.975 443.500 C 414.288 509.354, 417.303 517.488, 417.517 517.777 C 417.629 517.929, 432.832 508.770, 451.302 497.422 L 484.882 476.790 485.643 471.145 C 486.061 468.040, 486.408 456.950, 486.412 446.500 C 486.422 424.362, 485.089 417.736, 477.544 402.406 C 468.715 384.468, 471.006 386.510, 398.513 332 C 362.306 304.775, 332.006 282.100, 331.180 281.610 C 329.984 280.902, 329.835 281.105, 330.446 282.610 M 621.464 401.659 C 606.634 411.372, 565.700 438.206, 530.500 461.290 C 495.300 484.375, 457.154 509.391, 445.732 516.881 C 434.310 524.371, 416.751 535.900, 406.713 542.500 C 396.675 549.100, 377.564 561.632, 364.244 570.348 C 329.519 593.072, 329.974 592.288, 330.049 629.285 L 330.098 653.500 332.482 647.307 C 342.390 621.566, 364.769 607.483, 385.673 613.832 C 404.152 619.445, 415.380 632.628, 415.277 648.592 C 415.226 656.504, 412.753 665.226, 408.226 673.457 C 405.577 678.274, 405.325 678.446, 399.324 679.523 C 391.997 680.839, 390 682.252, 390 686.120 C 390 688.859, 396.028 697, 398.056 697 C 398.509 697, 399.019 695.323, 399.190 693.273 C 399.586 688.511, 402.313 687.035, 410.750 687.015 C 418.267 686.997, 421 688.993, 421 694.500 C 421 696.425, 421.380 698, 421.845 698 C 423.221 698, 425.818 694.679, 427.397 690.900 C 429.261 686.439, 427.904 683.218, 423.157 680.838 C 421.334 679.923, 419.660 678.993, 419.437 678.770 C 419.215 678.548, 421.499 675.820, 424.513 672.708 C 430.460 666.568, 435.934 658.543, 437.957 653 C 438.659 651.075, 439.519 646.578, 439.867 643.006 L 440.500 636.512 447.824 645.215 C 451.988 650.165, 457.308 655.249, 460.157 657.002 C 469.230 662.584, 471.378 662.774, 533.750 663.483 C 565.237 663.841, 590.974 663.766, 590.942 663.317 C 590.910 662.868, 573.343 651.025, 551.903 637 C 487.875 595.115, 484.511 592.885, 484.236 592.134 C 483.964 591.393, 490.074 589.566, 536.500 576.502 C 566.649 568.019, 576.724 563.793, 589.586 554.232 C 607.083 541.225, 620.526 522.226, 626.953 501.416 C 628.659 495.892, 632.850 474.687, 646.105 404.500 C 647.767 395.700, 649.372 387.488, 649.672 386.250 C 649.972 385.012, 649.814 384, 649.322 384 C 648.830 384, 636.294 391.947, 621.464 401.659" />
      </g>
    </svg>
  );
}

// 서브 항목. href 가 없으면 아직 페이지가 없는 예고 항목이라 링크가 아니라 <div> 로 그린다.
// sub 는 그 서브 페이지의 본문 머리(PageHeader)가 쓸 한 줄이다. 부모와 주소가 같은
// 서브(국장 → /kadera)에는 두지 않는다 — 부모가 이미 자기 문장을 갖고 있다.
type NavChild = { label: string; href?: string; Glyph: Glyph; badge?: string; tip?: string; sub?: string };

// icon 은 Material Symbols 이름, Glyph 는 직접 그린 SVG 다(폰트에 없는 것 — 태극·성조·개미).
// 둘 중 하나만 있으면 된다. NavGlyph 가 Glyph 를 우선한다.
type NavItem = {
  href: string;
  label: string;
  icon?: string;
  Glyph?: Glyph;
  sub: string;
  badge?: string;
  children?: NavChild[];
};

const NAV: NavItem[] = [
  { href: "/", label: "시장 브리핑", icon: "monitoring", sub: "지표 25개로 잰 오늘의 시장 온도", badge: "25개 지표" },
  // 카더라가 국장·미장 둘로 갈린다. **부모는 그대로 두고 밑에 서브 항목을 단다** —
  // 부모를 국장으로 바꿔 버리면 카더라라는 이름이 사이드바에서 사라지고, 나중에 시장을
  // 하나 더 붙일 자리도 없어진다.
  //
  // 서브의 국장이 부모와 같은 /kadera 를 가리키는 건 의도다. 부모는 구역의 대문이고
  // 그 대문을 열면 나오는 게 국장이다(카테고리는 라우트가 아니다). 주소를 안 옮기는 이유는
  // 구글 색인이 이미 그 주소로 끝나 있어서다.
  {
    href: "/kadera",
    label: "카더라 리포트",
    icon: "forum",
    sub: "주식 텔레그램에서 무엇이 회자되는지",
    children: [
      { label: "국장 카더라", href: "/kadera", Glyph: KrTigerIcon },
      {
        label: "미장 카더라",
        href: "/kadera/us",
        Glyph: EagleIcon,
        sub: "미국 시장에선 무엇이 화제인지",
      },
    ],
  },
  { href: "/mdd", label: "MDD 정밀분석", icon: "trending_down", sub: "고점에서 얼마나 내려왔고 언제 회복했을까" },
];

// 외부(텔레그램) 링크라 NAV 배열이 아니라 따로 둔다 — pathname 기반 active 판정 대상이
// 아니고, 새 탭으로 열려야 해서 next/link 가 아닌 <a> 를 쓴다. 사이드바와 모바일 탭바가
// 같은 값을 참조해야 두 내비게이션의 항목이 어긋나지 않는다.
//
// 라벨이 "커뮤니티 합류"가 아닌 이유: 채널이 파는 건 공간이 아니라 "오늘 장에서 무슨
// 말이 오갔나"라서, 들어가는 행위가 아니라 받는 내용을 이름으로 삼는다. 지수·브리핑
// 계열 이름은 전부 피했다 — 사이트에 이미 있는 것들이라 같은 메뉴가 둘로 보인다.
//
// aria-label 은 라벨과 따로 둔다. "오늘 뭐래?"만 읽히면 스크린리더 사용자는 이게 외부
// 텔레그램으로 나가는 링크라는 걸 알 수 없다.
const TELEGRAM = {
  href: "https://t.me/hatzze69",
  label: "오늘 뭐래?",
  aria: "오늘 뭐래? 텔레그램 채널 열기(새 탭)",
  icon: "send",
};

// 아직 페이지가 없는 예고 항목. NAV 에 넣지 않는 이유가 둘이다.
//  1. NAV 항목은 전부 <Link> 로 렌더되고 pathname 기반 active 판정을 받는다 — 갈 곳이
//     없는 항목이 그 배열에 섞이면 "링크인데 href 가 가짜"인 상태를 만들어야 한다.
//  2. NAV 는 모바일 하단 탭바와 공유한다. 탭바는 한 줄에 항목을 나눠 갖는 구조라
//     (지금 4개) 5번째가 들어가면 나머지 라벨이 눌린다. 게다가 탭바가 나오는 폭은
//     터치 화면이라 hover 가 없어 툴팁이 뜨지 않는다 — 눌러도 아무 일도 일어나지 않는
//     칸만 남는다. 그래서 사이드바에만 둔다. 페이지가 생기면 NAV 로 옮긴다.
// `after` 는 이 항목이 사이드바에서 **어느 NAV 항목 뒤에** 붙는지다. 배열 순서가 아니라
// 자리를 데이터로 적는 이유는, 미장 카더라가 국장 카더라 바로 밑에 있어야 하기 때문이다 —
// 예고 항목을 전부 목록 끝에 몰면 짝인 둘이 MDD 를 사이에 두고 떨어진다.
const COMING_SOON: { label: string; badge: string; tip: string; after: string; Glyph: Glyph }[] = [
  {
    label: "서학개미 해부도",
    badge: "준비 중",
    tip: "현재 열심히 개발 중입니다!",
    after: "/mdd",
    Glyph: AntIcon,
  },
];

/**
 * 사이드바·모바일 메뉴가 그리는 순서. NAV 항목 사이사이에 예고 항목을 끼운다.
 *
 * NAV 에 예고 항목을 넣지 않는 이유는 COMING_SOON 위 주석 참고(모바일 하단 탭바가
 * NAV 를 공유하는데 한 줄에 4개가 한계다). 그래서 목록을 하나 더 만들지 않고
 * 그릴 때 합친다 — 두 배열을 손으로 맞춰 두면 한쪽만 고쳤을 때 조용히 어긋난다.
 *
 * `after` 가 어느 NAV 항목과도 안 맞으면 조용히 사라지지 않도록 끝에 붙인다.
 */
function sidebarItems() {
  const placed = new Set<string>();
  const rows: (
    | { kind: "nav"; item: NavItem }
    | { kind: "child"; item: NavChild }
    | { kind: "soon"; item: (typeof COMING_SOON)[number] }
  )[] = [];
  for (const item of NAV) {
    rows.push({ kind: "nav", item });
    for (const child of item.children ?? []) rows.push({ kind: "child", item: child });
    for (const soon of COMING_SOON) {
      if (soon.after === item.href) {
        rows.push({ kind: "soon", item: soon });
        placed.add(soon.label);
      }
    }
  }
  for (const soon of COMING_SOON) {
    if (!placed.has(soon.label)) rows.push({ kind: "soon", item: soon });
  }
  return rows;
}

/** NAV 아이콘. 직접 그린 SVG(Glyph)가 있으면 그걸, 없으면 Material Symbols 이름을 쓴다. */
function NavGlyph({ item, size }: { item: { icon?: string; Glyph?: (p: { size?: number }) => React.ReactElement }; size: number }) {
  if (item.Glyph) return <item.Glyph size={size} />;
  return <Icon name={item.icon ?? ""} style={{ fontSize: size }} />;
}

/**
 * 서학개미 아이콘. Material Symbols 에 개미가 없어서 직접 그렸다.
 *
 * 폰트를 먼저 뒤졌다: ant · insects · termite · bug 는 글리프 자체가 없어서 리거처가
 * 안 잡히고 "ANT" 같은 대문자 텍스트로 찍힌다. 실제로 있는 벌레는 pest_control 과
 * bug_report 둘뿐인데, 둘 다 몸통이 한 덩어리인 딱정벌레라 개미로 안 읽힌다.
 *
 * 어법은 브랜드 유령(Logo.tsx 의 GhostSymbol)을 따랐다 — 외곽선이 아니라 통으로 채운
 * 덩어리에 눈을 파낸다. 해부학적으로 정확한 개미(머리·가슴·배 3마디 + 다리 6개)를
 * 외곽선으로 그려도 봤는데, 이 아이콘이 실제로 쓰이는 16px 에서는 다리가 뭉개져
 * 그냥 얼룩이 된다. 덩어리는 작아져도 형태가 남는다.
 *
 * 눈은 흰 원이 아니라 fillRule="evenodd" 로 뚫은 구멍이다. 흰색으로 칠하면 다크모드
 * 카드(어두운 배경) 위에서 흰 점이 떠 버린다. 구멍이라야 배경을 안 가린다.
 *
 * 좌표는 받은 시안을 1200px 기준으로 재서 24 박스로 옮긴 값이다(배율 0.0505).
 * 그래서 눈 지름 대 몸통 높이(32%), 더듬이 굵기(1.52) 같은 비율이 시안 그대로다.
 * 별도 transform 없이 그림이 이미 박스에 맞다 — bbox 는 x 3.8~20.0, y 1.6~22.5 다.
 *
 * 더듬이 두 가닥은 몸통 '안'(y 12.5·12.2)에서 끝난다. 몸통 테두리에 딱 맞춰 끝내면
 * 둥근 캡이 실루엣 위로 튀어나와 이음매에 혹 두 개가 생긴다. 채움 안쪽으로 밀어 넣으면
 * 캡이 덮여서 시안처럼 한 덩어리로 이어진다. 몸통 오른쪽 위 모서리(19.73)는 더듬이
 * 바깥선(18.97 + 굵기 절반 0.76)과 같은 값이라 둘이 단차 없이 만난다.
 */
function AntIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.52}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* 몸통 + 눈구멍(한 path 에 evenodd) */}
      <path
        fill="currentColor"
        stroke="none"
        fillRule="evenodd"
        d="M19.73 10.4 C19.9 12 19.98 13.5 19.98 15 C19.98 19.2 16.3 22.46 11.9 22.46 C7.5 22.46 3.82 19.2 3.82 15.6 C3.82 12.2 7 9.84 11.2 9.84 C14.6 9.84 18.2 9.9 19.73 10.4 Z M10.03 13.52 a2.02 2.02 0 1 0 4.04 0 a2.02 2.02 0 1 0 -4.04 0 Z"
      />
      {/* 뒤로 쓸리는 더듬이 두 가닥 */}
      <path d="M5.64 2.41 C9.8 1.55 14.8 2 17.2 4.3 C18.5 5.55 18.97 7.4 18.97 12.5" />
      <path d="M6.09 5.14 C9.8 4.4 14 4.8 16 6.6 C16.9 7.4 17.15 8.6 17.15 12.2" />
    </svg>
  );
}

/**
 * 마우스가 닿은(또는 손가락이 닿은·포커스가 온) 링크만 **전체 프리페치**로 올린다.
 *
 * Next 의 기본값은 동적 라우트에서 "가장 가까운 loading 경계까지"만 미리 받는다.
 * /kadera 는 데이터 가지가 12개라 클릭 시점에야 시작되는 서버 왕복이 0.7~1.5초다
 * (프로덕션 실측). prefetch 를 켜면 그 왕복이 클릭 **전에** 끝나 있어 즉시 열린다.
 *
 * 그런데 `prefetch` 를 항상 켜면 **카더라를 누를 생각이 없는 방문자까지 전원이**
 * 5분마다 /kadera 풀 렌더(왕복 60회)를 서버에 시킨다. Supabase 지연이 이미 불안정하고
 * 부하에 민감한 걸 확인한 터라, 사이트 전체를 느리게 만들 수 있는 거래다.
 * 그래서 **의도를 보인 사람만 비용을 낸다** — 커서가 링크에 닿는 순간 시작한다.
 *
 * 한번 켜면 끄지 않는다(목록에 쌓아 둔다). 마우스가 들락날락할 때마다 프리페치가
 * 껐다 켜지면 그게 더 낭비다.
 *
 * prefetch 는 **프로덕션 빌드에서만 동작한다** — `npm run dev` 로는 확인할 수 없고
 * `npm run build:local` + `start:local`(hatzze-prod) 로 봐야 한다.
 */
function useIntentPrefetch() {
  const [armed, setArmed] = useState<string[]>([]);
  const arm = (href: string) => setArmed((a) => (a.includes(href) ? a : [...a, href]));
  return (href: string) => ({
    // undefined = Next 기본값 유지(경계까지 부분 프리페치). true = 데이터까지 전부.
    prefetch: armed.includes(href) ? true : undefined,
    onMouseEnter: () => arm(href),
    onFocus: () => arm(href),
    onTouchStart: () => arm(href),
  });
}

/** NAV 항목의 현재 페이지 판정. 사이드바와 모바일 탭바가 같은 규칙을 써야 한다. */
function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Sidebar() {
  const intentPrefetch = useIntentPrefetch();
  const pathname = usePathname();
  // 로고를 감싸는 태그는 어느 페이지에서도 h1이 아니다. 사이드바는 모든 페이지가
  // 공유하는데, 검색엔진은 h1을 그 페이지의 주제로 읽는다 — 늘 h1이면 카더라·MDD가
  // 자기 제목이 아니라 "로고"를 주제로 선언하는 셈이다.
  // 예전엔 홈에서만 h1이었다("홈은 페이지 대표 제목이 따로 없다"는 이유였다). 그 전제는
  // 본문 헤더(PageHeader)가 생기면서 깨졌다 — 홈도 이제 "시장 브리핑"이라는 자기 제목을
  // 갖고, 로고까지 h1이면 홈만 h1이 둘이 된다.
  // div로 바뀌어도 보이는 건 그대로다. globals.css에 h1~h6 규칙이 없고 Tailwind
  // preflight가 font-size·font-weight를 inherit으로 되돌려서, 태그 기본값 중 남는 게 없다.
  const LogoTag = "div";
  return (
    <aside
      className="hz-sidebar"
      style={{
        width: 210,
        flexShrink: 0,
        background: C.card,
        borderRight: `1px solid var(--c-divider)`,
        padding: "26px 14px 22px",
        gap: 40,
      }}
    >
      <div style={{ padding: "0 6px" }}>
        {/* 베타 배지는 로고 우측 상단에 붙인다 — 서비스 전체가 베타라는 표시라서,
            페이지마다(예전엔 카더라 제목 옆) 다는 것보다 여기 한 곳이 맞다.
            alignItems:flex-start 로 로고 윗선에 맞춰 위첨자처럼 올린다. */}
        <LogoTag style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 5 }}>
          {/* 로고는 메인(시장 브리핑)으로 가는 링크 — 어느 페이지에서든 홈으로 돌아올 수 있게. */}
          <Link href="/" aria-label="hatzze 홈" className="hz-logo-link" style={{ display: "inline-flex" }}>
            <LogoLockup symbolSize={29} wordmarkSize={30} gap={7} />
          </Link>
          {/* 배지 크기는 '준비 중' 배지와 맞춘다(10px / padding 3-7). 서로 다른 크기면
              같은 사이드바 안에서 배지가 두 종류로 보인다. */}
          <BetaBadge logoSize={30} style={{ height: "auto", fontSize: 10, padding: "3px 7px", lineHeight: 1.4 }} />
        </LogoTag>
        <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: "0.02em", lineHeight: 1.5 }}>
          데이터와 감성으로 읽는 시장
        </p>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sidebarItems().map((row) => {
          if (row.kind === "soon") {
            const soon = row.item;
            return (
              <div
                key={soon.label}
                className="hz-tip hz-nav-item"
                data-tip={soon.tip}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  color: C.disabled,
                  fontWeight: 600,
                  borderRadius: R.nav,
                }}
              >
                <soon.Glyph size={20} dimmed />
                {/* 배지를 라벨 '우측 상단'에 위첨자로 띄운다(로고 옆 베타 배지와 같은 어법).
                    absolute 라 배지가 행 폭 계산에서 빠져 라벨이 눌리지도, 항목이 넘치지도 않는다. */}
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>{soon.label}</span>
                  <span
                    style={{
                      position: "absolute",
                      left: "100%",
                      top: -6,
                      marginLeft: 3,
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1.4,
                      whiteSpace: "nowrap",
                      color: C.muted,
                      background: C.chip,
                      padding: "3px 7px",
                      borderRadius: R.pill,
                    }}
                  >
                    {soon.badge}
                  </span>
                </span>
              </div>
            );
          }
          if (row.kind === "child") {
            const child = row.item;
            // 서브 행은 알약을 주지 않는다. 부모가 이미 알약을 쓰고 있어서 둘 다 칠하면
            // 한 구역에 강조가 둘이 된다 — 부모는 "여기 구역", 서브는 "이 페이지"다.
            const on = !!child.href && pathname === child.href;
            const rowStyle = {
              display: "flex",
              alignItems: "center",
              gap: 10,
              // 아이콘(20) + 간격(12) + 좌패딩(14) = 46 → 서브 아이콘이 부모 라벨 자리에 선다
              padding: "8px 14px 8px 34px",
              borderRadius: R.nav,
            } as const;
            if (!child.href) {
              return (
                <div
                  key={child.label}
                  className="hz-tip hz-nav-item"
                  data-tip={child.tip}
                  style={{ ...rowStyle, color: C.disabled, fontWeight: 600 }}
                >
                  <child.Glyph size={18} dimmed />
                  <span style={{ position: "relative", display: "inline-flex" }}>
                    <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>{child.label}</span>
                    <span
                      style={{
                        position: "absolute",
                        left: "100%",
                        top: -6,
                        marginLeft: 3,
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1.4,
                        whiteSpace: "nowrap",
                        color: C.muted,
                        background: C.chip,
                        padding: "3px 7px",
                        borderRadius: R.pill,
                      }}
                    >
                      {child.badge}
                    </span>
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={child.label}
                href={child.href}
                {...intentPrefetch(child.href)}
                className="hz-nav-item"
                style={{
                  ...rowStyle,
                  color: on ? C.blueInk : C.sub,
                  fontWeight: on ? 700 : 600,
                  textDecoration: "none",
                }}
              >
                <child.Glyph size={18} />
                <span style={{ fontSize: 13 }}>{child.label}</span>
              </Link>
            );
          }
          const item = row.item;
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              {...intentPrefetch(item.href)}
              className={`hz-nav-item${active ? " hz-nav-active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                // 활성 항목이 옅은 tint 배경 + 파란 글자였는데, 목업은 **파란 알약에 흰 글자**다.
                color: active ? "#ffffff" : C.sub,
                fontWeight: active ? 700 : 600,
                // 비활성일 때 background 를 인라인으로 두면(예전 "transparent") 인라인이
                // 우선순위에서 이겨 .hz-nav-item:hover 회색 배경이 먹히지 않는다. 값을 아예
                // 빼서 호버는 CSS 가 담당하게 한다.
                background: active ? C.blue : undefined,
                // ⚠️ 활성 항목에 파란 그림자를 주지 않는다. 0 10px 20px 이라 **바로 아래
                // 항목 위로 번져서**, 그 항목만 호버 배경이 푸르스름하게 도드라졌다
                // (카더라는 볼록하고 MDD 는 평평해 보이던 원인, 2026-08-03).
                // 활성 표시는 꽉 찬 파랑 알약만으로 충분하다.
                borderRadius: R.nav,
                textDecoration: "none",
              }}
            >
              <NavGlyph item={item} size={20} />
              <span style={{ fontSize: 14 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {/* 예고 항목에 대하여(위 map 의 kind === "soon" 가지).
          <a href> 가 아니라 <div> 인 게 "못 누른다"의 유일한 보장이다 — href 만 뺀 <a> 는
          클릭은 안 먹어도 브라우저·확장 프로그램에 따라 링크로 취급되는 변형이 남는다.
          div 는 포커스 순서에도 안 들어간다.

          색은 C.sub(다른 항목) 보다 한 단 흐린 C.disabled 로. 호버해 보기 전에도
          "지금은 아닌 것"이 보여야 한다. */}

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 라벨은 바뀌었어도 data-ga-cta 는 "community" 그대로 둔다 — 값을 같이 바꾸면
            이름 변경 전후의 클릭수를 한 줄로 비교할 수 없다. 탭바·푸터도 같은 값이다. */}
        <a
          href={TELEGRAM.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={TELEGRAM.aria}
          data-ga="cta_click"
          data-ga-cta="community"
          data-ga-surface="sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 14,
            borderRadius: R.control,
            // 카드 아이콘 타일과 같은 옅은 하늘색. 꽉 찬 파랑은 사이드바에서 혼자 튀어
            // 내비게이션이 아니라 광고 배너처럼 읽혔다(2026-08-03).
            background: "var(--c-blue-tint)",
            color: C.blueInk,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icon name={TELEGRAM.icon} style={{ fontSize: 19 }} />
          {TELEGRAM.label}
        </a>
      </div>
    </aside>
  );
}

// 모바일 메뉴(햄버거). 예전엔 하단 탭바였는데 탑바 오른쪽으로 올렸다.
//
// 탭바를 접은 이유는 그때 적어 둔 근거가 뒤집혔기 때문이다. "항목이 4개뿐이라 한 줄에
// 다 들어간다"가 전제였는데, 서학개미 해부도가 붙어 5개가 되면서 칸마다 라벨이 눌린다.
// 게다가 예고 항목은 탭 칸에 두면 눌러도 아무 일이 없어 고장으로 보인다 — 탭바가 뜨는
// 폭은 터치라 hover 가 없어서 "준비 중" 툴팁이 안 뜬다. 세로 목록은 배지를 그 자리에
// 늘 띄워 두므로 눌러 보기 전에 이유가 보인다.
//
// 열려 있는 동안에만 DOM 에 올린다. 데스크톱에서는 여는 버튼 자체가 없지만, 열어 둔
// 채로 창을 넓히는 경우가 있어 패널·백드롭의 display 는 미디어쿼리가 최종적으로 막는다.
function MobileMenu({ onClose }: { onClose: () => void }) {
  const intentPrefetch = useIntentPrefetch();
  const pathname = usePathname();

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 14px",
    borderRadius: R.nav,
    color: active ? C.blueInk : C.sub,
    fontWeight: active ? 700 : 600,
    // 사이드바와 같은 이유로 비활성 background 는 인라인에서 뺀다 — 값을 두면
    // .hz-nav-item:hover 를 인라인이 이겨버린다.
    background: active ? "var(--c-blue-tint)" : undefined,
    textDecoration: "none",
  });

  return (
    <>
      <div className="hz-menu-backdrop" onClick={onClose} />
      <nav className="hz-menu-panel" id="hz-mobile-menu" aria-label="주요 메뉴">
        {/* 예고 항목은 사이드바와 같은 이유로 <div> 다(링크가 아니고 포커스도 안 받는다).
            다만 배지는 위첨자가 아니라 라벨 옆에 나란히 둔다. 여기는 폭이 사이드바처럼
            210px 로 묶여 있지 않아 자리가 남고, 툴팁이 안 뜨는 화면이라 배지가 유일한
            설명이므로 겹쳐 두지 않고 또렷하게 보여야 한다. */}
        {sidebarItems().map((row) => {
          if (row.kind === "soon") {
            const soon = row.item;
            return (
              <div
                key={soon.label}
                className="hz-tip"
                data-tip={soon.tip}
                style={{ ...rowStyle(false), color: C.faint }}
              >
                <soon.Glyph size={20} dimmed />
                <span style={{ fontSize: 15 }}>{soon.label}</span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: 1.4,
                    whiteSpace: "nowrap",
                    color: C.faint,
                    background: "var(--c-hover)",
                    border: `1px solid ${C.line}`,
                    padding: "2px 6px",
                    borderRadius: 999,
                  }}
                >
                  {soon.badge}
                </span>
              </div>
            );
          }
          if (row.kind === "child") {
            const child = row.item;
            const on = !!child.href && pathname === child.href;
            // 들여쓰기는 사이드바와 같은 뜻(부모 라벨 자리에 서브 아이콘이 선다)이지만
            // 여기는 행 높이·글자 크기가 달라서 값을 그대로 못 쓴다. rowStyle 위에 얹는다.
            const indented = { ...rowStyle(false), paddingLeft: 40, gap: 10 };
            if (!child.href) {
              return (
                <div
                  key={child.label}
                  className="hz-tip"
                  data-tip={child.tip}
                  style={{ ...indented, color: C.faint }}
                >
                  <child.Glyph size={18} dimmed />
                  <span style={{ fontSize: 14 }}>{child.label}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: 1.4,
                      whiteSpace: "nowrap",
                      color: C.faint,
                      background: "var(--c-hover)",
                      border: `1px solid ${C.line}`,
                      padding: "2px 6px",
                      borderRadius: 999,
                    }}
                  >
                    {child.badge}
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={child.label}
                href={child.href}
                {...intentPrefetch(child.href)}
                className="hz-nav-item"
                style={{ ...indented, color: on ? C.blueInk : C.sub, fontWeight: on ? 700 : 600 }}
              >
                <child.Glyph size={18} />
                <span style={{ fontSize: 14 }}>{child.label}</span>
              </Link>
            );
          }
          const item = row.item;
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              {...intentPrefetch(item.href)}
              className={`hz-nav-item${active ? " hz-nav-active" : ""}`}
              aria-current={active ? "page" : undefined}
              style={rowStyle(active)}
            >
              <NavGlyph item={item} size={20} />
              <span style={{ fontSize: 15 }}>{item.label}</span>
            </Link>
          );
        })}
        <span style={{ height: 1, background: C.line, margin: "4px 8px" }} />
        {/* 라벨은 바뀌었어도 data-ga-cta 는 "community" 그대로 둔다 — 값을 같이 바꾸면
            이름 변경 전후의 클릭수를 한 줄로 비교할 수 없다. surface 만 tabbar → menu 로
            바꾼다. 그 자리는 실제로 없어졌으니 계속 tabbar 로 적으면 거짓이 된다. */}
        <a
          href={TELEGRAM.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={TELEGRAM.aria}
          className="hz-nav-item"
          data-ga="cta_click"
          data-ga-cta="community"
          data-ga-surface="menu"
          style={rowStyle(false)}
        >
          <Icon name={TELEGRAM.icon} style={{ fontSize: 20 }} />
          <span style={{ fontSize: 15 }}>{TELEGRAM.label}</span>
        </a>
      </nav>
    </>
  );
}

function ThemeToggle({ initial, variant = "icon" }: { initial: "light" | "dark"; variant?: "icon" | "row" }) {
  // 초기값은 서버가 쿠키로 SSR한 값(prop)이라 아이콘도 첫 렌더부터 정확하다.
  const [theme, setTheme] = useState<"light" | "dark">(initial);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    // 기본이 라이트라, 이 이벤트는 "다크로 바꾼 사람"이 얼마나 되는지를 재는 쪽이
    // 주된 쓸모다. 전환 방향(to)이 있어야 양쪽이 구분된다.
    track("theme_toggle", { to: next });
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `hz-theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    // 모바일 주소창 색도 같이 돌린다. 이 메타는 layout.tsx 가 쿠키를 보고 SSR 하므로,
    // 여기서 안 고치면 다음 페이지 로드까지 주소창만 이전 테마로 남는다.
    // 값을 또 적지 않고 방금 바뀐 data-theme 의 --c-bg 를 읽어 globals.css 를 따라간다.
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  };

  // 모양이 둘이다. 사이드바(row)는 목업의 **라벨 + 스위치 행**이고, 모바일 탑바(icon)는
  // 자리가 없어 아이콘 버튼 하나로 둔다. 동작은 같은 toggle 을 쓴다.
  if (variant === "row") {
    return (
      <button
        onClick={toggle}
        aria-label="다크 모드 전환"
        aria-pressed={theme === "dark"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          borderRadius: R.control,
          border: 0,
          background: C.soft,
          color: C.sub,
          cursor: "pointer",
          font: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 600 }}>
          <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} style={{ fontSize: 19 }} />
          다크 모드
        </span>
        {/* 스위치는 장식이다(aria-pressed 가 상태를 말한다). 켜지면 손잡이가 오른쪽으로. */}
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 19,
            borderRadius: R.pill,
            background: theme === "dark" ? C.blue : C.line,
            display: "flex",
            alignItems: "center",
            justifyContent: theme === "dark" ? "flex-end" : "flex-start",
            padding: 2,
            flexShrink: 0,
          }}
        >
          <span style={{ width: 15, height: 15, borderRadius: "50%", background: C.card, boxShadow: "0 1px 3px rgba(20,70,130,.25)" }} />
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label="다크 모드 전환"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        borderRadius: R.control,
        border: `1px solid ${C.line}`,
        background: C.bg,
        color: C.sub,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} style={{ fontSize: 20 }} />
    </button>
  );
}


/**
 * 본문 헤더 — 페이지 제목·부제 + 테마 토글.
 *
 * 부제는 사이드바 로고 밑에 있던 문장을 옮겨 온 것이다(NAV.sub). 페이지마다 달라지므로
 * 세 화면이 공유하는 사이드바보다 여기가 맞는 자리다.
 *
 * ⚠️ 여기가 그리는 h1 이 그 페이지의 **유일한** h1 이다. 화면 쪽에 제목을 또 두면
 * 같은 글자가 두 번 뜨고 SEO 상으로도 h1 이 둘이 된다.
 *
 * NAV 에 없는 경로(개인정보처리방침·이용약관)에서는 제목 칸을 통째로 비운다. 예전엔
 * `?? NAV[0]` 로 떨어져서 법률 문서 위에 "시장 브리핑"이라는 **틀린 제목**이 붙어
 * 있었다(중복보다 나쁘다 — 문서 제목과 나란히 서서 둘 다 h1 이었다). 그 문서들은
 * 자기 제목(legal.tsx 의 DocTitle)을 갖고 있으니 여기서 보탤 것이 없다. 도구 묶음은
 * 남긴다 — 테마 토글은 어느 화면에서나 같은 자리에 있어야 한다.
 */
function PageHeader({ theme }: { theme: "light" | "dark" }) {
  const pathname = usePathname();
  const page = NAV.find((n) => isActive(n.href, pathname));
  // 서브 페이지에서는 서브의 이름을 h1 으로 쓴다. 부모(구역)의 이름을 그대로 두면
  // /kadera 와 /kadera/us 두 페이지가 **같은 h1** 을 갖는다.
  //
  // 부모와 주소가 같은 서브(국장 → /kadera)도 서브의 이름을 쓴다. 한동안 여기만
  // 비껴가 있었는데(이미 색인이 끝난 제목을 바꿀 이유가 없다는 판단), 그러면 화면에는
  // "카더라 리포트", 사이드바에는 "국장 카더라"로 같은 페이지가 두 이름을 갖는다.
  // 주소는 그대로라 색인이 끊기지 않고 제목만 갱신된다.
  const child = page?.children?.find((c) => c.href === pathname);
  const title = child?.label ?? page?.label;
  const sub = child?.sub ?? page?.sub;
  // 배지는 부모 것이다. 서브가 물려받으면 "25개 지표" 같은 남의 표찰이 따라 붙는다.
  const badge = child ? undefined : page?.badge;
  return (
    <header className="hz-page-head">
{/* #267 의 가드: NAV 에 없는 경로(법률 문서)에서는 제목 칸을 통째로 비운다.
          그 안에 콘솔 리디자인의 배지를 넣는다 — 둘은 서로 독립이다. */}
      {page && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          {/* 배지는 제목과 같은 줄, 세로 가운데 정렬. baseline 으로 두면 알약의 **글자**
              밑선이 제목 밑선에 맞아, 알약 자체는 그만큼(패딩+테두리) 아래로 내려앉는다 —
              옆에 붙은 라벨이 아니라 매달린 것처럼 보였다. */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: "-.03em", color: C.ink }}>
              {title}
            </h1>
            {badge && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.sub,
                  /* 회색 알약이니 --c-chip 이다. --c-track(막대의 빈 트랙)을 쓰고 있었는데,
                     라이트에서는 둘이 네 단위 차이라 티가 안 났지만 다크에서는 track 이
                     chip 보다 한 칸 밝아서(#3c3c47 vs #35353f) 같은 글자(--c-sub)가
                     4.08 로 떨어졌다 — 라이트의 4.98 보다 눈에 띄게 낮다. chip 위에서는
                     4.55 다. 칩 배경을 뜻하는 값이 따로 있으면 그걸 쓰는 게 맞다. */
                  background: C.chip,
                  borderRadius: R.pill,
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.sub2 }}>{sub}</p>
        </div>
      )}
      {/* 제목이 없을 때 도구가 왼쪽으로 붙지 않도록. justify-content:space-between 은
          자식이 하나면 그 하나를 왼쪽 끝에 둔다. */}
      {!page && <div style={{ flex: 1 }} />}
      {/* 오른쪽 도구는 테마 토글 하나다. 검색창·알림 벨·프로필 칩은 걷었다 —
          셋 다 기능이 없어 모양만 있는 자리였고(2026-08-03), 로그인이 없는
          서비스라 프로필 칩은 앞으로도 가리킬 대상이 없다. */}
      <div className="hz-page-tools">
        <ThemeToggle initial={theme} />
      </div>
    </header>
  );
}

function TopBar({
  theme,
  scrolledDown,
  menuOpen,
  onMenuToggle,
}: {
  theme: "light" | "dark";
  scrolledDown: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  // 2026-08 리디자인: 흐르는 티커가 여기서 빠졌다. 카더라 집계는 본문 맨 위 카드 4장
  // (TickerCards)으로, 햇쩨 지수는 히어로로 갔다. 그래서 이 탑바에 남은 건 **모바일에서
  // 사이드바가 숨을 때 필요한 것들뿐**이다 — 로고·테마 토글·햄버거.
  // 데스크톱에서는 globals.css 가 통째로 display:none 한다.

  // 메뉴가 열려 있으면 감추지 않는다 — 패널이 탑바 바로 아래에 붙어 있어서, 탑바만
  // 올라가면 패널이 허공에 뜬다.
  const hidden = scrolledDown && !menuOpen;

  return (
    <header
      className={`hz-topbar${hidden ? " hz-topbar-hidden" : ""}`}
      style={{
        height: 54,
        flexShrink: 0,
        background: C.card,
        borderBottom: `1px solid ${C.line}`,
        // ⚠️ display·정렬을 인라인에 두지 않는다. 이 탑바는 데스크톱에서 통째로 숨는데,
        // 인라인 display 는 미디어쿼리를 이겨서 .hz-topbar{display:none} 이 안 먹는다
        // (여백에서 같은 함정을 이미 네 번 밟았다). 전부 globals.css 의 .hz-topbar 로.
        // 좌우 여백은 .hz-topbar 가 정한다(데스크톱 24 · 모바일 16). 인라인에 두면
        // 미디어쿼리가 못 이겨서, 폰에서 탑바 양끝이 카드(16)와 안 맞고 24 로 남는다.
      }}
    >
      {/* 모바일 전용 로고. 사이드바가 숨는 폭에서는 브랜드가 화면 어디에도 없었다.
          display 를 인라인으로 안 주는 이유는 아래 미디어쿼리가 이겨야 하기 때문이다.

          배지를 링크 **밖**에 두는 건 사이드바와 같은 이유다 — 링크에 aria-label 이
          걸려 있어서, 안에 넣으면 라벨이 내용을 덮어 스크린리더가 '베타'를 못 읽는다. */}
      <span className="hz-topbar-logo">
        <Link href="/" aria-label="hatzze 홈" className="hz-logo-link" style={{ display: "inline-flex" }}>
          <LogoLockup symbolSize={22} wordmarkSize={23} gap={6} />
        </Link>
        <BetaBadge logoSize={23} />
      </span>
      <div style={{ flex: 1 }} />
      {/* 오른쪽 묶음: 테마 토글 + 햄버거(모바일 전용). 햄버거가 화면 맨 오른쪽 끝이다.
          데스크톱에서는 햄버거가 display:none 이라 flex 에서 아예 빠지고, 남는 건
          예전과 같은 토글 하나다 — 순서를 바꿔도 데스크톱은 그대로다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <ThemeToggle initial={theme} />
        <button
          type="button"
          className="hz-menu-btn"
          onClick={onMenuToggle}
          aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={menuOpen}
          aria-controls="hz-mobile-menu"
          style={{
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: R.control,
            border: `1px solid ${C.line}`,
            background: C.bg,
            color: C.sub,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Icon name={menuOpen ? "close" : "menu"} style={{ fontSize: 20 }} />
        </button>
      </div>
    </header>
  );
}

/**
 * 첫 방문자에게 한 번 뜨는 PC 권유 토스트(모바일 전용).
 *
 * 문구는 "최적화되지 않았습니다" 류를 피했다. 모바일은 고장난 게 아니라 카드가 한 줄로
 * 늘어서서 한눈에 못 견줄 뿐인데, 첫 화면에서 사과부터 읽으면 남은 화면까지 의심하게
 * 된다. 지표 개수 같은 숫자도 일부러 안 넣었다 — 개수가 바뀌면 문구가 조용히 거짓이
 * 되는데, 이 배너는 아무도 다시 안 보는 자리라 틀린 채로 남는다.
 *
 * useEffect + setState 가 아니라 useSyncExternalStore 를 쓴다. localStorage 는 React
 * 바깥의 저장소라 이게 정석이고, 서버 스냅샷을 false 로 두면 SSR 은 아무것도 안 그려
 * 하이드레이션이 어긋나지 않는다. effect 로 하면 eslint(set-state-in-effect)에도 걸린다.
 *
 * 표시 여부는 CSS(.hz-pc-hint)가 최종 결정한다. 데스크톱에서는 DOM 에 있어도 안 보이고,
 * 그래서 데스크톱 방문자는 '봤음' 표시를 남기지 않는다 — 나중에 폰으로 들어오면 그때
 * 제대로 한 번 뜬다.
 */
const PC_HINT_KEY = "hz-pc-hint-seen";
const PC_HINT_EVENT = "hz-pc-hint-change";

const pcHintStore = {
  subscribe(cb: () => void) {
    window.addEventListener(PC_HINT_EVENT, cb);
    return () => window.removeEventListener(PC_HINT_EVENT, cb);
  },
  // 사파리 사생활 보호 모드 등에서 localStorage 접근이 던진다. 그때는 안 띄운다 —
  // 껐다는 걸 기억할 수 없으니, 띄우면 갈 때마다 다시 뜬다.
  getSnapshot() {
    try {
      return localStorage.getItem(PC_HINT_KEY) === null;
    } catch {
      return false;
    }
  },
};

function PcHint() {
  const show = useSyncExternalStore(
    pcHintStore.subscribe,
    pcHintStore.getSnapshot,
    () => false,
  );

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(PC_HINT_KEY, "1");
    } catch {}
    window.dispatchEvent(new Event(PC_HINT_EVENT));
  };

  return (
    <div className="hz-pc-hint" role="status">
      <Icon name="desktop_windows" style={{ fontSize: 18, flexShrink: 0 }} />
      <span style={{ flex: 1, wordBreak: "keep-all" }}>지표를 한눈에 보시려면 PC를 권해 드립니다.</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="닫기"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: R.control,
          border: "none",
          background: "transparent",
          color: "inherit",
          opacity: 0.7,
          cursor: "pointer",
        }}
      >
        <Icon name="close" style={{ fontSize: 17 }} />
      </button>
    </div>
  );
}

/**
 * 스크롤을 내리면 true, 올리면 false. 모바일 탑바를 감췄다 꺼내는 데 쓴다.
 *
 * window 가 아니라 인자로 받은 요소를 듣는다. 이 셸은 바깥(document)이 스크롤되지
 * 않는다 — 루트가 overflow:hidden 이고 main.hz-scroll 이 자기 안에서 굴린다.
 * window 에 붙이면 이벤트가 한 번도 안 온다.
 *
 * 6px 문턱을 둔 이유는 관성 스크롤이 끝날 때 1~2px 씩 방향이 튀어서, 문턱이 없으면
 * 탑바가 깜빡이기 때문이다. 최상단(10px 이내)에서는 방향과 무관하게 늘 보여 준다.
 *
 * 데스크톱에서도 이 훅은 돌지만 보이는 변화는 없다 — 감추는 건 transform 이고,
 * 그 규칙은 560px 미디어쿼리 안에만 있다.
 */
function useScrolledDown(ref: React.RefObject<HTMLElement | null>) {
  const [scrolledDown, setScrolledDown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const y = el.scrollTop;
      const dy = y - last;
      if (Math.abs(dy) < 6) return;
      last = y;
      setScrolledDown(y > 10 && dy > 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  return scrolledDown;
}

/**
 * 한 화면 넘게 내려왔는지. '맨 위로' 버튼을 띄우는 데 쓴다.
 *
 * useScrolledDown 과 같은 이유로 window 가 아니라 인자로 받은 요소를 듣는다.
 *
 * 문턱을 px 상수가 아니라 **clientHeight(한 화면)** 로 둔다. "한 화면 넘게 내려왔으면
 * 되돌아가기가 번거롭다"가 이 버튼을 띄우는 이유인데, 그 번거로움은 절대 픽셀이 아니라
 * 화면 몇 개분인지로 정해진다 — 상수로 박으면 작은 폰에서는 늦고 태블릿에서는 이르다.
 *
 * 끄는 문턱만 80px 낮춰 둔다(히스테리시스). 같은 값으로 켜고 끄면 경계에 멈춰 선 채
 * 손가락이 떨릴 때 버튼이 깜빡인다. 켤 때는 한 화면, 끌 때는 한 화면 −80.
 *
 * 스크롤마다 setState 를 부르지만 값이 그대로면 React 가 되돌려 보내므로(bail out)
 * 실제 렌더는 경계를 넘는 순간에만 일어난다.
 */
function useScrolledPastFold(ref: React.RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const fold = el.clientHeight;
      setPast((prev) => (prev ? el.scrollTop > fold - 80 : el.scrollTop > fold));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  return past;
}

/**
 * '맨 위로' 버튼. 모바일에서 한 화면 넘게 내려가면 오른쪽 아래에 나타난다.
 *
 * **자리는 고정이다.** 같은 구석을 쓰는 PC 권유 띠(PcHint)에 맞춰 버튼을 밀어 올리지
 * 않는다 — 띠는 대개 금방 닫히는 것이라, 그것 때문에 버튼이 오르내리면 늘 있는 쪽이
 * 늘 없는 쪽에 맞춰 흔들린다. 대신 띠보다 한 층 아래에 눕혀서 겹치는 동안만 가려지게
 * 한다(자세한 근거와 실측은 globals.css 의 .hz-totop 주석).
 *
 * 표시 여부는 PcHint 와 같은 방식으로 **CSS 가 최종 결정한다**(.hz-totop 은 560px
 * 미디어쿼리 안에서만 display 가 켜진다). 여기서는 .is-on 만 붙였다 뗀다 — 마운트를
 * 껐다 켜면 나타나고 사라지는 전환을 걸 수 없다.
 */
function ToTop({
  scroller,
  show,
}: {
  scroller: React.RefObject<HTMLElement | null>;
  show: boolean;
}) {
  return (
    <button
      type="button"
      className={show ? "hz-totop is-on" : "hz-totop"}
      aria-label="맨 위로"
      onClick={() => scroller.current?.scrollTo({ top: 0 })}
    >
      <Icon name="arrow_upward" style={{ fontSize: 20 }} />
    </button>
  );
}

export default function AppShell({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const scrolledDown = useScrolledDown(mainRef);
  const pastFold = useScrolledPastFold(mainRef);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // 페이지를 옮기면 닫는다. 패널은 셸에 얹혀 있어 라우팅만으로는 사라지지 않는다.
  //
  // useEffect 가 아니라 렌더 중에 맞춘다. effect 로 하면 이미 그린 뒤에 다시 그리는
  // 셈이라 메뉴가 한 프레임 남고(cascading render), eslint 도 막는다. 링크마다
  // onClick 으로 닫는 방법도 있지만 그러면 뒤로가기·앞으로가기가 빠진다 — pathname 을
  // 보면 어떤 경로로 바뀌든 다 걸린다.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div
      className="hz-shell"
      style={{
        // 목업은 흰 셸이 옅은 파랑(--c-page) 위에 떠 있는 구조다. 바깥 한 겹이 페이지
        // 바탕이고, 안쪽 둥근 흰 판이 사이트 전체를 담는다.
        //
        // ⚠️ **스크롤은 여전히 main 안쪽이다.** 목업의 바깥 div 는 min-height:100vh 라
        // 페이지가 통째로 스크롤되는 모양인데, 그러면 사이드바가 같이 밀려 올라간다 —
        // 사이드바 아래쪽(오늘 뭐래? · 다크모드 · 버전)을 spacer 로 바닥에 붙여 둔 설계와
        // 어긋난다. 셸을 화면 높이에 못 박고 main 만 굴리면 목업과 첫 화면이 같으면서
        // 사이드바가 고정된다. 탑바 접힘(useScrolledDown)·PcHint 도 이 전제 위에 있다.
        display: "flex",
        background: C.page,
        color: C.ink,
        // 사이트 전체를 Pretendard 하나로 통일한다. 예전엔 Plus Jakarta Sans가 앞에 있어서
        // 라틴·숫자만 그 서체로 렌더되고 한글만 Pretendard로 떨어졌다 — 한 줄 안에서 서체가
        // 갈렸다. Pretendard는 next/font/local로 자체 호스팅하므로 mac·윈도우 모두 동일하다.
        fontFamily: "var(--font-pretendard), sans-serif",
        WebkitFontSmoothing: "antialiased",
        overflow: "hidden",
      }}
    >
      {/* 위임 리스너(클릭·툴팁·스크롤). 렌더 결과가 없으므로 어디에 두어도 되지만,
          셸 최상단에 두어 "모든 페이지에 걸린다"는 게 눈에 보이게 한다. */}
      <GaEvents />
      {/* 터치 기기에서 툴팁을 탭으로 여는 리스너. 호버가 되는 기기에서는 아무것도 안 건다. */}
      <TipTap />
      <div
        className="hz-frame"
        style={{
          // 화면을 꽉 채운다. 목업이 흰 판을 여백 위에 띄운 건 **캔버스 안에서 화면을
          // 보여 주려던 액자**이지 서비스의 모양이 아니다(2026-08-03).
          // 실제 사이트에서는 그 액자가 없어야 브라우저 창 전체가 서비스가 된다.
          flex: 1,
          display: "flex",
          minWidth: 0,
          background: C.card,
          overflow: "hidden",
        }}
      >
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: C.bg }}>
        <TopBar
          theme={theme}
          scrolledDown={scrolledDown}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((v) => !v)}
        />
        {/* 메뉴는 탑바 '안'이 아니라 형제로 둔다. 안에 두면 백드롭이 탑바의 자식이 되어
            로고·햄버거까지 덮어 버려서, 정작 닫기 버튼을 누를 수 없다. */}
        {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
        {/* 여백은 globals.css 의 --hz-main-pad 가 폭에 따라 정한다(40 → 24 → 16).
            인라인이 아니라 .hz-main 클래스로 준다 — 모바일에서 탑바가 fixed 로 떠서
            흐름에서 빠지는데, 그만큼을 padding-top 으로 되메워야 첫 카드가 안 가린다.
            인라인 padding 은 미디어쿼리의 padding-top 을 이겨서 그게 안 먹는다. */}
        {/* 헤더·푸터는 main **안**에 둔다. 목업이 그 둘을 본문 흐름의 일부로 그렸고
            (스크롤하면 같이 올라간다), 그래야 좌우 여백이 카드와 한 선에 맞는다.

            폭 제한은 **안쪽 상자**가 건다. main 자체에 걸면 스크롤바가 콘텐츠를 따라
            안쪽으로 들어와 창 오른쪽 끝에서 떨어진다. 그리고 헤더·카드·푸터가 같은
            상자 안에 있어야 셋의 왼쪽 선이 어긋나지 않는다 — 카드에만 걸면 헤더와
            푸터가 화면 끝까지 늘어나 격자와 안 맞는다.

            세로 flex + gap 20 도 여기 둔다(목업 main 의 값). */}
        <main ref={mainRef} className="hz-scroll hz-main" style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              width: "100%",
              // 목업의 본문 폭이다(셸 1600 − 사이드바 214 − 여백 48 = 1338).
              // ⚠️ 1180 이었는데 그 값으로는 **시트가 4열이 될 수 없다.** 최소 칸 304 ×
              // 4 = 1216 이라, 화면이 아무리 넓어도 3열에서 멈춘다(목업은 넓은 화면에서
              // 4열이고 히어로도 그때 [지수][분포][브리핑 span2] = 4칸으로 딱 맞는다).
              // 좁은 화면에서는 어차피 이 상한에 안 걸리므로 3열·2열 거동은 그대로다.
              maxWidth: 1340,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <PageHeader theme={theme} />
            {children}
            <Footer />
          </div>
        </main>
        {/* 둘 다 오른쪽 아래 구석을 쓴다. 층은 DOM 순서가 아니라 z-index 로 못박아
            두었으므로(버튼 33 · 띠 34) 여기 순서는 읽기 좋은 대로 둔다. */}
        <ToTop scroller={mainRef} show={pastFold} />
        <PcHint />
      </div>
      </div>
    </div>
  );
}

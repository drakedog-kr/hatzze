"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { INSIDER_LISTS, INSIDER_LIST_SLUGS, insiderListHref } from "./insider/lists";

import { track } from "@/lib/ga";
import { SLOGAN } from "./brand";
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
 * 카더라 서브 항목의 표식 둘 — 국장은 **손으로 그린 태극**, 미장은 **시안을 벡터로 뜬
 * 자유의 여신상**이다.
 *
 * ⭐⭐ 시안이 있으면 눈대중으로 옮기지 말고 벡터로 뜰 것. 처음엔 맨손으로 좌표를 찍었는데
 * 하나를 열 번 넘게 고쳐도 매번 근사치였다("삐죽삐죽 이상하다"). potrace 로 원본 윤곽을
 * 그대로 뜨니 한 번에 끝났다. 반대로 태극처럼 **원·호 몇 개로 떨어지는 도형**은 손으로
 * 그리는 편이 낫다 — 좌표가 뜻을 갖고(아래 33.69°), 파일도 100배 작다.
 * 다만 뜻을 갖는 만큼 **틀려도 그럴듯해 보인다**. 태극은 국기 원본 경로와 대조할 것.
 *
 * 재현 방법(스크래치패드에 도구가 있다):
 *   node vectorize/trace.mjs <이미지> [--flip] [--threshold 128]
 *   → traced.jsx(붙여넣을 JSX) · preview.png(18/20/32/96px 를 라이트·다크로)
 *   ⚠️ 밝은 그림 / 어두운 바탕 시안은 **먼저 반전**해야 한다(안 그러면 배경이 떠진다).
 *
 * transform 은 원본 좌표를 24 박스로 옮기는 것이다(여백을 잘라 가운데 맞춤).
 * 경로 좌표를 직접 고치지 말고 **시안을 고쳐 다시 뜰 것** — 손으로 만지면 원본과 갈린다.
 *
 * ⭐⭐ **고르는 기준은 18px(서브 항목의 실제 크기)이다.** 96px 에서 좋아 보이는 그림이
 * 여기서도 좋다는 보장이 전혀 없다. 실제로 호랑이 시안 셋을 이 크기로 찍어 보고 전부
 * 접었다 — 특히 **가로로 긴 그림(전신 옆모습 2.07:1)은 정사각 칸에서 자리를 못 쓴다**
 * (폭을 맞추면 잉크 높이가 7.8px 로, 옆자리 아이콘의 절반이 된다).
 * vectorize/compare2.mjs 가 후보들을 18·20·32px 로 라이트·다크·활성 알약에 나란히 찍는다.
 *
 * 이모지(🇰🇷 🇺🇸)를 그대로 안 쓰는 이유: currentColor 를 안 따라 활성 알약(파랑) 위에서
 * 아이콘 열이 깨지고, 플랫폼마다 그림이 달라진다(🇰🇷 는 윈도우에서 글자 "KR").
 *
 * ⚠️ 여신상 시안의 출처가 확인되지 않았다. 저장소가 public 이라 라이선스를 확인하거나,
 *    비율만 참고하고 세부를 다르게 다듬어야 할 수 있다.
 */

/** 태극 — 🇰🇷 에서 태극만 남겼다(건곤감리는 이 크기에서 회색 얼룩이 된다). */
function KrTaegukIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/*
        기울기 33.69° = atan(2/3) — 깃면이 3:2 라 태극의 축이 그 대각선과 나란하다.
        이 기울기가 태극기의 태극을 일반적인 음양 문양과 가른다.

        ⚠️ 2026-08-14 까지 좌우가 뒤집힌 채였다("물결이 반대로 친다"). 기울기 부호와
        작은 호 둘의 sweep 이 함께 뒤집혀 있어서 얼핏 그럴듯해 보였다 — 국기의 태극을
        거울에 비친 꼴이다. 눈으로 맞추지 말고 **국기 원본 경로와 대조할 것**:
          빨강 M12 0 a18 18 0 1 1 -36 0  24 24 0 1 1 48 0   (rotate 33.69)
          파랑 M-24 0 a24 24 0 1 0 48 0  A12 12 0 1 0 0 0  a12 12 0 1 1 -24 0
        여기서 읽어야 할 결론은 하나다. 축을 수평으로 눕혔을 때 경계선은
        **왼쪽에서 아래로 파이고 오른쪽에서 위로 솟는다**. 작은 호의 sweep 0·1 이 그 순서다.

        색이 하나뿐이라 반쪽만 채운다. 채우는 쪽은 **국기의 파랑(아래)** 이다 — 큰 호의
        sweep 1 이 그것이고, 0 이면 빨강(위)이 채워진다. 경계선은 어느 쪽을 채우든 같다.
      */}
      <g transform="rotate(33.69 12 12)">
        <path
          d="M3.6 12 A4.2 4.2 0 0 0 12 12 A4.2 4.2 0 0 1 20.4 12 A8.4 8.4 0 0 1 3.6 12 Z"
          fill="currentColor"
        />
      </g>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/**
 * 자유의 여신상 — 미장. 앞서 쓰던 독수리(같은 방법으로 뜬 시안)를 갈아 끼웠다.
 *
 * 시안을 한 번 갈았다(2026-08-12). 처음엔 **얼굴만** 있는 시안이었는데, 뿔이 상자를
 * 넓게 차지해서 정작 얼굴이 18px 에서 안 읽혔다("얼굴이 너무 안 보인다").
 *
 * ⭐⭐ **키우는 방법을 바꿨다. 상자 안에서 확대하지 않고, 상자째 크게 그린다.**
 * 이 시안은 세로로 길어서(282×425) 상자에 맞추면 세로가 먼저 꽉 찬다. 거기서 배율만
 * 올리면 남는 건 가로 여백인데 확대는 가로세로를 같이 키우므로, **세로가 먼저 넘쳐
 * 횃불 꼭대기와 옷자락이 잘렸다**(120% 면 0.96씩). 경로는 100% 로 두고 SVG 자체를
 * 크게 그리면 잘리는 데가 전혀 없다.
 *
 * BLEED 가 그 장치다. 그림은 size×1.22 로 그리고 음수 마진으로 그만큼 되당겨,
 * **줄에서 차지하는 자리는 size 그대로**다. 그래야 옆 항목(태극)과 라벨 왼쪽 선이
 * 어긋나지 않는다. 18px 자리에서 23px 로 그려 잉크 세로가 20.7px 이 된다.
 *
 * ⭐ 세로로 긴 글리프를 옆 아이콘과 **같은 크기로 그리면 더 작아 보인다**(가로를 못
 * 써서 잉크가 얇다). 광학적으로 맞추려고 일부러 키운 것이지 실수가 아니다.
 * 비율을 바꾸려면 BLEED 만 만질 것 — 경로 좌표와 transform 은 손대지 말 것.
 */
/** 그림을 자리보다 몇 배 크게 그릴지. 넘친 만큼은 음수 마진으로 되당긴다. */
const LIBERTY_BLEED = 1.25;

function LibertyIcon({ size = 20 }: { size?: number }) {
  const draw = Math.round(size * LIBERTY_BLEED);
  const pull = (draw - size) / 2;
  return (
    <svg
      width={draw}
      height={draw}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, margin: -pull }}
    >
      <g transform="translate(4.839 1.200) scale(0.05080) translate(-349.000 -280.000)">
        <path fillRule="evenodd" d="M 389.154 283.451 C 387.746 287.345, 385.009 289.821, 376.054 295.303 C 370.795 298.522, 369.451 299.957, 367.304 304.647 C 365.269 309.093, 364.858 311.273, 365.224 315.688 C 365.629 320.570, 365.445 321.278, 363.590 321.985 C 352.225 326.316, 349 328.988, 349 334.076 C 349 337.684, 350.354 338.469, 353.275 336.555 C 357.250 333.951, 366.633 331.157, 373.767 330.454 C 383.358 329.509, 394.133 331.353, 402.250 335.329 L 409 338.635 409 334.752 C 409 327.969, 406.383 325.491, 395.950 322.392 L 391.156 320.969 394.545 315.932 C 400.064 307.732, 401.181 301.242, 398.569 292.562 C 397.099 287.679, 392.587 280, 391.187 280 C 390.755 280, 389.840 281.553, 389.154 283.451 M 367.004 339.099 C 361.316 340.213, 355.014 342.706, 352.750 344.739 C 351.788 345.603, 351 347.580, 351 349.132 C 351 352.379, 352.852 353.836, 361 356.998 C 364.025 358.172, 367.123 359.742, 367.885 360.487 C 368.964 361.542, 369.295 366.215, 369.385 381.670 C 369.498 401.111, 369.552 401.600, 372.166 406.572 C 374.199 410.438, 377 420.354, 377 423.684 C 377 423.858, 377.900 424, 379 424 C 380.100 424, 381 424.587, 381 425.305 C 381 427.570, 388.859 477.097, 391.520 491.605 C 394.554 508.144, 398.934 527.182, 399.962 528.298 C 400.366 528.737, 403.337 525.812, 406.563 521.798 C 415.616 510.537, 416 510.258, 416 514.946 C 416 518.779, 409.522 531.238, 403.960 538.102 C 398.937 544.301, 388.308 553.881, 381.641 558.218 L 377.078 561.186 383.153 573.343 C 386.494 580.029, 389.445 585.725, 389.711 586 C 390.830 587.156, 408.839 563.506, 420 546.224 C 424.005 540.023, 427.490 535.157, 427.744 535.410 C 428.521 536.188, 423.922 549.093, 420.228 556.500 C 416.227 564.521, 414.026 567.884, 401.866 584.558 L 393.072 596.616 398.678 611.058 C 401.762 619.001, 404.608 625.865, 405.004 626.311 C 406.338 627.817, 427.332 593.319, 440.186 568.500 C 448.449 552.547, 449.553 552.156, 446.392 566.303 C 444.312 575.609, 438.320 590.275, 431.376 603.051 C 428.343 608.631, 426.017 613.351, 426.206 613.540 C 426.860 614.193, 472.533 581.727, 484.056 572.418 C 497.215 561.788, 500.176 560.015, 504.785 560.006 C 507.749 560.001, 507.967 560.194, 507.012 561.978 C 504.236 567.165, 488.499 585.680, 478.094 596.001 C 470.848 603.189, 450.467 620.358, 423.750 641.781 C 400.238 660.634, 381 676.267, 381 676.521 C 381 677.541, 403.312 688.094, 404.503 687.637 C 405.207 687.367, 413.699 678.144, 423.375 667.142 C 439.491 648.816, 443 645.092, 443 646.315 C 443 646.553, 437.150 656.796, 430 669.077 C 422.850 681.357, 417 691.743, 417 692.155 C 417 693.262, 434.578 697.810, 435.376 696.911 C 435.576 696.685, 439.454 689.525, 443.994 681 C 459.286 652.282, 474.628 626.460, 490.338 603 C 499.498 589.320, 515.961 567, 516.891 567 C 517.291 567, 518.441 567.602, 519.448 568.338 C 521.166 569.595, 520.792 570.552, 513.280 584.088 C 508.882 592.015, 503.574 601.650, 501.486 605.500 C 499.397 609.350, 495.076 617.287, 491.882 623.137 C 480.873 643.306, 451.994 699.328, 452.398 699.732 C 452.621 699.955, 458.683 700.398, 465.869 700.718 C 475.444 701.144, 479.329 700.972, 480.410 700.075 C 481.222 699.401, 483.098 695.171, 484.579 690.675 C 492.413 666.900, 509.301 624.967, 510.542 626.209 C 510.794 626.461, 508.802 641.029, 506.115 658.583 C 498.975 705.237, 499.462 700.173, 502.183 699.491 C 503.458 699.172, 509.124 697.870, 514.776 696.597 C 520.427 695.324, 525.246 694.087, 525.484 693.849 C 525.722 693.611, 525.438 687.586, 524.854 680.458 C 524.237 672.932, 524.002 654.504, 524.294 636.500 C 524.737 609.125, 525.096 603.777, 527.365 590.765 C 529.684 577.469, 531.853 571, 533.994 571 C 534.414 571, 534.989 589.337, 535.270 611.750 C 535.687 644.926, 536.183 655.840, 537.942 670.467 C 539.130 680.349, 540.272 688.606, 540.481 688.814 C 541.157 689.490, 559.968 680.174, 568.533 674.922 C 587.617 663.219, 609.155 643.210, 623.689 623.681 C 627.755 618.218, 630.951 613.644, 630.791 613.516 C 630.450 613.245, 612.358 603.238, 603.102 598.201 L 596.705 594.720 593.348 598.610 C 575.585 619.198, 571.368 623.818, 570.535 623.604 C 570.004 623.468, 565.925 613.873, 561.470 602.282 C 556.489 589.323, 551.712 578.662, 549.066 574.601 C 543.910 566.688, 534.663 557.876, 527.937 554.468 C 521.036 550.971, 519.692 547.952, 520.568 537.910 C 521.259 529.987, 521.250 529.945, 517.553 523.955 L 513.844 517.946 516.570 510.999 L 519.296 504.051 516.711 498.275 C 515.289 495.099, 513.397 489.286, 512.507 485.358 C 510.506 476.528, 506.571 470.160, 500.302 465.609 C 494.001 461.034, 488.651 459.629, 479.746 460.211 C 465.239 461.158, 454.947 470.404, 451.910 485.217 C 451.314 488.123, 449.687 493.410, 448.295 496.967 C 445.620 503.799, 445.740 506.482, 449.092 514.693 C 450.258 517.549, 450.146 518.419, 448.027 522.943 C 446.724 525.724, 445.440 528, 445.173 528 C 444.907 528, 443.183 526.852, 441.343 525.448 C 437.265 522.338, 435.005 518.196, 434.986 513.800 C 434.976 511.386, 432.962 507.452, 427.486 499.147 C 423.369 492.902, 420 487.351, 420 486.811 C 420 485.884, 427.989 486.209, 440.250 487.635 C 444.181 488.092, 445 487.910, 445 486.575 C 445 483.767, 449.656 471.505, 452.332 467.267 C 460.084 454.986, 473.300 449.334, 488.022 452.004 C 504.153 454.929, 515.026 465.591, 518.224 481.617 C 518.869 484.853, 519.511 487.665, 519.649 487.867 C 520.115 488.547, 557 483.679, 557 482.938 C 557 482.535, 553.962 481.687, 550.250 481.053 C 525.960 476.907, 526.013 476.922, 525.394 474.120 C 525.075 472.679, 524.625 470.788, 524.393 469.918 C 523.832 467.810, 525.476 466.517, 539 458.426 C 546.269 454.078, 549.852 451.418, 548.738 451.198 C 547.769 451.006, 540.603 452.074, 532.814 453.571 L 518.651 456.293 515.769 453.067 C 513.856 450.927, 513.195 449.448, 513.803 448.671 C 514.308 448.027, 520.421 439.741, 527.388 430.259 C 540.104 412.952, 542.687 408.881, 539.920 410.506 C 538.104 411.572, 522.077 424.311, 510.728 433.709 C 505.904 437.704, 500.865 441.247, 499.532 441.581 C 497.004 442.216, 490.431 440.506, 489.479 438.966 C 489.177 438.478, 487.416 428.581, 485.565 416.973 C 483.714 405.364, 481.941 395.607, 481.623 395.290 C 480.708 394.375, 480.310 396.397, 477.552 416 C 473.960 441.527, 474.478 439.773, 470.176 440.968 C 463.437 442.839, 466.113 444.350, 441 424.500 C 424.469 411.433, 422 409.646, 422 410.744 C 422 411.283, 428.518 420.374, 436.484 430.945 C 450.916 450.095, 450.962 450.174, 449.234 452.558 C 448.280 453.873, 446.799 455.189, 445.943 455.481 C 445.087 455.773, 437.887 454.663, 429.943 453.014 C 421.999 451.365, 414.938 450.013, 414.250 450.008 C 411.598 449.991, 413.294 451.648, 419.769 455.401 C 436.321 464.995, 440 467.794, 440 470.789 C 440 475.461, 438.105 476.849, 429.500 478.482 C 418.799 480.512, 415.307 480.441, 414.091 478.170 C 413.552 477.163, 412.186 470.826, 411.055 464.088 C 409.924 457.349, 407.221 444.110, 405.049 434.668 C 399.951 412.512, 399.187 407.406, 398.441 390.500 C 397.759 375.072, 396.866 370.887, 393.355 366.673 C 389.379 361.901, 390.140 360.342, 398.250 356.640 C 406.728 352.770, 408.479 351.043, 407.574 347.441 C 405.876 340.673, 382.993 335.969, 367.004 339.099 M 476.408 473.754 C 471.374 477.131, 466 481.651, 466 482.507 C 466 482.857, 468.469 482.835, 471.488 482.458 C 476.040 481.889, 477.082 482.049, 477.598 483.394 C 478.966 486.959, 472.638 492.482, 465.500 493.953 C 462.956 494.477, 462.449 495.097, 462.167 498.035 C 461.168 508.444, 469.266 519, 478.250 519 C 484.389 519, 485.936 515.053, 480.832 512.413 L 477.664 510.775 480.332 509.156 C 483.652 507.141, 483.660 506.622, 480.393 505.133 L 477.786 503.945 481.143 501.653 C 484.430 499.407, 484.494 499.226, 484.223 492.930 C 484.071 489.393, 484.206 485.432, 484.523 484.128 C 485.054 481.941, 485.488 481.792, 490.050 482.231 C 492.772 482.492, 495 482.586, 495 482.438 C 495 481.402, 483.194 471.037, 482 471.024 C 481.175 471.016, 478.658 472.244, 476.408 473.754 M 380.767 512.706 C 379.368 515.893, 377.657 520.949, 376.965 523.942 C 375.640 529.679, 375.050 548.383, 376.159 549.492 C 376.517 549.850, 380.041 547.994, 383.990 545.368 C 390.648 540.941, 391.140 540.371, 390.743 537.546 C 389.854 531.213, 384.748 508.466, 384.046 507.706 C 383.642 507.270, 382.167 509.520, 380.767 512.706 M 469 531.875 C 469 540.441, 469.918 543.765, 473.190 547.036 C 476.149 549.995, 482.571 552.372, 486.087 551.809 C 487.799 551.535, 487.336 550.288, 482.001 540.813 C 476.897 531.746, 472.085 526, 469.596 526 C 469.268 526, 469 528.644, 469 531.875" />
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
  { href: "/", label: "시장 브리핑", icon: "monitoring", sub: "지표 25개로 잰 오늘의 시장 온도" },
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
      { label: "국장 카더라", href: "/kadera", Glyph: KrTaegukIcon },
      {
        label: "미장 카더라",
        href: "/kadera/us",
        Glyph: LibertyIcon,
        sub: "미국 시장에선 무엇이 화제인지",
      },
    ],
  },
  // ⚠️ COMING_SOON 에 두지 말 것 — 본문 헤더(PageHeader)가 NAV 에서 경로를 못 찾아
  // **제목 칸을 통째로 비운다.** 예고 시절에도 배지만 달아 NAV 에 뒀던 이유다.
  {
    href: "/insider",
    label: "내부자 리포트",
    // 아이콘은 첫 판이던 `contact_page` 로 돌아왔다. 한때 중절모·선글라스 실루엣을 직접 그려 넣었지만
    // (얼굴을 감춘 쪽), 옆의 폰트 아이콘들과 나란히 놓고 보면 이 그림이 낫다는 판단이다.
    icon: "contact_page",
    // ⚠️ "채팅방에 오른 미국 종목에 남은 공시 기록" 이었다. 그 부제는 이 화면의
    //    모집단을 **카더라 종목으로** 못 박는데, 실제로는 의원 축이 650종목을 보고
    //    거물 축은 보유 전부(migration_051)를 본다. 부제가 화면보다 좁으면 독자가
    //    카드 숫자를 통째로 다르게 읽는다(서학개미에서 같은 실수를 했다).
    sub: "임원과 의원, 월가 거물이 무엇을 사고팔았나",
    // ⚠️ `badge: "준비 중"` 이 여기 있었다. 이 줄을 지우는 것이 곧 **화면을 여는 것**이다
    //    (사이드바에 예고로 걸어 두고 만들었다). 2026-08-26 에 뗐다.
  },
  { href: "/mdd", label: "MDD 정밀분석", icon: "trending_down", sub: "고점에서 얼마나 내려왔고 언제 회복했을까" },
  // ⚠️ **'준비 중' 배지를 단 채로 NAV 에 있다.** 화면은 다 만들어졌지만 아직 안 열었다.
  // COMING_SOON 에 두면 본문 헤더(PageHeader)가 NAV 에서 경로를 못 찾아 **제목 칸을
  // 통째로 비운다** — 그래서 이 화면만 제목도 부제도 없이 카드부터 시작했다.
  // 열 때는 이 줄의 badge 만 지우면 된다.
  {
    href: "/seohak",
    // ⚠️ "서학개미 해부도" 였다(2026-08-27 개명). '해부'는 갈라서 안을 보여 준다는 약속인데,
    //    정작 가르던 카드(종류별 구성 · 개인과 기관 · 시작 연도별 성과)는 근거가 틀려 다 뺐다.
    //    남은 여섯 장은 언제 얼마가 나갔고 얼마나 머물렀고 지금 얼마가 됐나 하는 **기록**이라,
    //    이름을 그쪽으로 옮겼다. 주소(/seohak)는 색인이 이미 끝나 있어 그대로 둔다.
    label: "서학개미 장부",
    Glyph: AntIcon,
    // ⚠️ "한국인이…" 였다. 이 화면은 **개인**을 재는데 그 부제는 국민연금까지 포함한
    // 전 국민을 가리켰다. 화면의 모집단이 부제와 갈리면 카드 숫자를 통째로 다르게 읽는다.
    // ⚠️ 그다음엔 "얼마를 넣었고 지금 얼마가 됐나" 였는데, 그건 **카드 한 장**('원화로
    // 보면')만 가리켰다. 화면이 자라면서 매매 습관·보유기간·가계 자리·ETF 까지 들어왔다.
    // 두 축(어떻게 사고파나 · 그래서 얼마가 됐나)으로 줄여 적는다.
    sub: "개인이 미국 주식을 어떻게 사고팔고 얼마가 됐나",
    // ⚠️ `badge: "준비 중"` 이 여기 있었다. 이 줄을 지우는 것이 곧 **화면을 여는 것**이다
    //    (사이드바에 예고로 걸어 두고 만들었다). 2026-08-19 에 뗐다.
  },
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
// 아이콘은 NAV 항목과 같은 규칙이다 — 직접 그린 Glyph 든 Material Symbols 이름(icon)이든
// 하나만 있으면 되고, NavGlyph 가 골라 그린다.
const COMING_SOON: { label: string; badge: string; tip: string; after: string; icon?: string; Glyph?: Glyph }[] = [
  // 간밤 미장에서 크게 움직인 종목과, 그 종목과 사업으로 엮인 국내 종목을 개장 전에 잇는다.
  //
  // ⛔ **화면과 파이프라인은 다 만들어졌지만 아직 안 열었다.** 여기(COMING_SOON)에 있으면
  // 사이드바에 눌리지 않는 줄로 서고, 주소를 직접 쳐도 배포된 곳에서는 404 다
  // (app/preview/page.tsx 의 PUBLIC 상수). **두 곳을 같이 풀어야 열린다.**
  //
  // ⚠️ 한때 NAV 에 href 를 달고 배지만 '준비 중' 으로 뒀다. **배지는 표시일 뿐 아무것도
  // 막지 않는다** — 2026-08-30 에 프로덕션 사이드바에서 그냥 눌려 들어가졌다.
  // 본문 헤더는 DEEP_PAGES 의 "/preview" 항목이 대신 채운다.
  //
  // `after` 가 NAV 의 마지막 항목이라 사이드바 맨 아래에 선다. 끝에 두는 이유는 이 화면이
  // 하루 중 07~09시에만 쓸모가 있어서다 — 종일 보는 브리핑·카더라를 밀어낼 자리가 아니다.
  //
  // 아이콘 `preview` 는 창 안에 눈이 든 그림이라 이름 그대로 '미리보기' 를 가리킨다.
  // ⚠️ 후보를 **20px 실물로 띄워 놓고** 골랐다(96px 로 보면 다 그럴듯하다). 이 그림은
  // 안쪽 눈이 작아 20px 에서 점처럼 뭉치는 편이다 — 나중에 흐려 보이면 그게 이유이고,
  // 그때 볼 대안은 `pageview`(문서에 돋보기)·`double_arrow`(겹화살표)·`next_plan` 이다.
  // ⚠️ 위 내부자 리포트의 `contact_page` 와 **둘 다 네모 안에 뭐가 든 모양**이라 20px
  // 사이드바에서 제일 닮은 한 쌍이다(세로로 두 칸 떨어져 있어 지금은 견딘다).
  {
    label: "국장 미리보기",
    badge: "준비 중",
    tip: "현재 열심히 개발 중입니다!",
    after: "/seohak",
    icon: "preview",
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
/**
 * 자리보다 몇 배 크게/작게 그릴지. 여신상(LIBERTY_BLEED)과 같은 장치인데 **방향이 반대**다 —
 * 개미는 통으로 채운 덩어리라 같은 크기로 그리면 옆의 선 아이콘들보다 무겁게 보인다.
 * 넘거나 모자란 만큼은 마진으로 되메워 **줄에서 차지하는 자리는 size 그대로**다.
 */
const ANT_SHRINK = 0.85;

function AntIcon({ size = 16 }: { size?: number }) {
  const draw = Math.round(size * ANT_SHRINK);
  const pull = (draw - size) / 2;
  return (
    <svg
      width={draw}
      height={draw}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.52}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, margin: -pull }}
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
 * **쉬는 값은 `false` 다 — `undefined`(=Next 기본값) 가 아니다.** 기본값으로 두면
 * 링크가 화면에 들어오는 순간 자동으로 프리페치가 나간다. 사이드바와 모바일 메뉴가
 * 같은 목록을 두 벌 그리는 탓에 홈 한 번 여는 데 그 요청이 **9건** 붙었다.
 * 이 사이트는 루트 레이아웃이 cookies() 를 읽어 전 라우트가 동적이라, 9건이 전부
 * CDN 을 못 타고 함수를 깨운다(x-vercel-cache: MISS). 방문 1회에 함수 10회였다.
 *
 * 그 9건이 사 오던 건 loading 껍데기뿐이고(3.7~3.9KB), `/seohak` 과 `/` 는 loading.tsx
 * 가 없어 본문이 `[null,null]` 인 빈 응답이었다. 끄면서 잃는 건 hover 없이 곧바로 누른
 * 첫 탭에서 스켈레톤이 0.06~0.1초 늦게 뜨는 것뿐이다 — 뒤이어 기다릴 데이터 왕복이
 * 0.6~1.3초라 그 10분의 1 미만이다. (전부 2026-08-27 프로덕션 실측)
 *
 * ⚠️ `false` 는 뷰포트 진입뿐 아니라 **hover 프리페치까지 끈다**(Next 문서 Link#prefetch).
 * 그래서 아래 arm 이 선택이 아니라 필수다. 이 훅을 걷어내고 `prefetch={false}` 만
 * 남기면 위에 적은 클릭 왕복 0.7~1.5초가 그대로 돌아온다.
 *
 * prefetch 는 **프로덕션 빌드에서만 동작한다** — `npm run dev` 로는 확인할 수 없고
 * `npm run build:local` + `start:local`(hatzze-prod) 로 봐야 한다.
 */
function useIntentPrefetch() {
  const [armed, setArmed] = useState<string[]>([]);
  const arm = (href: string) => setArmed((a) => (a.includes(href) ? a : [...a, href]));
  return (href: string) => ({
    // true = 데이터까지 전부(클라이언트 캐시 5분). false = 자동 프리페치 없음.
    prefetch: armed.includes(href),
    onMouseEnter: () => arm(href),
    onFocus: () => arm(href),
    onTouchStart: () => arm(href),
  });
}

/** NAV 항목의 현재 페이지 판정. 사이드바와 모바일 탭바가 같은 규칙을 써야 한다. */
/**
 * **사이드바에 안 나오지만 자기 제목이 있어야 하는** 하위 페이지.
 *
 * 내부자 리포트의 전체보기 여섯 장이 그렇다. NAV 의 children 으로 넣으면 사이드바에
 * 여섯 줄이 더 생기고, 아예 안 넣으면 PageHeader 가 부모(`/insider`)를 집어
 * **두 페이지가 같은 h1** 을 갖는다(그 문제로 /kadera 와 /kadera/us 가 한 번 겹쳤다).
 *
 * 명단·문구의 원본은 `app/insider/lists.ts` 다 — 여기서 베끼지 말고 그걸 읽는다.
 * 카드와 전체보기가 같은 말을 해야 독자가 같은 자료로 읽는다.
 */
const DEEP_PAGES: Record<string, { label: string; sub: string; badge?: string }> = {
  ...Object.fromEntries(
    INSIDER_LIST_SLUGS.map((slug) => [
      insiderListHref(slug),
      { label: INSIDER_LISTS[slug].title, sub: INSIDER_LISTS[slug].sub },
    ]),
  ),
  // ⭐ 아직 안 연 화면. 사이드바에는 COMING_SOON 으로 서 있어 NAV 에서 못 찾으므로,
  // 본문 헤더가 쓸 제목을 여기 둔다 — 로컬에서 볼 때 제목 칸이 비지 않는다.
  // 여는 날 COMING_SOON → NAV 로 옮기면서 이 줄을 지운다.
  "/preview": {
    label: "국장 미리보기",
    sub: "간밤 미국에서 움직인 것이 오늘 아침 어디에 닿나",
    badge: "준비 중",
  },
};

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
          {SLOGAN}
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
                <NavGlyph item={soon} size={20} />
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
                // ⚠️ --c-blue 가 아니라 --c-nav-active 다. 흰 글자가 얹히는 자리라 브랜드
                // 파랑 그대로면 명암비가 4.5 에 못 미친다(globals.css 의 토큰 주석).
                background: active ? "var(--c-nav-active)" : undefined,
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
          // 바탕·글자색은 .hz-tg-cta 가 쥔다. 평소엔 카드 아이콘 타일과 같은 옅은 하늘색이고
          // (꽉 찬 파랑을 늘 깔면 사이드바에서 혼자 튀어 광고 배너처럼 읽혔다, 2026-08-03),
          // 호버·포커스에서만 현재 페이지 알약과 같은 파랑으로 꽉 찬다.
          // ⚠️ 두 값을 여기 인라인으로 되돌리면 인라인이 :hover 를 이겨 호버가 죽는다.
          //
          // `hz-tip` 은 이 화면의 공용 말풍선이다. 라벨("오늘 뭐래?")이 무엇을 주는
          // 채널인지 말하지 않아서, 올려 보면 한 줄로 알려 준다.
          // ⚠️ `.hz-tip` 이 커서를 default 로 못박으므로 `.hz-tg-cta` 가 pointer 를
          //    되찾는다(globals.css). 누르면 나가는 링크인데 화살표면 거짓말이 된다.
          className="hz-tip hz-tg-cta"
          data-tip="텔레그램에서 매일 시장 요약을 해 드립니다"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 14,
            borderRadius: R.control,
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
// 다 들어간다"가 전제였는데, 서학개미 장부가 붙어 5개가 되면서 칸마다 라벨이 눌린다.
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
                <NavGlyph item={soon} size={20} />
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

/**
 * 이용자의 선택을 1년짜리 쿠키로 남긴다(테마 · 통화).
 *
 * ⚠️ 컴포넌트 **밖**에 둔다. 리액트 컴파일러 규칙이 컴포넌트 안에서 바깥 값(여기서는
 * `document.cookie`)에 대입하는 것을 막는다 — 함수로 감싸면 그 대입이 이 모듈의 일이
 * 되어 통과한다. 테마 토글이 먼저 쓰던 줄도 여기로 모았다.
 * ⚠️ 쿠키가 없으면 새로고침마다 기본값으로 돌아간다. 서버는 첫 렌더에서 쿠키 말고는
 * 이용자의 선택을 알 길이 없다(layout.tsx 가 둘 다 읽는다).
 */
function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * 통화 스위치 — **달러 금액을 내는 화면에서만** 뜬다(서학개미 장부 · 내부자 리포트).
 *
 * 서학개미는 예탁원 결제(달러)와 KRX·한국은행(원)을 함께 다뤄서, 원천이 준 통화를
 * 그대로 내면 한 페이지에 두 통화가 섞인다. 내부자 리포트는 전부 달러라 한국 독자가
 * 크기를 가늠하기 어렵다. 둘 다 기본을 원화로 두고 이 스위치로 갈아 끼운다.
 *
 * ## ⭐ 테마 토글과 같은 수다
 *
 * 뿌리 요소의 `data-cur` 하나를 바꾸면 globals.css 가 숨길 쪽을 고른다. 금액은 카드가
 * **두 벌 다 그려 놓았다**(`app/seohak/money.tsx`) — 그 화면의 카드가 거의 다 서버
 * 컴포넌트라, 통화를 리액트 상태로 두면 그 전부를 클라이언트로 끌어와야 한다.
 *
 * ⚠️ 환율(FRED)을 못 받은 날에는 카드가 달러만 낸다(`Money` 가 그렇게 떨어진다).
 * 그때 이 스위치는 눌러도 화면이 안 바뀐다. **셸은 그 사정을 모른다** — 레이아웃이
 * 페이지의 로더 결과를 볼 수 없어서다. 드문 고장 경로이고, 그날은 페이지가 어차피
 * 성한 모습이 아니라 여기서 가리지 않는다.
 */
function CurrencyToggle({ initial }: { initial: "krw" | "usd" }) {
  const [cur, setCur] = useState<"krw" | "usd">(initial);
  const pick = (next: "krw" | "usd") => {
    if (next === cur) return;
    track("currency_toggle", { to: next });
    setCur(next);
    // ⚠️ 원화도 **값을 적는다**(예전엔 속성을 지웠다). 지우면 "안 고름"과 같아져서,
    //    달러가 기본인 화면(내부자 리포트)에서 ₩ 를 눌러도 달러로 돌아간다.
    document.documentElement.setAttribute("data-cur", next);
    remember("hz-cur", next);
  };
  return (
    <span className="hz-cur-switch" role="group" aria-label="통화 바꾸기">
      {([["krw", "₩"], ["usd", "$"]] as const).map(([k, glyph]) => (
        <button key={k} type="button" onClick={() => pick(k)} aria-pressed={cur === k}
                aria-label={k === "krw" ? "원화로 보기" : "달러로 보기"}>
          {glyph}
        </button>
      ))}
    </span>
  );
}

/**
 * 통화 스위치가 뜨는 화면과 그 화면의 **기본 통화**.
 *
 * ⚠️ 여기 없는 화면에 스위치를 두면 눌러도 아무것도 안 바뀌는 단추가 된다.
 * ⚠️ 기본값은 CSS 에도 적혀 있다(`[data-cur-default]`, globals.css). **두 곳이 같아야
 *    한다** — 갈리면 서버가 그린 화면과 스위치의 눌린 칸이 어긋난다.
 */
const CURRENCY_PAGES: { prefix: string; fallback: "krw" | "usd" }[] = [
  { prefix: "/seohak", fallback: "krw" },
  // 재료가 전부 미국 공시라 달러가 원본이고, 원화는 크기를 가늠하라고 얹은 것이다.
  { prefix: "/insider", fallback: "usd" },
];

/**
 * 채널 등록 신청. 국장 카더라 히어로의 큰 버튼이었는데 탑바로 옮겼다 — 그 자리에는
 * 미장으로 건너가는 통로가 서는 편이 낫다는 판단이다(kadera/page.tsx 주석 참고).
 *
 * ⚠️ 카더라 두 화면에서만 뜬다. 채널을 늘리는 일은 그 두 화면의 재료를 늘리는 것이라,
 *    브리핑이나 내부자에서 권하면 맥락이 없다.
 * ⚠️ **좁은 화면에서는 글자가 빠지고 아이콘만 남는다**(globals.css 의 .hz-topbar-cta).
 *    글자를 단 채로 두면 320px 탑바에 90px 이 더 붙어 햄버거가 도로 밀려난다 —
 *    그 잘림을 오늘 고쳤다.
 */
function ChannelRequest() {
  return (
    <a
      href="https://forms.gle/PRapNH9rz8YuF2zu9"
      target="_blank"
      rel="noopener noreferrer"
      className="hz-btn-soft hz-topbar-cta"
      title="채널 등록 신청"
      data-ga="cta_click"
      data-ga-cta="register_channel"
      data-ga-surface="topbar"
    >
      <Icon name="add_circle" style={{ fontSize: 15 }} />
      <span className="hz-topbar-cta-label">채널 등록 신청</span>
    </a>
  );
}

/**
 * 머리 오른쪽 도구 묶음. 통화 스위치와 채널 등록 신청이 **테마 단추 왼쪽**이다.
 *
 * ⚠️ 통화는 **달러 금액을 내는 화면에만** 있는 개념이라 경로로 가린다. 국장 화면에
 * 두면 눌러도 아무것도 안 바뀌는 단추가 된다.
 */
function PageTools({ theme, currency }: {
  theme: "light" | "dark";
  /** null = 아직 아무것도 안 골랐다. 그때는 화면의 기본값을 쓴다. */
  currency: "krw" | "usd" | null;
}) {
  const pathname = usePathname();
  return (
    <>
      {/* 쿠키로 고른 게 없으면(null) 그 화면의 기본값을 눌린 칸으로 쓴다. */}
      {(() => {
        const page = CURRENCY_PAGES.find((p) => pathname.startsWith(p.prefix));
        return page ? <CurrencyToggle key={page.prefix} initial={currency ?? page.fallback} /> : null;
      })()}
      {pathname.startsWith("/kadera") && <ChannelRequest />}
      <ThemeToggle initial={theme} />
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
    remember("hz-theme", next);
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
function PageHeader({ theme, currency }: { theme: "light" | "dark"; currency: "krw" | "usd" | null }) {
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
  // 사이드바에 안 나오는 하위 페이지(전체보기)도 자기 제목을 쓴다. 안 그러면 부모와
  // 같은 h1 이 된다.
  const deep = DEEP_PAGES[pathname];
  const title = deep?.label ?? child?.label ?? page?.label;
  const sub = deep?.sub ?? child?.sub ?? page?.sub;
  // 배지는 부모 것이다. 서브가 물려받으면 "25개 지표" 같은 남의 표찰이 따라 붙는다.
  // 배지는 부모 것이라 서브는 물려받지 않는다. 다만 DEEP_PAGES 가 자기 배지를 들고
  // 있으면 그건 자기 것이다(아직 안 연 화면의 '준비 중').
  const badge = deep ? deep.badge : child ? undefined : page?.badge;
  return (
    <header className="hz-page-head">
{/* #267 의 가드: NAV 에 없는 경로(법률 문서)에서는 제목 칸을 통째로 비운다.
          그 안에 콘솔 리디자인의 배지를 넣는다 — 둘은 서로 독립이다. */}
      {/* ⚠️ `page` 만으로는 부족하다 — NAV 에 없고 DEEP_PAGES 에만 있는 화면
          (아직 안 연 /preview)이 제목 칸을 통째로 비운다. */}
      {(page || deep) && (
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
        <PageTools theme={theme} currency={currency} />
      </div>
    </header>
  );
}

function TopBar({
  theme,
  currency,
  scrolledDown,
  menuOpen,
  onMenuToggle,
}: {
  theme: "light" | "dark";
  currency: "krw" | "usd" | null;
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
        <PageTools theme={theme} currency={currency} />
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
 * 새 화면을 알리는 띠. 본문 맨 위(제목 위)에 한 줄로 눕고, X 를 누르면 사라진다.
 *
 * 자리를 **탑바가 아니라 본문 흐름**으로 잡았다. 탑바(.hz-topbar)는 좁은 화면에서만
 * 그려져서 거기 넣으면 데스크톱 방문자가 이 소식을 영영 못 본다. 본문 맨 위에 두면
 * 두 폭 모두에서 보이고, 카드·헤더와 같은 상자 안이라 왼쪽 선도 저절로 맞는다.
 * 스크롤하면 같이 올라가 사라지는 것도 의도다 — 소식은 도착했을 때 한 번 보이면 된다.
 *
 * ⭐ **이미 그 화면에 있으면 안 그린다.** 보고 있는 페이지를 보러 가라고 권하는 띠는
 * 알림이 아니라 잡음이다.
 *
 * ⚠️ **문구에 숫자를 넣지 말 것.** 종목 수·채널 수는 매일 바뀌는데 이 띠는 한 번 닫으면
 * 다시 안 보여서, 틀린 값이 조용히 남는다(아래 PcHint 가 같은 이유로 숫자를 뺐다).
 *
 * 여닫이 기계는 PcHint 와 같다(useSyncExternalStore + localStorage). 이유는 그쪽 주석에.
 * ⭐ 키에 **버전을 박아 둔다** — 다음에 다른 소식으로 이 띠를 되쓸 때 키만 바꾸면
 * 예전에 닫은 사람에게도 새로 뜬다. 키를 재사용하면 그 사람들은 새 소식을 못 본다.
 */
/* ⭐ 키를 갈아 끼우는 것이 곧 **띠를 되쓰는 것**이다. 소식은 하나뿐이라 아래 여섯만 바꾸면
   이전 소식은 사라지고 새 소식만 뜬다. 예전 소식을 닫아 둔 사람도 키가 달라져 다시 본다
   (닫힌 표시는 옛 키에 남아 있을 뿐 새 키를 막지 않는다).
   ⚠️ 옛 키(`hz-news-us-kadera`)를 되쓰지 말 것 — 미장을 닫았던 사람은 새 소식을 못 본다. */
const NEWS_KEY = "hz-news-insider";
const NEWS_EVENT = "hz-news-change";
const NEWS_HREF = "/insider";
/* 문구를 셋으로 나눈 건 가운데 화면 이름에만 밑줄을 긋기 위해서다 —
   띠 전체가 이미 링크지만, 눌러서 가는 곳이 **어디인지**는 이름이 말해야 한다. */
const NEWS_NAME = "내부자 리포트";
const NEWS_TAIL = "를 열었습니다. 임원과 의원, 월가 거물이 무엇을 사고팔았는지 봅니다.";
/* ⚠️ **아이콘과 GA 라벨도 소식마다 갈아야 한다.** 예전엔 이 둘이 본문에 박혀 있어서
   문구만 바꾸고 넘어갔고, 내부자 소식에 미장 카더라의 자유의 여신상이 그대로 붙어
   있었다(2026-08-26). 갈아 끼울 것을 여기 여섯으로 모아 둔다.
   ⭐ 아이콘은 **사이드바 NAV 의 그 화면 아이콘과 같은 것**을 쓴다. 띠를 눌러 가면
     사이드바에서 방금 본 그림이 그 자리에 켜져 있어야 같은 곳이라고 읽힌다. */
const NEWS_ICON = "contact_page";
const NEWS_GA = "news-insider";

const newsStore = {
  subscribe(cb: () => void) {
    window.addEventListener(NEWS_EVENT, cb);
    return () => window.removeEventListener(NEWS_EVENT, cb);
  },
  getSnapshot() {
    try {
      return localStorage.getItem(NEWS_KEY) === null;
    } catch {
      // 사생활 보호 모드 등에서 접근이 던진다. 닫은 걸 기억 못 하면 갈 때마다 다시
      // 뜨므로, 그때는 아예 안 띄운다(PcHint 와 같은 판단).
      return false;
    }
  },
};

function NewsStrip() {
  const pathname = usePathname();
  const show = useSyncExternalStore(newsStore.subscribe, newsStore.getSnapshot, () => false);

  if (!show || pathname.startsWith(NEWS_HREF)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(NEWS_KEY, "1");
    } catch {}
    window.dispatchEvent(new Event(NEWS_EVENT));
  };

  return (
    <div className="hz-news" role="status">
      {/* 링크와 닫기 버튼은 **형제**로 둔다. 버튼을 링크 안에 넣으면 유효하지 않은
          마크업이고, 닫으려다 페이지가 넘어간다.

          ⭐ 눌러서 들어가도 닫은 것으로 친다. 소식을 확인한 사람에게 그 소식을 다시
          보여 줄 이유가 없다 — X 를 눌러야만 사라지면, 링크로 들어갔다 돌아온 사람은
          이미 본 띠를 또 만난다.
          ⚠️ dismiss 안의 dispatchEvent 는 동기지만 React 는 이벤트 핸들러에서 나온
          상태 변경을 핸들러가 끝난 뒤로 미룬다. 그래서 이 줄이 링크를 먼저 언마운트해
          이동을 막지 않는다(브라우저에서 눌러 확인했다). */}
      <Link href={NEWS_HREF} className="hz-news-link" data-ga-cta={NEWS_GA} onClick={dismiss}>
        <Icon name={NEWS_ICON} style={{ fontSize: 17, flexShrink: 0 }} />
        <span className="hz-news-text">
          {/* ⚠️ <a> 안에 <a> 를 넣을 수 없다. 바깥 링크가 이미 같은 곳으로 가므로
              여기서는 **밑줄만** 긋는다 — 눌리는 건 띠 전체다. */}
          <span className="hz-news-em">{NEWS_NAME}</span>
          {NEWS_TAIL}
        </span>
        <span className="hz-news-go">
          <span className="hz-news-go-label">보러 가기</span>
          <Icon name="arrow_forward" style={{ fontSize: 15 }} />
        </span>
      </Link>
      <button type="button" onClick={dismiss} aria-label="알림 닫기" className="hz-news-x">
        <Icon name="close" style={{ fontSize: 17 }} />
      </button>
    </div>
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
  currency,
  children,
}: {
  theme: "light" | "dark";
  /** 통화 스위치의 초기값(쿠키). 서학개미 장부에서만 화면에 뜬다. */
  currency: "krw" | "usd" | null;
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
          currency={currency}
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
            <NewsStrip />
            <PageHeader theme={theme} currency={currency} />
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

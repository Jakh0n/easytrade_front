import type { LogisticModel } from "./model";

/**
 * SMC 4H signal modeli — `npx tsx lib/server/scripts/signal-research.ts final` natijasi
 * (barcha tarixda qayta o'qitilgan, L2 = 5). Walk-forward testda (MTF filtri bilan):
 * eng past 35% signal tashlanganda avgR +0.123 → +0.218, win rate 46.5% → 50.5%, maxDD 28 → 17R.
 * `threshold` — o'qitish to'plamidagi ehtimolliklarning 35% kvantili.
 * Boshqa strategiyalarda model testda yaxshilamadi (overfit) — ularga qo'llanmaydi.
 */
export const SMC_SIGNAL_MODEL: LogisticModel & { threshold: number } = {
  features: [
    "adx",
    "rsi",
    "atrPct",
    "ext",
    "volRatio",
    "taker1",
    "taker6",
    "ret24",
    "funding",
    "funding7d",
    "regBtc",
    "regAlt",
    "regDom",
    "breadth",
    "hourSin",
    "hourCos",
  ],
  mean: [
    24.440161, 14.936434, 2.696972, 1.643114, 0.550157, 0.027279, 0.012898,
    4.769418, 0.836084, 0.567585, 0.659722, 1, -0.621528, 0.362153, -0.115771,
    0.108507,
  ],
  std: [
    9.505381, 5.789827, 0.976308, 0.571553, 0.528443, 0.033209, 0.020872,
    3.015317, 2.234474, 1.644823, 0.75151, 1, 0.783392, 0.130802, 0.679601,
    0.716216,
  ],
  weights: [
    0.163671, 0.037517, -0.062905, -0.06536, 0.011398, -0.229586, 0.504129,
    0.168844, -0.139578, 0.049347, 0.119961, 0, 0.08977, 0.168111, -0.083951,
    -0.016267,
  ],
  bias: -0.211859,
  threshold: 0.397975,
};

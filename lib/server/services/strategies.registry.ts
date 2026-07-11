export type StrategyId = "ema_smc";

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  shortName: string;
  description: string;
  timeframes: string;
  checklist: string[];
  minRiskReward: number;
  riskPercent: number;
}

export const STRATEGIES: StrategyDefinition[] = [
  {
    id: "ema_smc",
    name: "EMA + SMC",
    shortName: "EMA + SMC",
    description:
      "4H EMA 200 trend, kunlik likvidlik darajalari (PDH/PDL/EQH/EQL), likvidlik sweep, 5M BOS/CHoCH tasdiqlash va FVG/OB kirish.",
    timeframes: "4H trend · 1D darajalar · 5M kirish",
    checklist: [
      "EMA 200 trendni tasdiqlaydi",
      "Likvidlik sweep",
      "BOS yoki CHoCH tasdiqlangan",
      "FVG yoki OB da kirish",
      "Har bir savdoda 1% risk",
      "Minimal R:R = 1:2",
    ],
    minRiskReward: 2,
    riskPercent: 1,
  },
];

export function getStrategy(id: string): StrategyDefinition | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

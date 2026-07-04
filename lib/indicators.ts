export function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length === 0 || period <= 0) {
    return [];
  }

  if (closes.length < period) {
    return closes.map(() => NaN);
  }

  const multiplier = 2 / (period + 1);
  const ema = new Array<number>(closes.length).fill(NaN);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i]!;
  }

  let prevEma = sum / period;
  ema[period - 1] = prevEma;

  for (let i = period; i < closes.length; i++) {
    prevEma = (closes[i]! - prevEma) * multiplier + prevEma;
    ema[i] = prevEma;
  }

  return ema;
}

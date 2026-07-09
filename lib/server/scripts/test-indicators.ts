import { getKlines } from "../services/binance.service";
import {
  calculateATR,
  calculateEMA,
  calculateRSI,
  findSupportResistance,
  getVolumeStatus,
} from "../services/indicators.service";
import {
  computePositionSizing,
  determineTrend,
} from "../services/risk.service";

async function main() {
  const candles = await getKlines("BTCUSDT", "4h", 300);
  const closes = candles.map((candle) => candle.close);
  const currentPrice = closes[closes.length - 1]!;

  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const lastEma50 = ema50[ema50.length - 1]!;
  const lastEma200 = ema200[ema200.length - 1]!;

  console.log("\n--- Indicators (BTCUSDT, 4h) ---");
  console.log("RSI(14):", calculateRSI(closes, 14).toFixed(2));
  console.log("ATR(14):", calculateATR(candles, 14).toFixed(2));
  console.log("Support/Resistance:", findSupportResistance(candles, 30));
  console.log("Volume status:", getVolumeStatus(candles));
  console.log("EMA50:", lastEma50.toFixed(2));
  console.log("EMA200:", lastEma200.toFixed(2));

  const trend = determineTrend(lastEma50, lastEma200, currentPrice);
  const atr = calculateATR(candles, 14);
  const sampleStopLoss =
    trend === "bearish" ? currentPrice + 1.5 * atr : currentPrice - 1.5 * atr;
  const sizing = computePositionSizing({
    currentPrice,
    stopLoss: sampleStopLoss,
    capital: 10_000,
    riskPercent: 2,
    marketType: "spot",
  });

  console.log("\n--- Position sizing (capital=10000, risk=2%) ---");
  console.log("Trend:", trend);
  console.log("Sample stop-loss:", sampleStopLoss.toFixed(2));
  console.log(JSON.stringify(sizing, null, 2));
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});

import { get24hrTicker, getKlines } from "../services/binance.service";

async function main() {
  const symbol = "BTCUSDT";

  console.log(`\n--- getKlines(${symbol}, "4h", 5) ---`);
  const candles = await getKlines(symbol, "4h", 5);
  console.log(JSON.stringify(candles, null, 2));

  console.log(`\n--- get24hrTicker(${symbol}) ---`);
  const ticker = await get24hrTicker(symbol);
  console.log(JSON.stringify(ticker, null, 2));

  console.log("\n--- Invalid symbol test ---");
  try {
    await getKlines("INVALIDPAIR", "1d", 1);
  } catch (error) {
    console.log((error as Error).message);
  }
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});

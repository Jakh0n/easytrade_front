/**
 * Tadqiqot ma'lumotlarini yuklash (bir marta; keyin kesh):
 *   npx tsx lib/server/scripts/research-download.ts            # kunlik shamlar
 *   npx tsx lib/server/scripts/research-download.ts funding    # funding tarixi (sekinroq)
 */
import { cachedSymbols, downloadDaily, downloadFunding, listPerpetuals } from "../backtest/research/data";

async function main(): Promise<void> {
  const kind = process.argv[2] === "funding" ? "funding" : "1d";
  const all = await listPerpetuals();
  const have = new Set(await cachedSymbols(kind));
  const todo = all.filter((s) => !have.has(s));
  console.log(`${kind}: jami ${all.length}, keshda ${have.size}, yuklanadi ${todo.length}`);

  const concurrency = kind === "funding" ? 1 : 4;
  let done = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const symbol = todo[cursor++]!;
      try {
        await (kind === "funding" ? downloadFunding(symbol) : downloadDaily(symbol));
      } catch (error) {
        console.log(`  ${symbol}: ${error instanceof Error ? error.message : error}`);
      }
      done += 1;
      if (done % 50 === 0) console.log(`  ${done}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log("tayyor");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

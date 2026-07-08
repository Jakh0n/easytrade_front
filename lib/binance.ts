export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export type MarketType = "spot" | "futures";

type BinanceKlineRaw = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  ...unknown[],
];

function getKlinesUrl(marketType: MarketType): string {
  return marketType === "futures"
    ? "https://fapi.binance.com/fapi/v1/klines"
    : "https://api.binance.com/api/v3/klines";
}

export async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number = 300,
  marketType: MarketType = "spot",
): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval,
    limit: String(limit),
  });

  const response = await fetch(`${getKlinesUrl(marketType)}?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Grafik ma'lumotlarini yuklab bo'lmadi");
  }

  const data = (await response.json()) as BinanceKlineRaw[];

  return data.map((item) => ({
    openTime: item[0],
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
    closeTime: item[6],
  }));
}

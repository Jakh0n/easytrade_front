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

function getWsBase(marketType: MarketType): string {
  return marketType === "futures"
    ? "wss://fstream.binance.com/ws"
    : "wss://stream.binance.com:9443/ws";
}

export interface LiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
}

interface BinanceKlineMessage {
  k: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean;
  };
}

/** Subscribes to Binance live kline updates. Returns a cleanup function. */
export function subscribeKline(
  symbol: string,
  interval: string,
  marketType: MarketType,
  onCandle: (candle: LiveCandle) => void,
): () => void {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(`${getWsBase(marketType)}/${stream}`);

  ws.onmessage = (event) => {
    try {
      const { k } = JSON.parse(event.data as string) as BinanceKlineMessage;
      onCandle({
        time: Math.floor(k.t / 1000),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
        isFinal: k.x,
      });
    } catch {
      // Ignore malformed frames.
    }
  };

  return () => {
    ws.onmessage = null;
    ws.close();
  };
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

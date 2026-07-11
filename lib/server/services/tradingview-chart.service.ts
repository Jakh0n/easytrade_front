import axios, { isAxiosError } from "axios";
import { env } from "../config/env";
import type { MarketType } from "../types/index";

const CHART_IMG_BASE = "https://api.chart-img.com/v1/tradingview/advanced-chart";

const FREE_MAX_WIDTH = 800;
const FREE_MAX_HEIGHT = 600;

function toTradingViewSymbol(symbol: string, marketType: MarketType): string {
  const base = symbol.toUpperCase();
  return marketType === "futures" ? `BINANCE:${base}.P` : `BINANCE:${base}`;
}

function clampDimensions(width: number, height: number) {
  return {
    width: Math.min(width, FREE_MAX_WIDTH),
    height: Math.min(height, FREE_MAX_HEIGHT),
  };
}

export function isTradingViewChartConfigured(): boolean {
  return Boolean(env.CHART_IMG_API_KEY);
}

export async function fetchTradingViewChartForSymbol(
  symbol: string,
  marketType: MarketType,
  interval: string = "4h",
): Promise<Buffer> {
  if (!env.CHART_IMG_API_KEY) {
    throw new Error("CHART_IMG_API_KEY sozlanmagan");
  }

  const { width, height } = clampDimensions(
    env.CHART_IMG_WIDTH,
    env.CHART_IMG_HEIGHT,
  );

  const params = new URLSearchParams({
    symbol: toTradingViewSymbol(symbol, marketType),
    interval,
    theme: "dark",
    width: String(width),
    height: String(height),
    format: "png",
    timezone: "Etc/UTC",
    range: interval === "5m" || interval === "15m" ? "1D" : "5D",
  });

  params.append("studies", "EMA:200,close");
  params.append("studies", "Volume");

  try {
    const response = await axios.get(
      `${CHART_IMG_BASE}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${env.CHART_IMG_API_KEY}` },
        responseType: "arraybuffer",
        timeout: 30_000,
      },
    );

    const buffer = Buffer.from(response.data);
    if (buffer.length < 5000) {
      throw new Error(buffer.toString("utf8") || "TradingView chart bo'sh");
    }

    return buffer;
  } catch (error) {
    if (isAxiosError(error) && error.response?.data) {
      const body =
        error.response.data instanceof Buffer
          ? error.response.data.toString("utf8")
          : JSON.stringify(error.response.data);
      throw new Error(`chart-img.com: ${body}`);
    }
    throw error;
  }
}

"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchKlines, subscribeKline, type MarketType } from "@/lib/binance";
import { calculateEMA } from "@/lib/indicators";

export interface ChartLevels {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  signalTime: number | null;
}

interface FqChartProps {
  symbol: string;
  marketType: MarketType;
  interval?: string;
  levels: ChartLevels | null;
  onPrice?: (price: number) => void;
}

const PALETTE = {
  dark: {
    bg: "#121722",
    text: "#8b93a7",
    grid: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    up: "#34d399",
    down: "#fb7185",
    volUp: "rgba(52,211,153,0.25)",
    volDown: "rgba(251,113,133,0.25)",
    ema20: "#94a3b8",
    ema50: "#f5b544",
    ema200: "#60a5fa",
    entry: "#e2e8f0",
  },
  light: {
    bg: "#ffffff",
    text: "#5b6476",
    grid: "rgba(15,23,42,0.05)",
    border: "rgba(15,23,42,0.1)",
    up: "#059669",
    down: "#e11d48",
    volUp: "rgba(5,150,105,0.2)",
    volDown: "rgba(225,29,72,0.2)",
    ema20: "#64748b",
    ema50: "#d97706",
    ema200: "#2563eb",
    entry: "#334155",
  },
};

function precisionFor(price: number): number {
  if (price >= 1000) return 1;
  if (price >= 10) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 7;
}

export function FqChart({ symbol, marketType, interval = "1h", levels, onPrice }: FqChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const onPriceRef = useRef(onPrice);
  const { resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPriceRef.current = onPrice;
  }, [onPrice]);

  const levelsKey = levels ? `${levels.side}:${levels.entry}:${levels.stopLoss}:${levels.signalTime}` : "none";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const theme = resolvedTheme === "light" ? PALETTE.light : PALETTE.dark;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let observer: ResizeObserver | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const candles = await fetchKlines(symbol, interval, 400, marketType);
        if (disposed || candles.length === 0) return;

        const chart = createChart(container, {
          width: container.clientWidth,
          height: container.clientHeight,
          layout: {
            background: { type: ColorType.Solid, color: theme.bg },
            textColor: theme.text,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
          },
          grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: theme.border },
          timeScale: { borderColor: theme.border, timeVisible: true, rightOffset: 6 },
        });
        chartRef.current = chart;

        const precision = precisionFor(candles.at(-1)!.close);
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: theme.up,
          downColor: theme.down,
          borderVisible: false,
          wickUpColor: theme.up,
          wickDownColor: theme.down,
          priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
        });
        const time = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
        candleSeries.setData(
          candles.map((c) => ({ time: time(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close })),
        );

        const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
        volume.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volume.setData(
          candles.map((c) => ({
            time: time(c.openTime),
            value: c.volume,
            color: c.close >= c.open ? theme.volUp : theme.volDown,
          })),
        );

        const closes = candles.map((c) => c.close);
        const addEma = (period: number, color: string, width: 1 | 2) => {
          const values = calculateEMA(closes, period);
          const series = chart.addSeries(LineSeries, {
            color,
            lineWidth: width,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          series.setData(
            values
              .map((value, i) => ({ time: time(candles[i]!.openTime), value }))
              .filter((point) => Number.isFinite(point.value)),
          );
        };
        addEma(20, theme.ema20, 1);
        addEma(50, theme.ema50, 1);
        addEma(200, theme.ema200, 2);

        if (levels) {
          const line = (price: number, color: string, title: string, style = LineStyle.Dashed) =>
            candleSeries.createPriceLine({ price, color, title, lineStyle: style, lineWidth: 1, axisLabelVisible: true });
          line(levels.entry, theme.entry, "Kirish", LineStyle.Solid);
          line(levels.stopLoss, theme.down, "SL");
          line(levels.tp1, theme.up, "TP1");
          line(levels.tp2, theme.up, "TP2");

          if (levels.signalTime) {
            createSeriesMarkers(candleSeries, [
              {
                time: time(levels.signalTime),
                position: levels.side === "long" ? "belowBar" : "aboveBar",
                color: levels.side === "long" ? theme.up : theme.down,
                shape: levels.side === "long" ? "arrowUp" : "arrowDown",
                text: levels.side === "long" ? "LONG" : "SHORT",
              },
            ]);
          }
        }

        chart.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 6 });

        observer = new ResizeObserver(([entry]) => {
          if (entry) chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(container);

        unsubscribe = subscribeKline(symbol, interval, marketType, (c) => {
          if (disposed) return;
          candleSeries.update({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
          volume.update({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? theme.volUp : theme.volDown });
          onPriceRef.current?.(c.close);
        });
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "Grafik yuklanmadi");
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
      observer?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
    };
    // levelsKey `levels` o'zgarishini ifodalaydi — obyekt identifikatori emas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, marketType, interval, resolvedTheme, levelsKey]);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-md sm:h-[480px]">
      {loading && <Skeleton className="absolute inset-0 z-10 rounded-md" />}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label={`${symbol} ${interval} sham grafigi, EMA 20/50/200${levels ? ", kirish, stop va TP darajalari bilan" : ""}`}
      />
    </div>
  );
}

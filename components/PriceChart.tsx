"use client";

import {
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { fetchKlines } from "@/lib/binance";
import { calculateEMA } from "@/lib/indicators";

interface PriceChartProps {
  symbol: string;
  interval: string;
  support: number;
  resistance: number;
}

function isDarkMode(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return (
    document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function getChartTheme(dark: boolean) {
  return {
    background: dark ? "#0f172a" : "#ffffff",
    text: dark ? "#94a3b8" : "#64748b",
    grid: dark ? "#1e293b" : "#e2e8f0",
    border: dark ? "#334155" : "#cbd5e1",
    up: "#10b981",
    down: "#ef4444",
    ema50: "#3b82f6",
    ema200: "#8b5cf6",
    support: "#22c55e",
    resistance: "#f97316",
  };
}

export function PriceChart({
  symbol,
  interval,
  support,
  resistance,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const initChart = async () => {
      setLoading(true);
      setError(null);

      try {
        const candles = await fetchKlines(symbol, interval, 300);

        if (disposed) {
          return;
        }

        chartRef.current?.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;

        const dark = isDarkMode();
        const theme = getChartTheme(dark);

        const chart = createChart(container, {
          width: container.clientWidth,
          height: 420,
          layout: {
            background: { type: ColorType.Solid, color: theme.background },
            textColor: theme.text,
          },
          grid: {
            vertLines: { color: theme.grid },
            horzLines: { color: theme.grid },
          },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: theme.border },
          timeScale: { borderColor: theme.border },
        });

        chartRef.current = chart;

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: theme.up,
          downColor: theme.down,
          borderUpColor: theme.up,
          borderDownColor: theme.down,
          wickUpColor: theme.up,
          wickDownColor: theme.down,
        });

        candleSeriesRef.current = candleSeries;

        const candleData = candles.map((candle) => ({
          time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));

        candleSeries.setData(candleData);

        const closes = candles.map((candle) => candle.close);
        const times = candles.map(
          (candle) => Math.floor(candle.openTime / 1000) as UTCTimestamp,
        );

        const ema50Values = calculateEMA(closes, 50);
        const ema200Values = calculateEMA(closes, 200);

        const toLineData = (values: number[]) =>
          values
            .map((value, index) => ({
              time: times[index]!,
              value,
            }))
            .filter((point) => Number.isFinite(point.value));

        const ema50Series = chart.addSeries(LineSeries, {
          color: theme.ema50,
          lineWidth: 2,
          title: "EMA50",
        });
        ema50Series.setData(toLineData(ema50Values));

        const ema200Series = chart.addSeries(LineSeries, {
          color: theme.ema200,
          lineWidth: 2,
          title: "EMA200",
        });
        ema200Series.setData(toLineData(ema200Values));

        candleSeries.createPriceLine({
          price: support,
          color: theme.support,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Support",
        });

        candleSeries.createPriceLine({
          price: resistance,
          color: theme.resistance,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Resistance",
        });

        chart.timeScale().fitContent();

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry && chartRef.current) {
            chartRef.current.applyOptions({
              width: entry.contentRect.width,
            });
          }
        });

        resizeObserver.observe(container);
      } catch (err) {
        if (!disposed) {
          setError(
            err instanceof Error ? err.message : "Grafik yuklanmadi",
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void initChart();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [symbol, interval, support, resistance]);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{symbol} narx grafigi</h3>
          <p className="text-sm text-muted-foreground">Timeframe: {interval}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-500" />
            EMA50
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet-500" />
            EMA200
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-emerald-500" />
            Support
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-orange-500" />
            Resistance
          </span>
        </div>
      </div>

      <div className="relative">
        {loading && (
          <Skeleton className="absolute inset-0 z-10 h-[420px] w-full rounded-lg" />
        )}
        {error ? (
          <div className="flex h-[420px] items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <div ref={containerRef} className="h-[420px] w-full rounded-lg" />
        )}
      </div>
    </div>
  );
}

"use client";

import {
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { fetchKlines, subscribeKline, type MarketType } from "@/lib/binance";
import type { TradeSide } from "@/lib/api";
import { calculateEMA } from "@/lib/indicators";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  computePositionBoxLayout,
  type PositionBoxLayout,
} from "@/lib/positionBoxOverlay";

interface PriceChartProps {
  symbol: string;
  interval: string;
  marketType: MarketType;
  support: number;
  resistance: number;
  stopLoss: number;
  takeProfit: number;
  entry: number;
  side: TradeSide;
}

const HIDDEN_LAYOUT: PositionBoxLayout = {
  left: 0,
  width: 0,
  profitTop: 0,
  profitHeight: 0,
  lossTop: 0,
  lossHeight: 0,
  entryTop: 0,
  visible: false,
};

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
    fib: dark ? "#94a3b8" : "#64748b",
    volUp: "rgba(16, 185, 129, 0.35)",
    volDown: "rgba(239, 68, 68, 0.35)",
  };
}

const FIB_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786];

function resolveSide(
  side: TradeSide,
  marketType: MarketType,
): "long" | "short" {
  if (side === "short") {
    return "short";
  }

  if (side === "long") {
    return "long";
  }

  return marketType === "futures" ? "short" : "long";
}

export function PriceChart({
  symbol,
  interval,
  marketType,
  support,
  resistance,
  stopLoss,
  takeProfit,
  entry,
  side,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const boxStartTimeRef = useRef<number>(0);
  const boxEndTimeRef = useRef<number>(0);
  const { resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boxLayout, setBoxLayout] = useState<PositionBoxLayout>(HIDDEN_LAYOUT);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let rangeHandler: (() => void) | null = null;
    let unsubscribeLive: (() => void) | null = null;

    const updatePositionBox = () => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;

      if (!chart || !series) {
        return;
      }

      const layout = computePositionBoxLayout(
        {
          entry,
          stopLoss,
          takeProfit,
          side: resolveSide(side, marketType),
        },
        (price) => series.priceToCoordinate(price),
        (time) => chart.timeScale().timeToCoordinate(time as UTCTimestamp),
        boxStartTimeRef.current,
        boxEndTimeRef.current,
      );

      setBoxLayout(layout);
    };

    const initChart = async () => {
      setLoading(true);
      setError(null);
      setBoxLayout(HIDDEN_LAYOUT);

      try {
        const candles = await fetchKlines(symbol, interval, 300, marketType);

        if (disposed) {
          return;
        }

        if (chartRef.current && rangeHandler) {
          chartRef.current
            .timeScale()
            .unsubscribeVisibleLogicalRangeChange(rangeHandler);
        }

        chartRef.current?.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        rangeHandler = null;

        const dark = isDarkMode();
        const theme = getChartTheme(dark);

        const chart = createChart(container, {
          width: container.clientWidth,
          height: container.clientHeight || 420,
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
          priceFormat: {
            type: "price",
            precision: 4,
            minMove: 0.0001,
          },
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

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
        });
        volumeSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        });
        volumeSeries.setData(
          candles.map((candle) => ({
            time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
            value: candle.volume,
            color: candle.close >= candle.open ? theme.volUp : theme.volDown,
          })),
        );
        volumeSeriesRef.current = volumeSeries;

        const closes = candles.map((candle) => candle.close);
        const times = candles.map(
          (candle) => Math.floor(candle.openTime / 1000) as UTCTimestamp,
        );

        const boxStartIndex = Math.max(0, times.length - 36);
        boxStartTimeRef.current = times[boxStartIndex] as number;
        boxEndTimeRef.current = times[times.length - 1] as number;

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
        ema50Series.setData(toLineData(calculateEMA(closes, 50)));

        const ema200Series = chart.addSeries(LineSeries, {
          color: theme.ema200,
          lineWidth: 2,
          title: "EMA200",
        });
        ema200Series.setData(toLineData(calculateEMA(closes, 200)));

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

        const swingHigh = Math.max(...candles.slice(-120).map((c) => c.high));
        const swingLow = Math.min(...candles.slice(-120).map((c) => c.low));
        const fibRange = swingHigh - swingLow;
        if (fibRange > 0) {
          for (const level of FIB_LEVELS) {
            candleSeries.createPriceLine({
              price: swingHigh - fibRange * level,
              color: theme.fib,
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: `Fib ${level}`,
            });
          }
        }

        chart.timeScale().fitContent();

        rangeHandler = () => {
          updatePositionBox();
        };
        chart
          .timeScale()
          .subscribeVisibleLogicalRangeChange(rangeHandler);

        updatePositionBox();

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry && chartRef.current) {
            chartRef.current.applyOptions({
              width: entry.contentRect.width,
              height: entry.contentRect.height,
            });
            updatePositionBox();
          }
        });

        resizeObserver.observe(container);

        unsubscribeLive = subscribeKline(
          symbol,
          interval,
          marketType,
          (candle) => {
            if (disposed) return;
            const time = candle.time as UTCTimestamp;
            candleSeriesRef.current?.update({
              time,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            });
            volumeSeriesRef.current?.update({
              time,
              value: candle.volume,
              color:
                candle.close >= candle.open ? theme.volUp : theme.volDown,
            });
            setLivePrice(candle.close);
          },
        );
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
      unsubscribeLive?.();
      unsubscribeLive = null;
      if (chartRef.current && rangeHandler) {
        chartRef.current
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(rangeHandler);
      }
      rangeHandler = null;
      resizeObserver?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [
    symbol,
    interval,
    marketType,
    support,
    resistance,
    stopLoss,
    takeProfit,
    entry,
    side,
    resolvedTheme,
  ]);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  const tradeSide = resolveSide(side, marketType);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-4 shadow-sm",
        isFullscreen &&
          "fixed inset-0 z-50 flex flex-col rounded-none border-0",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            {symbol} narx grafigi
            {livePrice !== null && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                {formatPrice(livePrice)}
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {marketType === "futures" ? "Futures" : "Spot"} · Timeframe:{" "}
            {interval} · {tradeSide === "long" ? "Long" : "Short"} position
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-500" />
            EMA50
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet-500" />
            EMA200
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-slate-400" />
            Fib
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-emerald-500/35" />
            TP zona
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-red-500/35" />
            SL zona
          </span>
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            aria-label={isFullscreen ? "Kichraytirish" : "To'liq ekran"}
            title={isFullscreen ? "Kichraytirish (Esc)" : "To'liq ekran"}
            className="flex size-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div className={cn("relative", isFullscreen && "min-h-0 flex-1")}>
        {loading && (
          <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-lg" />
        )}
        {error ? (
          <div
            className={cn(
              "flex items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground",
              isFullscreen ? "h-full" : "h-[420px]",
            )}
          >
            {error}
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              className={cn(
                "w-full rounded-lg",
                isFullscreen ? "h-full" : "h-[420px]",
              )}
            />
            {boxLayout.visible && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                <div
                  className="absolute border-r border-dashed border-white/50"
                  style={{
                    left: boxLayout.left,
                    top: boxLayout.profitTop,
                    width: boxLayout.width,
                    height: boxLayout.profitHeight,
                    backgroundColor: "rgba(16, 185, 129, 0.22)",
                  }}
                >
                  <span className="absolute right-1 top-1 rounded bg-emerald-500/80 px-1 py-0.5 text-[10px] font-medium text-white">
                    TP {formatPrice(takeProfit)}
                  </span>
                </div>

                <div
                  className="absolute border-r border-dashed border-white/50"
                  style={{
                    left: boxLayout.left,
                    top: boxLayout.lossTop,
                    width: boxLayout.width,
                    height: boxLayout.lossHeight,
                    backgroundColor: "rgba(239, 68, 68, 0.22)",
                  }}
                >
                  <span className="absolute right-1 bottom-1 rounded bg-red-500/80 px-1 py-0.5 text-[10px] font-medium text-white">
                    SL {formatPrice(stopLoss)}
                  </span>
                </div>

                <div
                  className="absolute bg-slate-300/90 dark:bg-slate-400/90"
                  style={{
                    left: boxLayout.left,
                    top: boxLayout.entryTop,
                    width: boxLayout.width,
                    height: 1,
                  }}
                />
                <span
                  className="absolute rounded bg-slate-600/90 px-1 py-0.5 text-[10px] font-medium text-white"
                  style={{
                    left: boxLayout.left + boxLayout.width - 52,
                    top: boxLayout.entryTop - 10,
                  }}
                >
                  Entry {formatPrice(entry)}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

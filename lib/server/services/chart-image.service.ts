import { createCanvas, type CanvasRenderingContext2D } from "canvas";
import type { Candle } from "../types/index";
import type { EmaSmcAnalysis } from "./ema-smc.strategy.service";
import {
  fetchTradingViewChartForSymbol,
  isTradingViewChartConfigured,
} from "./tradingview-chart.service";

const SCALE = 2;
const WIDTH = 1280;
const HEIGHT = 720;
const CANDLE_COUNT = 48;
const VOL_HEIGHT = 56;

const COLORS = {
  bg: "#0b1220",
  panel: "#111827",
  grid: "#1f2937",
  text: "#9ca3af",
  textBright: "#f1f5f9",
  up: "#22c55e",
  upBody: "#16a34a",
  down: "#ef4444",
  downBody: "#dc2626",
  pdh: "#f97316",
  pdl: "#22c55e",
  eqh: "#fb923c",
  eql: "#4ade80",
  sl: "#f87171",
  tp: "#4ade80",
  entry: "#60a5fa",
  priceTag: "#22c55e",
  watermark: "rgba(100,116,139,0.07)",
};

interface ChartArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LevelLine {
  price: number;
  color: string;
  label: string;
  dashed?: boolean;
  priority: number;
}

function scaledCanvas() {
  const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  return { canvas, ctx };
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function getChartArea(): ChartArea {
  return {
    x: 16,
    y: 72,
    width: WIDTH - 16 - 88,
    height: HEIGHT - 72 - 36 - VOL_HEIGHT,
  };
}

function priceToY(
  price: number,
  minPrice: number,
  maxPrice: number,
  area: ChartArea,
): number {
  const range = maxPrice - minPrice || 1;
  return area.y + area.height - ((price - minPrice) / range) * area.height;
}

function collectLevels(analysis: EmaSmcAnalysis): LevelLine[] {
  const levels: LevelLine[] = [
    { price: analysis.keyLevels.pdh, color: COLORS.pdh, label: "PDH", priority: 2 },
    { price: analysis.keyLevels.pdl, color: COLORS.pdl, label: "PDL", priority: 2 },
    { price: analysis.stopLoss, color: COLORS.sl, label: "SL", dashed: true, priority: 3 },
    { price: analysis.takeProfit, color: COLORS.tp, label: "TP", dashed: true, priority: 3 },
  ];

  if (analysis.keyLevels.eqh) {
    levels.push({ price: analysis.keyLevels.eqh, color: COLORS.eqh, label: "EQH", priority: 1 });
  }
  if (analysis.keyLevels.eql) {
    levels.push({ price: analysis.keyLevels.eql, color: COLORS.eql, label: "EQL", priority: 1 });
  }

  return levels.filter((l) => l.price > 0);
}

/** Faqat joriy narx atrofidagi darajalarni ko'rsatadi — candlelar katta bo'ladi. */
function computePriceBounds(
  candles: Candle[],
  levels: LevelLine[],
  entryZone: [number, number] | null,
  currentPrice: number,
): { min: number; max: number; visibleLevels: LevelLine[] } {
  const recent = candles.slice(-CANDLE_COUNT);
  let min = Math.min(...recent.map((c) => c.low));
  let max = Math.max(...recent.map((c) => c.high));

  const maxDistance = currentPrice * 0.045;

  const visibleLevels = levels.filter((level) => {
    if (level.priority >= 3) return true;
    if (level.priority === 2) return Math.abs(level.price - currentPrice) <= maxDistance * 2;
    return Math.abs(level.price - currentPrice) <= maxDistance;
  });

  for (const level of visibleLevels) {
    min = Math.min(min, level.price);
    max = Math.max(max, level.price);
  }

  if (entryZone) {
    min = Math.min(min, entryZone[0]);
    max = Math.max(max, entryZone[1]);
  }

  min = Math.min(min, currentPrice);
  max = Math.max(max, currentPrice);

  const padding = Math.max((max - min) * 0.12, currentPrice * 0.002);
  return { min: min - padding, max: max + padding, visibleLevels };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  analysis: EmaSmcAnalysis,
) {
  const sideLabel = analysis.side === "long" ? "LONG" : "SHORT";
  const sideColor = analysis.side === "long" ? COLORS.up : COLORS.down;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 12, 12, WIDTH - 24, 52, 8);
  ctx.fill();

  ctx.fillStyle = COLORS.textBright;
  ctx.font = "bold 22px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(analysis.symbol, 24, 38);

  ctx.fillStyle = COLORS.text;
  ctx.font = "14px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.fillText(`5M  ·  EMA+SMC  ·  `, 24, 56);

  const metaWidth = ctx.measureText(`5M  ·  EMA+SMC  ·  `).width;
  ctx.fillStyle = sideColor;
  ctx.font = "bold 14px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.fillText(sideLabel, 24 + metaWidth, 56);

  const priceText = formatPrice(analysis.currentPrice);
  const tagW = ctx.measureText(priceText).width + 20;
  const tagX = WIDTH - tagW - 20;
  ctx.fillStyle = sideColor;
  drawRoundedRect(ctx, tagX, 22, tagW, 32, 6);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(priceText, tagX + tagW / 2, 44);
}

function drawCandles(
  ctx: CanvasRenderingContext2D,
  candles: Candle[],
  minPrice: number,
  maxPrice: number,
  area: ChartArea,
) {
  const recent = candles.slice(-CANDLE_COUNT);
  const gap = area.width / recent.length;
  const bodyWidth = Math.max(6, gap * 0.72);

  recent.forEach((candle, i) => {
    const x = area.x + i * gap + gap / 2;
    const isUp = candle.close >= candle.open;

    const highY = priceToY(candle.high, minPrice, maxPrice, area);
    const lowY = priceToY(candle.low, minPrice, maxPrice, area);
    const openY = priceToY(candle.open, minPrice, maxPrice, area);
    const closeY = priceToY(candle.close, minPrice, maxPrice, area);

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(2, Math.abs(closeY - openY));

    ctx.strokeStyle = isUp ? COLORS.up : COLORS.down;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    ctx.fillStyle = isUp ? COLORS.upBody : COLORS.downBody;
    drawRoundedRect(ctx, x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight, 1.5);
    ctx.fill();
  });
}

function drawVolume(
  ctx: CanvasRenderingContext2D,
  candles: Candle[],
  area: ChartArea,
) {
  const recent = candles.slice(-CANDLE_COUNT);
  const maxVol = Math.max(...recent.map((c) => c.volume), 1);
  const volTop = area.y + area.height + 8;
  const gap = area.width / recent.length;

  ctx.fillStyle = COLORS.grid;
  ctx.fillRect(area.x, volTop - 1, area.width, 1);

  recent.forEach((candle, i) => {
    const x = area.x + i * gap + gap / 2;
    const barH = (candle.volume / maxVol) * (VOL_HEIGHT - 8);
    const isUp = candle.close >= candle.open;
    ctx.fillStyle = isUp ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)";
    const barW = Math.max(3, gap * 0.68);
    ctx.fillRect(x - barW / 2, volTop + VOL_HEIGHT - barH, barW, barH);
  });
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  minPrice: number,
  maxPrice: number,
  area: ChartArea,
) {
  const steps = 7;
  const range = maxPrice - minPrice;

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = COLORS.text;
  ctx.font = "12px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.textAlign = "right";

  for (let i = 0; i <= steps; i++) {
    const price = minPrice + (range * i) / steps;
    const y = priceToY(price, minPrice, maxPrice, area);

    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.width, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(15,23,42,0.85)";
    ctx.fillRect(WIDTH - 84, y - 9, 72, 18);
    ctx.fillStyle = COLORS.textBright;
    ctx.fillText(formatPrice(price), WIDTH - 16, y + 4);
  }
}

function drawLevelLine(
  ctx: CanvasRenderingContext2D,
  level: LevelLine,
  y: number,
  area: ChartArea,
) {
  ctx.strokeStyle = level.color;
  ctx.lineWidth = level.dashed ? 1.5 : 2;
  ctx.setLineDash(level.dashed ? [8, 6] : []);
  ctx.globalAlpha = level.dashed ? 0.85 : 1;

  ctx.beginPath();
  ctx.moveTo(area.x, y);
  ctx.lineTo(area.x + area.width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  const label = `${level.label}  ${formatPrice(level.price)}`;
  ctx.font = "bold 11px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const labelW = ctx.measureText(label).width + 12;

  ctx.fillStyle = "rgba(15,23,42,0.9)";
  drawRoundedRect(ctx, area.x + 6, y - 16, labelW, 18, 4);
  ctx.fill();

  ctx.fillStyle = level.color;
  ctx.textAlign = "left";
  ctx.fillText(label, area.x + 12, y - 3);
}

function drawEntryZone(
  ctx: CanvasRenderingContext2D,
  entryZone: [number, number],
  entryType: string | null,
  minPrice: number,
  maxPrice: number,
  area: ChartArea,
) {
  const topY = priceToY(entryZone[1], minPrice, maxPrice, area);
  const bottomY = priceToY(entryZone[0], minPrice, maxPrice, area);
  const boxH = Math.max(4, bottomY - topY);

  ctx.fillStyle = "rgba(96,165,250,0.2)";
  ctx.fillRect(area.x, topY, area.width, boxH);

  ctx.strokeStyle = COLORS.entry;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(area.x, topY, area.width, boxH);
  ctx.setLineDash([]);

  const label = entryType?.toUpperCase() ?? "ENTRY";
  ctx.font = "bold 12px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.fillStyle = COLORS.entry;
  ctx.textAlign = "center";
  ctx.fillText(label, area.x + area.width / 2, topY + boxH / 2 + 4);
}

function drawCurrentPriceLine(
  ctx: CanvasRenderingContext2D,
  currentPrice: number,
  minPrice: number,
  maxPrice: number,
  area: ChartArea,
  side: "long" | "short",
) {
  const y = priceToY(currentPrice, minPrice, maxPrice, area);
  const color = side === "long" ? COLORS.up : COLORS.down;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(area.x, y);
  ctx.lineTo(area.x + area.width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  const label = formatPrice(currentPrice);
  ctx.font = "bold 12px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const tagW = ctx.measureText(label).width + 14;
  ctx.fillStyle = color;
  drawRoundedRect(ctx, WIDTH - tagW - 12, y - 11, tagW, 22, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(label, WIDTH - tagW / 2 - 12, y + 4);
}

export async function generateCanvasChart(
  candles: Candle[],
  analysis: EmaSmcAnalysis,
): Promise<Buffer> {
  const { canvas, ctx } = scaledCanvas();
  const area = getChartArea();
  const levels = collectLevels(analysis);
  const { min, max, visibleLevels } = computePriceBounds(
    candles,
    levels,
    analysis.entryZone,
    analysis.currentPrice,
  );

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = COLORS.watermark;
  ctx.font = "bold 96px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EasyTrade AI", WIDTH / 2, HEIGHT / 2 + 30);

  drawHeader(ctx, analysis);
  drawGrid(ctx, min, max, area);
  drawVolume(ctx, candles, area);
  drawCandles(ctx, candles, min, max, area);

  if (analysis.entryZone) {
    drawEntryZone(ctx, analysis.entryZone, analysis.entryType, min, max, area);
  }

  for (const level of visibleLevels) {
    const y = priceToY(level.price, min, max, area);
    if (y >= area.y - 2 && y <= area.y + area.height + 2) {
      drawLevelLine(ctx, level, y, area);
    }
  }

  if (analysis.side) {
    drawCurrentPriceLine(
      ctx,
      analysis.currentPrice,
      min,
      max,
      area,
      analysis.side,
    );
  }

  ctx.fillStyle = COLORS.text;
  ctx.font = "11px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(
    `Updated: ${new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC`,
    WIDTH - 16,
    HEIGHT - 14,
  );

  return canvas.toBuffer("image/png", { compressionLevel: 3, resolution: 300 });
}

/**
 * TradingView (chart-img.com) — asosiy manba.
 * API key bor, lekin plan/limit tugasa → null (faqat matn yuboriladi).
 * API key yo'q → canvas fallback.
 */
export async function generateSignalChartImage(
  candles: Candle[],
  analysis: EmaSmcAnalysis,
): Promise<Buffer | null> {
  if (isTradingViewChartConfigured()) {
    try {
      return await fetchTradingViewChartForSymbol(
        analysis.symbol,
        analysis.marketType,
        "5m",
      );
    } catch (error) {
      console.warn(
        "TradingView chart olinmadi (faqat matn yuboriladi):",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  return generateCanvasChart(candles, analysis);
}

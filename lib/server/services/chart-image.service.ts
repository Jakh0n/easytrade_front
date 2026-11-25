import path from "node:path";
import { createCanvas, registerFont } from "canvas";
import type { Candle } from "../types/index";

/**
 * Telegram uchun signal grafigi (PNG): shamlar, indikator chiziqlari (Supertrend, EMA),
 * kirish/stop/TP darajalari va kirish shami belgisi.
 */
export interface ChartLine {
  /** candles bilan bir xil uzunlikda; NaN — chizilmaydi. */
  values: number[];
  color?: string;
  /** Berilsa: 1 → yashil, -1 → qizil, yo'nalish o'zgarganda chiziq uziladi (Supertrend). */
  dir?: number[];
  label?: string;
}

export interface ChartLevel {
  price: number;
  label: string;
  color: string;
}

export interface SignalChartInput {
  title: string;
  subtitle?: string;
  side: "long" | "short";
  candles: Candle[];
  lines?: ChartLine[];
  levels: ChartLevel[];
  /** Kirish shamining openTime'i — belgi qo'yiladi. */
  signalTime?: number;
  /** Kirish shami ustidagi yozuv, masalan "SHORT PB". */
  marker?: string;
  /**
   * TradingView "Long/Short Position" uslubidagi zonalar: kirish→stop qizil, kirish→target yashil.
   * Kirish shamidan o'ngga, bo'sh joygacha cho'ziladi.
   */
  position?: { entry: number; stopLoss: number; target?: number | null; targetLabel?: string };
  formatPrice: (p: number) => string;
}

/**
 * Serverless (Vercel) muhitida tizim shriftlari yo'q — yozuvlar chiqmay qoladi.
 * Shrift loyiha ichida (next.config.ts → outputFileTracingIncludes).
 */
const FONT_FAMILY = "ChartSans";
const FONT = `${FONT_FAMILY}, sans-serif`;
let fontRegistered = false;
function ensureFont(): void {
  if (fontRegistered) return;
  fontRegistered = true;
  try {
    registerFont(path.join(process.cwd(), "lib/server/assets/fonts/Geist-Regular.ttf"), { family: FONT_FAMILY });
  } catch (error) {
    console.error("Grafik shrifti yuklanmadi:", error instanceof Error ? error.message : error);
  }
}

const W = 1000;
const H = 560;
const PAD = { top: 64, right: 92, bottom: 30, left: 16 };
/** Pozitsiya zonasi uchun grafik o'ngida qoldiriladigan bo'sh shamlar. */
const POSITION_PAD_BARS = 20;
const C = {
  riskFill: "rgba(239, 68, 68, 0.16)",
  rewardFill: "rgba(34, 197, 94, 0.14)",
  bg: "#0f1115",
  grid: "#1e222b",
  text: "#e6e8ec",
  muted: "#8a909c",
  up: "#22c55e",
  down: "#ef4444",
};

export const CHART_COLORS = {
  entry: "#60a5fa",
  stop: "#ef4444",
  tp: "#22c55e",
  ema20: "#facc15",
  ema50: "#c084fc",
} as const;

export function renderSignalChart(input: SignalChartInput): Buffer {
  const { candles } = input;
  ensureFont();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const n = candles.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const values: number[] = input.levels.map((l) => l.price);
  if (input.position) {
    values.push(input.position.entry, input.position.stopLoss);
    if (input.position.target) values.push(input.position.target);
  }
  for (let i = 0; i < n; i++) {
    values.push(candles[i]!.high, candles[i]!.low);
    for (const ln of input.lines ?? []) {
      const v = ln.values[i];
      if (v !== undefined && Number.isFinite(v)) values.push(v);
    }
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = max - min || max * 0.01 || 1;
  min -= span * 0.06;
  max += span * 0.06;

  const y = (p: number) => PAD.top + ((max - p) / (max - min)) * plotH;
  const padBars = input.position ? POSITION_PAD_BARS : 0;
  const step = plotW / Math.max(n + padBars, 1);
  const x = (i: number) => PAD.left + step * i + step / 2;

  // Grid + narx o'qi
  ctx.font = `12px ${FONT}`;
  ctx.textBaseline = "middle";
  for (let k = 0; k <= 5; k++) {
    const p = min + ((max - min) * k) / 5;
    const yy = Math.round(y(p)) + 0.5;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, yy);
    ctx.lineTo(W - PAD.right, yy);
    ctx.stroke();
    // Daraja yorlig'i bilan ustma-ust tushmasin
    if (input.levels.some((l) => Math.abs(y(l.price) - yy) < 16)) continue;
    ctx.fillStyle = C.muted;
    ctx.fillText(input.formatPrice(p), W - PAD.right + 8, yy);
  }

  const si = input.signalTime !== undefined ? candles.findIndex((c) => c.openTime === input.signalTime) : -1;
  const zoneX = si >= 0 ? x(si) - step / 2 : null;
  // Quti eni TradingView'dagidek cheklangan: kirish shami + POSITION_PAD_BARS sham.
  const zoneEnd = zoneX !== null ? Math.min(W - PAD.right, zoneX + step * (POSITION_PAD_BARS + 1)) : W - PAD.right;

  // Pozitsiya zonalari (shamlar ostida)
  if (input.position && zoneX !== null) {
    const { entry, stopLoss, target } = input.position;
    const zw = zoneEnd - zoneX;
    const box = (a: number, b: number, fill: string) => {
      const top = y(Math.max(a, b));
      ctx.fillStyle = fill;
      ctx.fillRect(zoneX, top, zw, y(Math.min(a, b)) - top);
    };
    box(entry, stopLoss, C.riskFill);
    if (target) box(entry, target, C.rewardFill);
  }

  // Shamlar
  const bodyW = Math.max(1, step * 0.62);
  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const color = c.close >= c.open ? C.up : C.down;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    const xx = Math.round(x(i)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(xx, y(c.high));
    ctx.lineTo(xx, y(c.low));
    ctx.stroke();
    const top = y(Math.max(c.open, c.close));
    const h = Math.max(1, y(Math.min(c.open, c.close)) - top);
    ctx.fillRect(x(i) - bodyW / 2, top, bodyW, h);
  }

  // Indikator chiziqlari
  ctx.lineWidth = 2;
  for (const ln of input.lines ?? []) {
    for (let i = 1; i < n; i++) {
      const a = ln.values[i - 1]!;
      const b = ln.values[i]!;
      const da = ln.dir?.[i - 1] ?? 1;
      const db = ln.dir?.[i] ?? 1;
      if (!Number.isFinite(a) || !Number.isFinite(b) || da !== db) continue;
      ctx.strokeStyle = ln.dir ? (db === 1 ? C.up : C.down) : (ln.color ?? C.muted);
      ctx.beginPath();
      ctx.moveTo(x(i - 1), y(a));
      ctx.lineTo(x(i), y(b));
      ctx.stroke();
    }
  }

  // Kirish va stop darajalari
  // Pozitsiya bo'lsa chiziqlar faqat zona ichida (TradingView kabi), aks holda butun eni bo'ylab.
  const levelStart = input.position && zoneX !== null ? zoneX : PAD.left;
  const level = (price: number, color: string, label: string) => {
    const yy = Math.round(y(price)) + 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(levelStart, yy);
    ctx.lineTo(input.position ? zoneEnd : W - PAD.right, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.fillRect(W - PAD.right + 2, yy - 10, PAD.right - 4, 20);
    ctx.fillStyle = "#0b0d10";
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(input.formatPrice(price), W - PAD.right + 8, yy);
    ctx.font = `bold 12px ${FONT}`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = C.bg;
    const labelX = input.position ? zoneEnd - 8 : W - PAD.right - 8;
    ctx.fillRect(labelX - 4 - tw, yy - 19, tw + 8, 16);
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(label, labelX, yy - 10);
    ctx.textAlign = "left";
  };
  for (const l of input.levels) level(l.price, l.color, l.label);

  // Kirish shami belgisi: strelka + yozuv (long — sham ostida, short — ustida)
  if (si >= 0) {
    const c = candles[si]!;
    const long = input.side === "long";
    const color = long ? C.up : C.down;
    const away = long ? 1 : -1; // shamdan uzoqlashish yo'nalishi (pastga/yuqoriga)
    const tipY = long ? y(c.low) + 6 : y(c.high) - 6;
    const tailY = tipY + 22 * away;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x(si), tailY);
    ctx.lineTo(x(si), tipY + 8 * away);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x(si), tipY);
    ctx.lineTo(x(si) - 6, tipY + 10 * away);
    ctx.lineTo(x(si) + 6, tipY + 10 * away);
    ctx.closePath();
    ctx.fill();
    if (input.marker) {
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = long ? "top" : "bottom";
      const tw = ctx.measureText(input.marker).width;
      const ty = tailY + 4 * away;
      ctx.fillStyle = C.bg;
      ctx.fillRect(x(si) - tw / 2 - 4, long ? ty - 1 : ty - 16, tw + 8, 17);
      ctx.fillStyle = color;
      ctx.fillText(input.marker, x(si), ty);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
    }
  }

  // Zona ichidagi R yozuvlari
  if (input.position && zoneX !== null) {
    const { entry, stopLoss, target, targetLabel } = input.position;
    const risk = Math.abs(entry - stopLoss);
    const pct = (p: number) => {
      const v = ((p - entry) / entry) * 100;
      return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
    };
    const tag = (text: string, ty: number) => {
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(15, 17, 21, 0.75)";
      ctx.fillRect(right - tw - 12, ty - 10, tw + 12, 20);
      ctx.fillStyle = C.text;
      ctx.fillText(text, right - 6, ty);
    };
    // O'ng chetga tekislanadi — chap chetdagi kirish belgisi bilan to'qnashmasin.
    const right = zoneEnd - 6;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    tag(`Stop −1R  ${pct(stopLoss)}`, (y(entry) + y(stopLoss)) / 2);
    if (target && risk > 0) {
      const r = Math.abs(target - entry) / risk;
      tag(`${targetLabel ?? "TP"} +${r.toFixed(1)}R  ${pct(target)}`, (y(entry) + y(target)) / 2);
    }
    ctx.textAlign = "left";
  }

  // Sarlavha
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = input.side === "long" ? C.up : C.down;
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText(input.title, PAD.left + 4, 32);
  if (input.subtitle) {
    ctx.fillStyle = C.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(input.subtitle, PAD.left + 4, 52);
  }

  // Chiziqlar izohi (o'ng yuqori burchak)
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = "right";
  let lx = W - PAD.right - 8;
  for (const ln of [...(input.lines ?? [])].reverse()) {
    if (!ln.label) continue;
    ctx.fillStyle = ln.dir ? C.text : (ln.color ?? C.muted);
    ctx.fillText(ln.label, lx, 32);
    lx -= ctx.measureText(ln.label).width + 16;
  }
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

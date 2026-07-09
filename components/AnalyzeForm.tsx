"use client";

import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MarketType, Timeframe } from "@/lib/api";

const POPULAR_COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"] as const;

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "15m", label: "15 daqiqa" },
  { value: "1h", label: "1 soat" },
  { value: "4h", label: "4 soat" },
  { value: "1d", label: "1 kun" },
  { value: "1w", label: "1 hafta" },
];

export interface AnalyzeFormState {
  symbol: string;
  interval: Timeframe;
  marketType: MarketType;
  capital: string;
  riskPercent: string;
}

interface AnalyzeFormProps {
  values: AnalyzeFormState;
  loading: boolean;
  onChange: (patch: Partial<AnalyzeFormState>) => void;
  onSubmit: () => void;
}

export function AnalyzeForm({
  values,
  loading,
  onChange,
  onSubmit,
}: AnalyzeFormProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.symbol.trim()) {
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border/60 bg-card p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Tezkor:</span>
        {POPULAR_COINS.map((coin) => (
          <Button
            key={coin}
            type="button"
            variant={values.symbol === coin ? "default" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => onChange({ symbol: coin })}
          >
            {coin.replace("USDT", "")}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <label htmlFor="marketType" className="text-sm font-medium">
            Bozor turi
          </label>
          <Select
            value={values.marketType}
            onValueChange={(value) =>
              onChange({ marketType: value as MarketType })
            }
            disabled={loading}
          >
            <SelectTrigger id="marketType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spot">Spot (long)</SelectItem>
              <SelectItem value="futures">Futures (long/short)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="symbol" className="text-sm font-medium">
            Coin symbol
          </label>
          <Input
            id="symbol"
            value={values.symbol}
            onChange={(e) => onChange({ symbol: e.target.value.toUpperCase() })}
            placeholder="BTCUSDT"
            disabled={loading}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="interval" className="text-sm font-medium">
            Timeframe
          </label>
          <Select
            value={values.interval}
            onValueChange={(value) =>
              onChange({ interval: value as Timeframe })
            }
            disabled={loading}
          >
            <SelectTrigger id="interval" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map((tf) => (
                <SelectItem key={tf.value} value={tf.value}>
                  {tf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="capital" className="text-sm font-medium">
            Kapital (USD)
          </label>
          <Input
            id="capital"
            type="number"
            min={1}
            step="any"
            inputMode="decimal"
            value={values.capital}
            onChange={(e) => onChange({ capital: e.target.value })}
            disabled={loading}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="riskPercent" className="text-sm font-medium">
            Risk (%)
          </label>
          <Input
            id="riskPercent"
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={values.riskPercent}
            onChange={(e) => onChange({ riskPercent: e.target.value })}
            disabled={loading}
            required
          />
        </div>
      </div>

      <div className="mt-4">
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Tahlil qilinmoqda...
            </>
          ) : (
            <>
              <Search className="size-4" />
              Tahlil qilish
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

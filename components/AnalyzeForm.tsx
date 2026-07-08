"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnalyzePayload, MarketType, Timeframe } from "@/lib/api";

const POPULAR_COINS = [
  { label: "BTC", symbol: "BTCUSDT" },
  { label: "ETH", symbol: "ETHUSDT" },
  { label: "SOL", symbol: "SOLUSDT" },
  { label: "BNB", symbol: "BNBUSDT" },
] as const;

interface AnalyzeFormProps {
  loading: boolean;
  symbol: string;
  marketType: MarketType;
  onSymbolChange: (symbol: string) => void;
  onMarketTypeChange: (marketType: MarketType) => void;
  onAnalyze: (payload: AnalyzePayload) => void;
}

export function AnalyzeForm({
  loading,
  symbol,
  marketType,
  onSymbolChange,
  onMarketTypeChange,
  onAnalyze,
}: AnalyzeFormProps) {
  const [interval, setInterval] = useState<Timeframe>("4h");
  const [capital, setCapital] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("2");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedCapital = Number(capital);
    const parsedRisk = Number(riskPercent);

    if (!symbol.trim()) {
      return;
    }

    onAnalyze({
      symbol: symbol.trim().toUpperCase(),
      interval,
      capital: parsedCapital,
      riskPercent: parsedRisk,
      marketType,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Tahlil parametrlari</h2>
        <p className="text-sm text-muted-foreground">
          Coin, timeframe va risk parametrlarini kiriting
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="mr-1 self-center text-xs text-muted-foreground">
            Tezkor:
          </span>
          {POPULAR_COINS.map((coin) => (
            <Button
              key={coin.symbol}
              type="button"
              variant={symbol === coin.symbol ? "default" : "outline"}
              size="sm"
              disabled={loading}
              onClick={() => onSymbolChange(coin.symbol)}
            >
              {coin.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <label htmlFor="marketType" className="text-sm font-medium">
            Bozor turi
          </label>
          <Select
            value={marketType}
            onValueChange={(value) => onMarketTypeChange(value as MarketType)}
            disabled={loading}
          >
            <SelectTrigger id="marketType" className="w-full">
              <SelectValue placeholder="Bozor tanlang" />
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
            value={symbol}
            onChange={(event) => onSymbolChange(event.target.value.toUpperCase())}
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
            value={interval}
            onValueChange={(value) => setInterval(value as Timeframe)}
            disabled={loading}
          >
            <SelectTrigger id="interval" className="w-full">
              <SelectValue placeholder="Timeframe tanlang" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4h">4 soat (4h)</SelectItem>
              <SelectItem value="1d">1 kun (1d)</SelectItem>
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
            step={100}
            value={capital}
            onChange={(event) => setCapital(event.target.value)}
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
            max={100}
            step={0.1}
            value={riskPercent}
            onChange={(event) => setRiskPercent(event.target.value)}
            disabled={loading}
            required
          />
        </div>
      </div>

      <div className="mt-5">
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Tahlil qilinmoqda...
            </>
          ) : (
            "Tahlil qilish"
          )}
        </Button>
      </div>
    </form>
  );
}

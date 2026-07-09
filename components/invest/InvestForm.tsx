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
import type { InvestHorizon } from "@/lib/api";
import { HORIZON_OPTIONS } from "@/lib/invest";

const POPULAR_COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"] as const;

export interface InvestFormState {
  symbol: string;
  capital: string;
  horizon: InvestHorizon;
}

interface InvestFormProps {
  values: InvestFormState;
  loading: boolean;
  onChange: (patch: Partial<InvestFormState>) => void;
  onSubmit: () => void;
}

export function InvestForm({
  values,
  loading,
  onChange,
  onSubmit,
}: InvestFormProps) {
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="invest-symbol" className="text-sm font-medium">
            Coin symbol
          </label>
          <Input
            id="invest-symbol"
            value={values.symbol}
            onChange={(e) => onChange({ symbol: e.target.value.toUpperCase() })}
            placeholder="BTCUSDT"
            disabled={loading}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="invest-capital" className="text-sm font-medium">
            Investitsiya kapitali (USD)
          </label>
          <Input
            id="invest-capital"
            type="number"
            min={1}
            step="any"
            value={values.capital}
            onChange={(e) => onChange({ capital: e.target.value })}
            disabled={loading}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="invest-horizon" className="text-sm font-medium">
            Muddat
          </label>
          <Select
            value={values.horizon}
            onValueChange={(value) =>
              onChange({ horizon: value as InvestHorizon })
            }
            disabled={loading}
          >
            <SelectTrigger id="invest-horizon" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZON_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} — {option.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              Uzoq muddat tahlili
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTrade } from "@/hooks/useJournal";
import { ApiError, type MarketType } from "@/lib/api";

interface NewTradeFormProps {
  onClose: () => void;
}

const NUMERIC_FIELDS = [
  { key: "entryPrice", label: "Kirish narxi" },
  { key: "stopLoss", label: "Stop-loss" },
  { key: "takeProfit", label: "Take-profit" },
  { key: "size", label: "Hajm (birlik)" },
] as const;

type NumericKey = (typeof NUMERIC_FIELDS)[number]["key"];

export function NewTradeForm({ onClose }: NewTradeFormProps) {
  const createTrade = useCreateTrade();
  const [symbol, setSymbol] = useState("");
  const [marketType, setMarketType] = useState<MarketType>("spot");
  const [side, setSide] = useState<"long" | "short">("long");
  const [values, setValues] = useState<Record<NumericKey, string>>({
    entryPrice: "",
    stopLoss: "",
    takeProfit: "",
    size: "",
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!symbol.trim()) return;

    createTrade.mutate(
      {
        symbol: symbol.trim().toUpperCase(),
        marketType,
        side,
        entryPrice: Number(values.entryPrice),
        stopLoss: Number(values.stopLoss),
        takeProfit: Number(values.takeProfit),
        size: Number(values.size),
      },
      {
        onSuccess: () => {
          toast.success("Savdo qo'shildi");
          onClose();
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Xato yuz berdi",
          ),
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-5 space-y-3 rounded-xl border border-border/60 bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Symbol</label>
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="BTCUSDT"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Bozor</label>
          <Select value={marketType} onValueChange={(v) => setMarketType(v as MarketType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spot">Spot</SelectItem>
              <SelectItem value="futures">Futures</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Yo&apos;nalish</label>
          <Select value={side} onValueChange={(v) => setSide(v as "long" | "short")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {NUMERIC_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-sm font-medium">{field.label}</label>
            <Input
              type="number"
              step="any"
              min={0}
              value={values[field.key]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
              required
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={createTrade.isPending}>
          Saqlash
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Bekor qilish
        </Button>
      </div>
    </form>
  );
}

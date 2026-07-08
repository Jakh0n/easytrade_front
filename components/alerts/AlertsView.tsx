"use client";

import { Bell, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAlerts,
  useCreateAlert,
  useDeleteAlert,
} from "@/hooks/useAlerts";
import { ApiError, type AlertType, type MarketType } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  price_above: "Narx yuqoriga",
  price_below: "Narx pastga",
  entry_zone: "Kirish zonasi",
  verdict_enter: "Kirish signali",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Faol",
  triggered: "Ishga tushdi",
  cancelled: "Bekor qilingan",
};

export function AlertsView() {
  const { data: alerts = [], isLoading } = useAlerts(30_000);
  const createAlert = useCreateAlert();
  const deleteAlert = useDeleteAlert();
  const notifiedRef = useRef<Set<string>>(new Set());

  const [symbol, setSymbol] = useState("");
  const [marketType, setMarketType] = useState<MarketType>("spot");
  const [type, setType] = useState<AlertType>("price_above");
  const [targetPrice, setTargetPrice] = useState("");

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    for (const alert of alerts) {
      if (alert.status === "triggered" && !notifiedRef.current.has(alert._id)) {
        notifiedRef.current.add(alert._id);
        toast.info(alert.message || `${alert.symbol} ogohlantirishi`);
        if (
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("EasyTrade AI", {
            body: alert.message || `${alert.symbol} ogohlantirishi`,
          });
        }
      }
    }
  }, [alerts]);

  const needsPrice = type === "price_above" || type === "price_below";

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!symbol.trim()) return;

    createAlert.mutate(
      {
        symbol: symbol.trim().toUpperCase(),
        marketType,
        type,
        targetPrice: needsPrice ? Number(targetPrice) : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Ogohlantirish qo'shildi");
          setSymbol("");
          setTargetPrice("");
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Xato yuz berdi",
          ),
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Ogohlantirishlar"
        description="Narx va signal ogohlantirishlari (har daqiqada tekshiriladi)"
      />

      <form
        onSubmit={handleCreate}
        className="mb-5 grid gap-3 rounded-xl border border-border/60 bg-card p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
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
          <label className="text-sm font-medium">Tur</label>
          <Select value={type} onValueChange={(v) => setType(v as AlertType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price_above">Narx yuqoriga</SelectItem>
              <SelectItem value="price_below">Narx pastga</SelectItem>
              <SelectItem value="entry_zone">Kirish zonasi</SelectItem>
              <SelectItem value="verdict_enter">Kirish signali</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Narx (ixtiyoriy)</label>
          <Input
            type="number"
            step="any"
            min={0}
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            disabled={!needsPrice}
            required={needsPrice}
          />
        </div>
        <Button type="submit" disabled={createAlert.isPending}>
          Qo&apos;shish
        </Button>
      </form>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && alerts.length === 0 && (
        <EmptyState
          icon={<Bell className="size-6" />}
          title="Ogohlantirishlar yo'q"
          description="Narx yoki signal ogohlantirishini qo'shing."
        />
      )}

      {alerts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border/60">
          {alerts.map((alert) => (
            <div
              key={alert._id}
              className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{alert.symbol}</span>
                  <Badge variant="outline" className="text-xs">
                    {ALERT_TYPE_LABELS[alert.type]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      alert.status === "triggered"
                        ? "text-xs text-emerald-600 dark:text-emerald-400"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {STATUS_LABELS[alert.status] ?? alert.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {alert.targetPrice
                    ? `Nishon: ${formatPrice(alert.targetPrice)} · `
                    : ""}
                  {formatDate(alert.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="O'chirish"
                onClick={() =>
                  deleteAlert.mutate(alert._id, {
                    onSuccess: () => toast.success("O'chirildi"),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

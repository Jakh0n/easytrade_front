"use client";

import { Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { InvestForm, type InvestFormState } from "@/components/invest/InvestForm";
import { InvestOpportunities } from "@/components/invest/InvestOpportunities";
import { InvestVerdict } from "@/components/invest/InvestVerdict";
import { Button } from "@/components/ui/button";
import { useInvest } from "@/hooks/useMarket";
import { useAddWatchlist } from "@/hooks/useWatchlist";
import { ApiError, type InvestHorizon } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

function toApiMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Xato yuz berdi";
}

export function InvestView() {
  const searchParams = useSearchParams();
  const settings = useAuthStore((state) => state.user?.settings);

  const [form, setForm] = useState<InvestFormState>(() => ({
    symbol: (searchParams.get("symbol") ?? "").toUpperCase(),
    capital: String(settings?.capital ?? 100),
    horizon:
      (searchParams.get("horizon") as InvestHorizon | null) ?? "3_6",
  }));

  const invest = useInvest();
  const result = invest.data;
  const addWatchlist = useAddWatchlist();

  const runInvest = useCallback(
    (override?: Partial<InvestFormState>) => {
      const next = { ...form, ...override };
      invest.mutate(
        {
          symbol: next.symbol.trim().toUpperCase(),
          capital: Number(next.capital) || 100,
          horizon: next.horizon,
        },
        { onError: (error) => toast.error(toApiMessage(error)) },
      );
    },
    [form, invest],
  );

  const handleSelectOpportunity = (symbol: string) => {
    setForm((prev) => ({ ...prev, symbol }));
    runInvest({ symbol });
  };

  const handleHorizonChange = (horizon: InvestHorizon) => {
    setForm((prev) => ({ ...prev, horizon }));
  };

  const handleAddWatchlist = () => {
    if (!result) return;
    addWatchlist.mutate(
      { symbol: result.symbol, marketType: "spot" },
      {
        onSuccess: () => toast.success("Watchlist'ga qo'shildi"),
        onError: (error) => toast.error(toApiMessage(error)),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Uzoq muddat investitsiya"
        description="1-24 oy uchun spot hold tahlili: DCA rejasi, maqsadlar va invalidation"
      />

      <InvestOpportunities
        horizon={form.horizon}
        onHorizonChange={handleHorizonChange}
        onSelect={handleSelectOpportunity}
      />

      <InvestForm
        values={form}
        loading={invest.isPending}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onSubmit={() => runInvest()}
      />

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddWatchlist}
              disabled={addWatchlist.isPending}
            >
              <Star className="size-3.5" />
              Watchlist
            </Button>
          </div>

          <InvestVerdict result={result} />
        </div>
      )}
    </div>
  );
}

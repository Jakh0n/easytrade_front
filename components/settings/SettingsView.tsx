"use client";

import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, type MarketType, updateSettings } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

type ThemePref = "light" | "dark" | "system";

export function SettingsView() {
  const user = useAuthStore((state) => state.user);
  const applySettings = useAuthStore((state) => state.applySettings);
  const { setTheme } = useTheme();

  const [capital, setCapital] = useState(String(user?.settings.capital ?? 10_000));
  const [riskPercent, setRiskPercent] = useState(
    String(user?.settings.riskPercent ?? 2),
  );
  const [marketType, setMarketType] = useState<MarketType>(
    user?.settings.marketType ?? "spot",
  );
  const [themePref, setThemePref] = useState<ThemePref>(
    user?.settings.theme ?? "system",
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await updateSettings({
        capital: Number(capital),
        riskPercent: Number(riskPercent),
        marketType,
        theme: themePref,
      });
      applySettings(updated.settings);
      setTheme(themePref);
      toast.success("Sozlamalar saqlandi");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Xato yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Sozlamalar"
        description="Standart risk parametrlari va ko'rinish"
      />

      <form
        onSubmit={handleSave}
        className="max-w-lg space-y-4 rounded-xl border border-border/60 bg-card p-5"
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Standart kapital (USD)</label>
          <Input
            type="number"
            min={1}
            step={100}
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Standart risk (%)</label>
          <Input
            type="number"
            min={0.1}
            max={100}
            step={0.1}
            value={riskPercent}
            onChange={(e) => setRiskPercent(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Standart bozor</label>
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
          <label className="text-sm font-medium">Mavzu</label>
          <Select value={themePref} onValueChange={(v) => setThemePref(v as ThemePref)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Yorug&apos;</SelectItem>
              <SelectItem value="dark">Qorong&apos;i</SelectItem>
              <SelectItem value="system">Tizim</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </form>
    </div>
  );
}

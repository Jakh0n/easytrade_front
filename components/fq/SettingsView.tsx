"use client";

import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignals, useTelegramTest } from "@/hooks/useFq";
import { ApiError, updateSettings } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { Panel } from "./primitives";

const STRATEGY_PARAMS: [string, string][] = [
  ["Timeframe", "1H kirish · 4H EMA 200 filtri"],
  ["Trend", "EMA 20 / 50 / 200"],
  ["Pullback", "EMA 20 ga tegish, RSI 40–70 (long) / 30–60 (short)"],
  ["Breakout", "20 sham diapazoni, hajm ≥ 1.5× o'rtacha, RSI < 80 / > 20"],
  ["Filtrlar", "ADX ≥ 20, DI mos, EMA 20 dan ≤ 2 ATR"],
  ["Stop", "10 sham swing ± 0.3 ATR (0.8–3 ATR)"],
  ["TP", "TP1 1R (50%), TP2 2.5R, BE + 0.1R"],
  ["Cooldown", "Coinda ochiq signal bo'lsa yangisi olinmaydi"],
];

function StatusRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-long" aria-label="Tayyor" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-short" aria-label="Tayyor emas" />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </li>
  );
}

function RiskForm() {
  const user = useAuthStore((s) => s.user);
  const applySettings = useAuthStore((s) => s.applySettings);
  const [capital, setCapital] = useState(String(user?.settings.capital ?? 1000));
  const [risk, setRisk] = useState(String(user?.settings.riskPercent ?? 1));
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await updateSettings({ capital: Number(capital), riskPercent: Number(risk) });
      applySettings(updated.settings);
      toast.success("Risk sozlamalari saqlandi");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="capital" className="text-sm font-medium">Kapital (USDT)</label>
          <Input id="capital" type="number" inputMode="decimal" min={1} step="any" value={capital} onChange={(e) => setCapital(e.target.value)} required className="num" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="risk" className="text-sm font-medium">Bir savdoda risk, %</label>
          <Input id="risk" type="number" inputMode="decimal" min={0.1} max={10} step={0.05} value={risk} onChange={(e) => setRisk(e.target.value)} required aria-describedby="risk-hint" className="num" />
          <p id="risk-hint" className="text-xs text-muted-foreground">FQ v3 swing standarti — 1%. Maksimum 10%.</p>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        Saqlash
      </Button>
    </form>
  );
}

export function SettingsView() {
  const signals = useSignals();
  const test = useTelegramTest();
  const telegram = signals.data?.telegram;

  const onTest = () =>
    test.mutate(undefined, {
      onSuccess: () => toast.success("Test xabari yuborildi — Telegramni tekshiring"),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Yuborib bo'lmadi"),
    });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sozlamalar</h1>
        <p className="text-sm text-muted-foreground">Telegram bildirishnomalari, risk va strategiya parametrlari</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Telegram bot"
          action={
            <Button size="sm" variant="outline" onClick={onTest} disabled={test.isPending || !telegram?.configured}>
              {test.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Test xabar
            </Button>
          }
        >
          <ul className="divide-y divide-border">
            <StatusRow
              ok={Boolean(telegram?.configured)}
              label="Bot ulangan"
              hint="TELEGRAM_BOT_TOKEN va TELEGRAM_CHANNEL_ID muhit o'zgaruvchilari"
            />
            <StatusRow
              ok={Boolean(telegram?.enabled)}
              label="Signal yuborish yoqilgan"
              hint="TELEGRAM_SIGNALS_ENABLED=true"
            />
          </ul>
          <div className="mt-3 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Har signalda nima keladi</p>
            Yo&apos;nalish, setup, kirish / stop / TP1 / TP2 (foizlari bilan), pozitsiya hajmi va ADX/RSI. Keyin shu xabarga reply
            sifatida: TP1 urildi, TP2 / BE / Stop natijasi.
          </div>
        </Panel>

        <Panel title="Risk boshqaruvi">
          <RiskForm />
        </Panel>
      </div>

      <Panel title="FQ Strategy v3 parametrlari (swing)">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {STRATEGY_PARAMS.map(([label, value]) => (
            <div key={label} className="flex gap-3 text-sm">
              <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

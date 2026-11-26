"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useAuthStore } from "@/lib/store/auth";
import { Panel, Tag } from "./primitives";

const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;

const STRATEGIES: { name: string; status: string; tone: "long" | "warn" | "muted"; role: string }[] = [
  {
    name: "📊 Momentum savati",
    status: "Sharpe ~1.1 · 5 yildan 4 tasida musbat",
    tone: "long",
    role: "Asosiy",
  },
  {
    name: "📥 SMC 4H (limit)",
    status: "+0.05–0.10R / savdo · kichik, lekin izchil",
    tone: "warn",
    role: "Ikkinchi darajali",
  },
  {
    name: "Swing 1H · Swing 4H · Day 15M",
    status: "Zararda yoki barqaror emas",
    tone: "muted",
    role: "Faqat kuzatish",
  },
];

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5 text-sm">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold text-muted-foreground">
            {i + 1}
          </span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Example({ children }: { children: ReactNode }) {
  return <p className="num mt-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

export function GuideView() {
  const user = useAuthStore((s) => s.user);
  const capital = user?.settings.capital ?? 1000;
  const riskPct = user?.settings.riskPercent ?? 1;
  const momentum = capital * 0.65;
  const smc = capital - momentum;
  const perCoin = momentum / 20;
  const riskUsd = (smc * riskPct) / 100;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Savdo qo’llanmasi</h1>
        <p className="text-sm text-muted-foreground">
          Bot signallarini qanday bajarish — umumiy qoidalar. Misollar Sozlamalar’dagi kapital ({usd(capital)}) va risk (
          {riskPct}%) bo’yicha.
        </p>
      </div>

      <div className="flex gap-3 rounded-lg border border-warn/30 bg-warn/8 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <p className="leading-relaxed">
          Bu moliyaviy maslahat emas — strategiyalar qanday sinalgani va ularni intizom bilan bajarish tartibi. Backtest
          kelajakni kafolatlamaydi. Avval kichik summa bilan 1–2 oy sinab ko’ring; qancha kapital va risk qo’yishni o’zingiz
          hal qilasiz.
        </p>
      </div>

      <Panel title="1. Strategiyalar va ularga munosabat" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {STRATEGIES.map((s) => (
            <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.status}</p>
              </div>
              <Tag tone={s.tone}>{s.role}</Tag>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="2. Kapitalni taqsimlash">
        <p className="text-sm leading-relaxed">
          Kapitalni strategiyalar orasida oldindan bo’ling — ular bir-biriga aralashmasin.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Momentum savati · ~65%</p>
            <p className="num text-lg font-semibold">{usd(momentum)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">SMC 4H · ~35%</p>
            <p className="num text-lg font-semibold">{usd(smc)}</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="3. 📊 Momentum — har dushanba">
          <Steps
            items={[
              <>
                Bot ~10 LONG va ~10 SHORT ro’yxatini yuboradi (Toshkent 05:00). Har coinga <b>teng summa</b>: momentum
                kapitali ÷ 20.
                <Example>
                  {usd(momentum)} ÷ 20 = har coinga ~{usd(perCoin)}
                </Example>
              </>,
              <>
                Binance Futures: <b>Cross margin, leverage 1–2x</b>. Savat hajmi kapitalga teng — katta leverage kerak emas.
              </>,
              <>
                &quot;O’zgarishlar&quot; qatoriga qarang: faqat <b>chiqqanlarni yoping, yangilarini oching</b> — qolganlariga
                tegmang (komissiya kam).
              </>,
              <>
                Coinlarga alohida stop <b>qo’ymang</b> — strategiya savat sifatida sinalgan. Risk savat darajasida (6-bo’lim).
              </>,
              <>
                Long va shortni <b>doim birga</b> oching. Backtestda alohida tomonlar −85% gacha tushgan.
              </>,
            ]}
          />
        </Panel>

        <Panel title="4. 📥 SMC 4H — limit order">
          <Steps
            items={[
              <>
                Xabar kelganda Binance’da <b>Limit order</b> qo’ying — narx: &quot;Limit kirish&quot;.
              </>,
              <>
                Hajm: <b>pozitsiya = risk summasi ÷ (kirish → stop masofasi)</b>.
                <Example>
                  {usd(smc)} × {riskPct}% = {usd(riskUsd)} risk. Stop 5% uzoqda bo’lsa → pozitsiya {usd(riskUsd / 0.05)}
                </Example>
              </>,
              <>
                Order bilan birga <b>Stop Market</b> (stop narxi) va TP1 da <b>50% Take Profit</b> qo’ying.
              </>,
              <>
                Bot &quot;✅ Limit to’ldi&quot; desa — savdo ochiq. <b>TP1 urilgach</b> qolgan 50% stopini kirishga (BE)
                suring, TP2 qo’ying.
              </>,
              <>
                Bot &quot;❌ Order bekor&quot; desa — Binance’dagi limitni <b>qo’lda bekor qiling</b>, aks holda keyin
                kutilmaganda to’lib qolishi mumkin.
              </>,
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="5. Tartib">
          <ul className="space-y-2 text-sm">
            <li>
              <b>Har kuni (5 daqiqa):</b> SMC xabarlari — yangi limit, bekor qilish, BE ga surish.
            </li>
            <li>
              <b>Dushanba (15–20 daqiqa):</b> Momentum savatini yangilash.
            </li>
            <li>
              <b>Har oy:</b> Signallar sahifasida real natijani backtest bilan solishtirish.
            </li>
          </ul>
        </Panel>

        <Panel title="6. Risk qoidalari">
          <ul className="space-y-2 text-sm leading-relaxed">
            <li>
              <b>To’xtash:</b> momentum savati boshlang’ichdan <b>−35%</b> yoki SMC ketma-ket <b>−10R</b> — savdoni to’xtatib,
              tahlil qiling. Bunday tushish backtestda bo’lgan; chuqurrog’i — nimadir o’zgargan belgisi.
            </li>
            <li>Signaldan tashqari &quot;o’zim bilaman&quot; savdolarini aralashtirmang — natijani o’lchab bo’lmaydi.</li>
            <li>Kichik/yangi coinlarda spread katta — limit order bilan kiring.</li>
            <li>Funding’ni kuzating: momentum long’lari odatda funding oladi, lekin short squeeze’da u juda katta bo’lishi mumkin.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

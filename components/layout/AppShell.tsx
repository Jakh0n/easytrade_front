"use client";

import { LogOut, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth";
import { BottomNav, Logo, Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

function CoinSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const raw = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!raw) return;
    const symbol = raw.endsWith("USDT") ? raw : `${raw}USDT`;
    setValue("");
    router.push(`/coin/${symbol}`);
  };

  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-xs">
      <label htmlFor="coin-search" className="sr-only">
        Coin qidirish
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id="coin-search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Coin: BTC, SOL…"
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-md border border-input bg-muted/50 pr-3 pl-8 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-sm"
      />
    </form>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Yuklanmoqda">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Asosiy kontentga o&apos;tish
      </a>

      <aside className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <div className="sticky top-0 h-dvh">
          <Sidebar />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="hidden flex-1 md:block">
            <CoinSearch />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label="Chiqish" onClick={handleLogout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="border-b border-border px-4 py-2 md:hidden">
          <CoinSearch />
        </div>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-24 outline-none sm:px-6 md:pb-8">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

"use client";

import { BookOpen, Cpu, History, Radar, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Skaner", icon: Radar },
  { href: "/signals", label: "Signallar", icon: History },
  { href: "/engine", label: "Engine v2", icon: Cpu },
  { href: "/guide", label: "Qo'llanma", icon: BookOpen },
  { href: "/settings", label: "Sozlamalar", icon: Settings },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span className="num flex size-8 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
        FQ
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">FQ Signals</span>
        <span className="block text-[11px] text-muted-foreground">Strategy v3 · 1H</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const isActive = useIsActive();

  return (
    <nav className="flex h-full flex-col gap-6 p-4" aria-label="Asosiy menyu">
      <Logo />
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  const isActive = useIsActive();

  return (
    <nav
      aria-label="Asosiy menyu"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

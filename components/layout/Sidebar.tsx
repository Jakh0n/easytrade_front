"use client";

import {
  Bell,
  BookOpen,
  LayoutDashboard,
  LineChart,
  Radar,
  Settings,
  Star,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Boshqaruv paneli", icon: LayoutDashboard },
  { href: "/screener", label: "Skrining", icon: Radar },
  { href: "/analyze", label: "Tahlil", icon: LineChart },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/journal", label: "Savdo jurnali", icon: BookOpen },
  { href: "/alerts", label: "Ogohlantirishlar", icon: Bell },
  { href: "/settings", label: "Sozlamalar", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Asosiy menyu">
      <div className="flex items-center gap-2 px-2 py-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LineChart className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">EasyTrade AI</p>
          <p className="text-xs text-muted-foreground">Trading Assistant</p>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

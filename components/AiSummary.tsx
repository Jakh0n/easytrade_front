"use client";

import { ChevronDown } from "lucide-react";
import Markdown from "react-markdown";

interface AiSummaryProps {
  symbol: string;
  analysis: string;
}

export function AiSummary({ symbol, analysis }: AiSummaryProps) {
  return (
    <details className="group rounded-xl border border-border/60 bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-medium">AI izoh — {symbol}</p>
          <p className="text-xs text-muted-foreground">
            Qisqa texnik tahlil (ixtiyoriy)
          </p>
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/60 px-4 py-4 sm:px-5">
        <article className="space-y-3 text-sm leading-relaxed text-foreground/90 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p:not(:last-child)]:mb-3 [&_strong]:font-semibold">
          <Markdown>{analysis}</Markdown>
        </article>
      </div>
    </details>
  );
}

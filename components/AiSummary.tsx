import Markdown from "react-markdown";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AiSummaryProps {
  symbol: string;
  analysis: string;
}

export function AiSummary({ symbol, analysis }: AiSummaryProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>AI tahlil — {symbol}</CardTitle>
        <CardDescription>
          Texnik ma&apos;lumotlarga asoslangan avtomatik tahlil
        </CardDescription>
      </CardHeader>
      <CardContent>
        <article className="space-y-3 text-sm leading-relaxed text-foreground/90 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-medium [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p:not(:last-child)]:mb-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:space-y-1">
          <Markdown>{analysis}</Markdown>
        </article>
      </CardContent>
    </Card>
  );
}

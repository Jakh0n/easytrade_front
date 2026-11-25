import { Suspense } from "react";
import { CoinView } from "@/components/fq/CoinView";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (
    <Suspense>
      <CoinView symbol={clean.endsWith("USDT") ? clean : `${clean}USDT`} />
    </Suspense>
  );
}

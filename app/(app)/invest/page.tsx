import { Suspense } from "react";
import { InvestView } from "@/components/invest/InvestView";

export default function InvestPage() {
  return (
    <Suspense fallback={null}>
      <InvestView />
    </Suspense>
  );
}

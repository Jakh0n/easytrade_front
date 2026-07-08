import { Suspense } from "react";
import { AnalyzeView } from "@/components/analyze/AnalyzeView";

export default function AnalyzePage() {
  return (
    <Suspense fallback={null}>
      <AnalyzeView />
    </Suspense>
  );
}

import { StrategyDetailView } from "@/components/strategies/StrategyDetailView";
import type { CustomStrategyId } from "@/lib/api";

interface StrategyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StrategyDetailPage({
  params,
}: StrategyDetailPageProps) {
  const { id } = await params;
  return (
    <StrategyDetailView strategyId={id as CustomStrategyId} />
  );
}

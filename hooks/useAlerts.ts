"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAlert, deleteAlert, fetchAlerts } from "@/lib/api";

const ALERTS_KEY = ["alerts"] as const;

export function useAlerts(refetchMs?: number) {
  return useQuery({
    queryKey: ALERTS_KEY,
    queryFn: fetchAlerts,
    refetchInterval: refetchMs,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}

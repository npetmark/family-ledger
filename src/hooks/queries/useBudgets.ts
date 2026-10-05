import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetRepository } from "@/repositories/budgetRepository";

export function useBudgets(userId: string | undefined, monthYear: string) {
  return useQuery({
    queryKey: ["budgets", userId, monthYear],
    queryFn: () => budgetRepository.getBudgets(monthYear),
    enabled: !!userId,
  });
}

export function useBudgetsWithCategories(userId: string | undefined, monthYear: string) {
  return useQuery({
    queryKey: ["budgets-with-categories", userId, monthYear],
    queryFn: () => budgetRepository.getBudgetsWithCategories(monthYear),
    enabled: !!userId,
  });
}

export function useSaveBudgets(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updates, inserts }: { updates: { id: string; payload: any }[]; inserts: any[] }) => {
      // Execute all updates sequentially
      for (const update of updates) {
        await budgetRepository.updateBudget(update.id, update.payload);
      }
      // Execute inserts in one go
      if (inserts.length > 0) {
        await budgetRepository.createBudgets(inserts);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useDeleteBudgets(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: budgetRepository.deleteBudgets,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

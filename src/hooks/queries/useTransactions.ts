import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionRepository } from "@/repositories/transactionRepository";

export function useTransactions(userId: string | undefined, dateFilter: { from: Date; to: Date }) {
  return useQuery({
    queryKey: ["transactions", userId, dateFilter.from.toISOString(), dateFilter.to.toISOString()],
    queryFn: async () => {
      const fromStr = `${dateFilter.from.getFullYear()}-${String(dateFilter.from.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.from.getDate()).padStart(2, "0")}`;
      const toStr = `${dateFilter.to.getFullYear()}-${String(dateFilter.to.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.to.getDate()).padStart(2, "0")}`;
      return transactionRepository.getTransactionsByDateRange(fromStr, toStr);
    },
    enabled: !!userId,
  });
}

export function useSaveTransaction(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      if (id) {
        await transactionRepository.updateTransaction(id, payload);
      } else {
        await transactionRepository.createTransaction(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-for-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["prev-transactions-for-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-tx"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-future-tx"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-stats"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useDeleteTransaction(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: transactionRepository.deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-for-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["prev-transactions-for-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-tx"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-future-tx"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-stats"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useRecurringTransactions(userId: string | undefined) {
  return useQuery({
    queryKey: ["recurring-transactions", userId],
    queryFn: transactionRepository.getRecurringTransactions,
    enabled: !!userId,
  });
}

export function useSaveRecurringTransaction(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      if (id) {
        await transactionRepository.updateRecurringTransaction(id, payload);
      } else {
        await transactionRepository.createRecurringTransaction(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-future-tx"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useDeleteRecurringTransaction(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: transactionRepository.deleteRecurringTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-future-tx"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

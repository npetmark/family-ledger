import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountRepository } from "@/repositories/accountRepository";

export function useAccounts(userId?: string) {
  return useQuery({
    queryKey: ["accounts", userId],
    queryFn: accountRepository.getAccounts,
    enabled: !!userId,
  });
}

export function useAccountBalances(userId?: string) {
  return useQuery({
    queryKey: ["account-balances", userId],
    queryFn: accountRepository.getAccountBalances,
    enabled: !!userId,
  });
}

export function useSaveAccount(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      if (id) {
        await accountRepository.updateAccount(id, payload);
      } else {
        await accountRepository.createAccount(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useDeleteAccount(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: accountRepository.deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

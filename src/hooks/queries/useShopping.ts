import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shoppingRepository } from "@/repositories/shoppingRepository";

export function useShoppingCategories() {
  return useQuery({
    queryKey: ["shopping-categories"],
    queryFn: shoppingRepository.getCategories,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

export function useActiveShoppingTrip(userId: string | undefined) {
  return useQuery({
    queryKey: ["active-trip", userId],
    queryFn: () => shoppingRepository.getActiveTrip(userId!),
    enabled: !!userId,
  });
}

export function useShoppingItems(tripId: string | undefined) {
  return useQuery({
    queryKey: ["shopping-items", tripId],
    queryFn: () => shoppingRepository.getTripItems(tripId!),
    enabled: !!tripId,
  });
}

export function usePastShoppingTrips(userId: string | undefined) {
  return useQuery({
    queryKey: ["past-trips", userId],
    queryFn: () => shoppingRepository.getPastTrips(userId!),
    enabled: !!userId,
  });
}

export function useShoppingDictionary(userId: string | undefined) {
  return useQuery({
    queryKey: ["shopping-dictionary", userId],
    queryFn: () => shoppingRepository.getDictionaryEntries(userId!),
    enabled: !!userId,
  });
}

export function useShoppingSuggestions(debounced: string, enabled: boolean) {
  return useQuery({
    queryKey: ["shopping-suggestions", debounced],
    queryFn: () => shoppingRepository.getSuggestions(debounced),
    enabled: enabled && debounced.length > 0,
  });
}

export function useTopSuggested(enabled: boolean) {
  return useQuery({
    queryKey: ["shopping-top-suggested"],
    queryFn: () => shoppingRepository.getTopSuggested(),
    enabled: enabled,
  });
}

export function useSaveShoppingItem(options?: { onSuccess?: (data?: any) => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      if (id) {
        await shoppingRepository.updateItem(id, payload);
        return null;
      } else {
        return await shoppingRepository.createItem(payload);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-items"] });
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}

export function useDeleteShoppingItem(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: shoppingRepository.deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-items"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useCreateShoppingTrip(options?: { onSuccess?: (data: any) => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
      return await shoppingRepository.createTrip(userId, name);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["active-trip"] });
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}

export function useUpdateShoppingTrip(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      await shoppingRepository.updateTrip(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-trip"] });
      queryClient.invalidateQueries({ queryKey: ["past-trips"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useUpdateDictionaryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      await shoppingRepository.updateDictionaryEntry(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-dictionary"] });
    },
  });
}

export function useInsertDictionaryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      await shoppingRepository.insertDictionaryEntry(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-dictionary"] });
    },
  });
}

export function useInsertShoppingItemsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: any[]) => {
      await shoppingRepository.insertItemsBulk(items);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-items"] });
    },
  });
}

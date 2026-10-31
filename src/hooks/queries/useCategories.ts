import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryRepository } from "@/repositories/categoryRepository";

function invalidateAllCategoryDependentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["main_categories"] });
  queryClient.invalidateQueries({ queryKey: ["subcategories"] });
  queryClient.invalidateQueries({ queryKey: ["active-subcategories"] });
  queryClient.invalidateQueries({ queryKey: ["transactions"] });
  queryClient.invalidateQueries({ queryKey: ["transactions-for-budgets"] });
  queryClient.invalidateQueries({ queryKey: ["prev-transactions-for-budgets"] });
  queryClient.invalidateQueries({ queryKey: ["budgets-with-categories"] });
  queryClient.invalidateQueries({ queryKey: ["analytics-transactions"] });
}

export function useMainCategories(userId?: string) {
  return useQuery({
    queryKey: ["main_categories", userId],
    queryFn: categoryRepository.getMainCategories,
    enabled: !!userId,
  });
}

export function useSubcategories(userId?: string) {
  return useQuery({
    queryKey: ["subcategories", userId],
    queryFn: categoryRepository.getSubcategories,
    enabled: !!userId,
  });
}

export function useActiveSubcategories(userId?: string) {
  return useQuery({
    queryKey: ["active-subcategories", userId],
    queryFn: categoryRepository.getActiveSubcategoriesWithMain,
    enabled: !!userId,
  });
}

export function useGroceriesSubcategoryId(userId?: string) {
  return useQuery({
    queryKey: ["groceries-subcategory", userId],
    queryFn: categoryRepository.getGroceriesSubcategoryId,
    enabled: !!userId,
  });
}

export function useSaveMainCategory(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      if (id) {
        await categoryRepository.updateMainCategory(id, payload);
      } else {
        await categoryRepository.createMainCategory(payload);
      }
    },
    onSuccess: () => {
      invalidateAllCategoryDependentQueries(queryClient);
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useDeleteMainCategory(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: categoryRepository.deleteMainCategory,
    onSuccess: () => {
      invalidateAllCategoryDependentQueries(queryClient);
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useSaveSubcategory(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      if (id) {
        await categoryRepository.updateSubcategory(id, payload);
      } else {
        await categoryRepository.createSubcategory(payload);
      }
    },
    onSuccess: () => {
      invalidateAllCategoryDependentQueries(queryClient);
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useDeleteSubcategory(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: categoryRepository.deleteSubcategory,
    onSuccess: () => {
      invalidateAllCategoryDependentQueries(queryClient);
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useReorderSubcategories(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: categoryRepository.reorderSubcategories,
    onSuccess: () => {
      invalidateAllCategoryDependentQueries(queryClient);
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

export function useReorderMainCategories(options?: { onSuccess?: () => void; onError?: (error: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: categoryRepository.reorderMainCategories,
    onSuccess: () => {
      invalidateAllCategoryDependentQueries(queryClient);
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

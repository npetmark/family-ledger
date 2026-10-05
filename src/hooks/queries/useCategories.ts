import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryRepository } from "@/repositories/categoryRepository";

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
      queryClient.invalidateQueries({ queryKey: ["main_categories"] });
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
      queryClient.invalidateQueries({ queryKey: ["main_categories"] });
      queryClient.invalidateQueries({ queryKey: ["subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["active-subcategories"] });
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
      queryClient.invalidateQueries({ queryKey: ["subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["active-subcategories"] });
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
      queryClient.invalidateQueries({ queryKey: ["subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["active-subcategories"] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}

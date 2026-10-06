import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Profile {
  id: string;
  display_name: string;
  currency: string;
}

export const PROFILE_QUERY_KEY = "profile";

export const useProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: [PROFILE_QUERY_KEY, user?.id],
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, currency")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!user,
  });
};

export const useUpdateProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Pick<Profile, "display_name" | "currency">>) => {
      if (!user) throw new Error("Not authenticated");
      // Upsert so users whose profile row was never created still get one.
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, ...updates }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFILE_QUERY_KEY] });
      // Names are shown in members lists and account ownership badges.
      queryClient.invalidateQueries({ queryKey: ["household-members"] });
      queryClient.invalidateQueries({ queryKey: ["household-members-with-profiles"] });
    },
  });
};

/** Best-effort display label for the current user. */
export const getDisplayLabel = (profile: Profile | null | undefined, email?: string | null) =>
  profile?.display_name?.trim() || email || "Account";

/** Up to two uppercase initials derived from a name or email. */
export const getInitials = (label: string) =>
  label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  /** Full name, kept in sync by a DB trigger from first/last name. */
  display_name: string;
  currency: string;
}

type NameFields = { first_name?: string | null; last_name?: string | null; display_name?: string | null };

export const PROFILE_QUERY_KEY = "profile";

export const useProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: [PROFILE_QUERY_KEY, user?.id],
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, display_name, currency")
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
    mutationFn: async (updates: Partial<Pick<Profile, "first_name" | "last_name" | "currency">>) => {
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

/** First name only (falls back to first word of display_name). */
export const getFirstName = (profile: NameFields | null | undefined) =>
  profile?.first_name?.trim() || profile?.display_name?.trim().split(/\s+/)[0] || "";

/** Full name "First Last". */
export const getFullName = (profile: NameFields | null | undefined) =>
  [profile?.first_name?.trim(), profile?.last_name?.trim()].filter(Boolean).join(" ") ||
  profile?.display_name?.trim() ||
  "";

/** Short label for compact UI: first name, else email, else "Account". */
export const getDisplayLabel = (profile: NameFields | null | undefined, email?: string | null) =>
  getFirstName(profile) || email || "Account";

/** Initials from first + last name, falling back to the given label. */
export const getInitials = (label: string, profile?: NameFields | null) => {
  const f = profile?.first_name?.trim();
  const l = profile?.last_name?.trim();
  if (f) return `${f[0]}${l?.[0] ?? ""}`.toUpperCase();
  return (
    label
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
};

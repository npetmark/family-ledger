import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useHouseholdMembers = (userId?: string) => {
  return useQuery({
    queryKey: ["household-members-with-profiles", userId],
    queryFn: async () => {
      if (!userId) return null;

      // 1. Get user's household_id
      const { data: memberData, error: mErr } = await supabase
        .from("household_members")
        .select("household_id, role")
        .eq("user_id", userId)
        .single();
      
      if (mErr || !memberData) return null;
      
      const householdId = memberData.household_id;

      // 2. Fetch all members in this household
      const { data: hmData, error: hmErr } = await supabase
        .from("household_members")
        .select("*")
        .eq("household_id", householdId)
        .order("joined_at", { ascending: true });
      
      if (hmErr) throw hmErr;

      // 3. Fetch profiles
      const userIds = hmData.map((m: any) => m.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      if (pErr) throw pErr;

      const members = hmData.map((member: any) => ({
        ...member,
        profile: profiles.find((p: any) => p.id === member.user_id)
      }));

      return {
        householdId,
        myRole: memberData.role,
        members
      };
    },
    enabled: !!userId
  });
};

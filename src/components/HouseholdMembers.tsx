import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserMinus, Shield, LogOut } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useLanguage } from "@/lib/i18n";
import { getFirstName, getFullName } from "@/hooks/queries/useProfile";

interface HouseholdMembersProps {
  householdId: string;
}

export default function HouseholdMembers({ householdId }: HouseholdMembersProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["household-members", householdId],
    queryFn: async () => {
      const { data: hmData, error: hmErr } = await supabase
        .from("household_members")
        .select("*")
        .eq("household_id", householdId)
        .order("joined_at", { ascending: true });
      
      if (hmErr) throw hmErr;

      // Fetch profiles
      const userIds = hmData.map(m => m.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, display_name")
        .in("id", userIds);

      if (pErr) throw pErr;

      return hmData.map(member => ({
        ...member,
        profile: profiles.find(p => p.id === member.user_id)
      }));
    },
    enabled: !!householdId
  });

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    const { error } = await supabase.rpc("remove_household_member", {
      p_household_id: householdId,
      p_user_id: userId,
    });
    
    setRemovingId(null);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("settings.memberRemovedSuccess"));
      queryClient.invalidateQueries({ queryKey: ["household-members"] });
      queryClient.invalidateQueries({ queryKey: ["household-members-with-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    const { error } = await supabase.rpc("leave_household", {
      p_household_id: householdId,
    });
    setLeaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("settings.leftHouseholdSuccess"));
      queryClient.invalidateQueries({ queryKey: ["household-members"] });
      queryClient.invalidateQueries({ queryKey: ["household-members-with-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["household-info"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["subcategories"] });
      window.location.reload();
    }
  };

  const myRole = members?.find(m => m.user_id === user?.id)?.role;
  const isOwner = myRole === 'owner';

  if (isLoading) {
    return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4 pt-4 border-t">
      <div>
        <h3 className="text-sm font-medium">{t("settings.householdMembers")}</h3>
        <p className="text-xs text-muted-foreground">{t("settings.householdMembersDesc")}</p>
      </div>

      <div className="rounded-md border">
        {members?.map((member) => {
          const isMe = member.user_id === user?.id;
          const displayName = getFullName(member.profile) || getFirstName(member.profile) || member.profile?.display_name || "Unknown User";

          return (
            <div key={member.id} className="flex items-center justify-between p-4 border-b last:border-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-medium text-sm">
                    {displayName.substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {displayName} {isMe && <span className="text-xs text-muted-foreground font-normal">({t("accounts.you")})</span>}
                    </p>
                    {member.role === 'owner' && (
                      <Shield className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Joined {format(new Date(member.joined_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>

              {/* Owner removing other members */}
              {isOwner && !isMe && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <UserMinus className="h-4 w-4 mr-2" />
                      {t("settings.removeMember")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("settings.removeMemberConfirm")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("settings.removeMemberDesc")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleRemove(member.user_id)}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        {removingId === member.user_id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t("settings.removeMember")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Member leaving the household */}
              {isMe && !isOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <LogOut className="h-4 w-4 mr-2" />
                      {t("settings.leaveHousehold")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("settings.leaveHouseholdConfirm")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("settings.leaveHouseholdDesc")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleLeave}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        {leaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t("settings.leaveHousehold")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

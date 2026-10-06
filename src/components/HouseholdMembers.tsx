import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserMinus, Shield } from "lucide-react";
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

interface HouseholdMembersProps {
  householdId: string;
}

export default function HouseholdMembers({ householdId }: HouseholdMembersProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [removingId, setRemovingId] = useState<string | null>(null);

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
        .select("id, display_name")
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
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", householdId)
      .eq("user_id", userId);
    
    setRemovingId(null);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Member removed successfully");
      queryClient.invalidateQueries({ queryKey: ["household-members"] });
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
        <h3 className="text-sm font-medium">Household Members</h3>
        <p className="text-xs text-muted-foreground">People who have access to this ledger.</p>
      </div>

      <div className="rounded-md border">
        {members?.map((member) => {
          const isMe = member.user_id === user?.id;
          const displayName = member.profile?.display_name || "Unknown User";

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
                      {displayName} {isMe && <span className="text-xs text-muted-foreground font-normal">(You)</span>}
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

              {isOwner && !isMe && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <UserMinus className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove member?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove {displayName} from your household? They will lose access to all shared accounts and transactions.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleRemove(member.user_id)}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        {removingId === member.user_id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Remove
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

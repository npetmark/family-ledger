import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CategoriesPage from "./CategoriesPage";
import { useQuery } from "@tanstack/react-query";
import HouseholdMembers from "@/components/HouseholdMembers";

export default function SettingsPage() {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch household info
  const { data: householdInfo } = useQuery({
    queryKey: ["household-info"],
    queryFn: async () => {
      const { data: members, error: memberErr } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user?.id)
        .single();
      if (memberErr || !members) return null;

      const { data: household, error: hErr } = await supabase
        .from("households")
        .select("*")
        .eq("id", members.household_id)
        .single();
      
      if (hErr) throw hErr;
      return household;
    },
    enabled: !!user,
  });

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc("join_household", { p_invite_code: inviteCode });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Joined household successfully!");
      setInviteCode("");
      window.location.reload();
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account, household, and preferences.</p>
      </div>

      <Tabs defaultValue="household" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="household">Household</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="household" className="mt-6 space-y-6">
          
          <Card>
            <CardHeader>
              <CardTitle>Household Settings</CardTitle>
              <CardDescription>Manage your family ledger access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Your Invite Code</h3>
                {householdInfo?.invite_code ? (
                  <div className="flex items-center gap-2">
                    <code className="px-3 py-2 rounded-md bg-muted text-lg font-mono tracking-wider">
                      {householdInfo.invite_code}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => {
                      navigator.clipboard.writeText(householdInfo.invite_code);
                      toast.success("Copied to clipboard!");
                    }}>
                      Copy
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No invite code generated yet.</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Share this code with family members so they can join your ledger.
                </p>
              </div>

              <div className="pt-4 border-t">
                <h3 className="text-sm font-medium mb-3">Join a Household</h3>
                <form onSubmit={handleJoin} className="flex gap-2 max-w-sm">
                  <Input 
                    placeholder="Enter Invite Code" 
                    value={inviteCode} 
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                  />
                  <Button type="submit" disabled={loading || !inviteCode}>
                    Join
                  </Button>
                </form>
              </div>

              {householdInfo && <HouseholdMembers householdId={householdInfo.id} />}

            </CardContent>
          </Card>
          
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <CategoriesPage isEmbedded={true} />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

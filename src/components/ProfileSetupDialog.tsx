import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile } from "@/hooks/queries/useProfile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Blocking dialog shown after login when the user has no display name yet.
 * It cannot be dismissed until a name is saved.
 */
export function ProfileSetupDialog() {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading, isError } = useProfile();
  const updateProfile = useUpdateProfile();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const needsSetup = !!user && !isLoading && !isError && !profile?.first_name?.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = firstName.trim();
    if (!first) return;
    try {
      await updateProfile.mutateAsync({ first_name: first, last_name: lastName.trim() });
      toast.success(`Welcome, ${first}!`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save your name");
    }
  };

  return (
    <Dialog open={needsSetup}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Complete your profile</DialogTitle>
            <DialogDescription>
              Tell us what to call you. Your name is shown to household members and on your personal accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="setup-first-name">First name</Label>
              <Input
                id="setup-first-name"
                autoFocus
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={40}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-last-name">Last name</Label>
              <Input
                id="setup-last-name"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={40}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={signOut}>
              Sign out
            </Button>
            <Button id="setup-save" type="submit" disabled={!firstName.trim() || updateProfile.isPending}>
              {updateProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

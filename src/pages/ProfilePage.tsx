import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile, getFullName, getInitials } from "@/hooks/queries/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
    }
  }, [profile]);

  const label = getFullName(profile) || user?.email || "Account";
  const nameChanged =
    firstName.trim() !== (profile?.first_name ?? "").trim() ||
    lastName.trim() !== (profile?.last_name ?? "").trim();

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = firstName.trim();
    if (!first) {
      toast.error(t("common.error"));
      return;
    }
    try {
      await updateProfile.mutateAsync({ first_name: first, last_name: lastName.trim() });
      toast.success(t("common.success"));
    } catch (err: any) {
      toast.error(err.message ?? t("common.error"));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("auth.passwordsDoNotMatch"));
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("common.success"));
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
            {getInitials(label, profile)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{label}</h1>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.personalDetails")}</CardTitle>
          <CardDescription>{t("profile.personalDetailsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <form onSubmit={handleSaveDetails} className="space-y-4 max-w-md">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-first-name">{t("profile.firstName")}</Label>
                  <Input
                    id="profile-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    maxLength={40}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-last-name">{t("profile.lastName")}</Label>
                  <Input
                    id="profile-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    maxLength={40}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">{t("profile.email")}</Label>
                <Input id="profile-email" value={user?.email ?? ""} disabled />
              </div>
              <Button
                id="profile-save-details"
                type="submit"
                disabled={!nameChanged || !firstName.trim() || updateProfile.isPending}
              >
                {updateProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("profile.saveChanges")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.changePassword")}</CardTitle>
          <CardDescription>{t("profile.changePasswordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="profile-new-password">{t("profile.newPassword")}</Label>
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-confirm-password">{t("profile.confirmNewPassword")}</Label>
              <Input
                id="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              id="profile-save-password"
              type="submit"
              variant="outline"
              disabled={!newPassword || !confirmPassword || savingPassword}
            >
              {savingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("profile.updatePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("profile.signOut")}</p>
            <p className="text-xs text-muted-foreground">{t("profile.endSession")}</p>
          </div>
          <Button id="profile-sign-out" variant="destructive" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            {t("profile.signOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

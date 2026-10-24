import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Languages, Check } from "lucide-react";
import CategoriesPage from "./CategoriesPage";
import { useQuery } from "@tanstack/react-query";
import HouseholdMembers from "@/components/HouseholdMembers";
import { useLanguage, Language } from "@/lib/i18n";

export default function SettingsPage() {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch household info
  const { data: householdInfo } = useQuery({
    queryKey: ["household-info", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: memberRows, error: memberErr } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false })
        .limit(1);
      const members = memberRows?.[0];
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
      toast.success(t("common.success"));
      setInviteCode("");
      window.location.reload();
    }
    setLoading(false);
  };

  const handleLanguageChange = async (newLang: Language) => {
    if (newLang === language) return;
    await setLanguage(newLang);
    toast.success(newLang === "bg" ? "Езикът беше сменен на Български" : "Language changed to English (UK)");
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      <Tabs defaultValue="preferences" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:w-[480px]">
          <TabsTrigger value="preferences">{t("settings.preferencesTab")}</TabsTrigger>
          <TabsTrigger value="household">{t("settings.householdTab")}</TabsTrigger>
          <TabsTrigger value="categories">{t("settings.categoriesTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="preferences" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Languages className="h-5 w-5 text-primary" />
                <CardTitle>{t("settings.language")}</CardTitle>
              </div>
              <CardDescription>{t("settings.languageDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={language}
                onValueChange={(val) => handleLanguageChange(val as Language)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                <div>
                  <Label
                    htmlFor="lang-en"
                    className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all hover:bg-muted/50 ${
                      language === "en" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="en" id="lang-en" />
                      <div>
                        <p className="font-medium text-sm">English (UK)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">United Kingdom standard</p>
                      </div>
                    </div>
                    {language === "en" && <Check className="h-4 w-4 text-primary" />}
                  </Label>
                </div>

                <div>
                  <Label
                    htmlFor="lang-bg"
                    className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all hover:bg-muted/50 ${
                      language === "bg" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="bg" id="lang-bg" />
                      <div>
                        <p className="font-medium text-sm">Български</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Bulgarian (България)</p>
                      </div>
                    </div>
                    {language === "bg" && <Check className="h-4 w-4 text-primary" />}
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="household" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.householdSettings")}</CardTitle>
              <CardDescription>{t("settings.householdDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t("settings.inviteCode")}</h3>
                {householdInfo?.invite_code ? (
                  <div className="flex items-center gap-2">
                    <code className="px-3 py-2 rounded-md bg-muted text-lg font-mono tracking-wider">
                      {householdInfo.invite_code}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(householdInfo.invite_code);
                        toast.success(t("common.copied"));
                      }}
                    >
                      {t("common.copy")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("common.none")}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{t("settings.shareCode")}</p>
              </div>

              <div className="pt-4 border-t">
                <h3 className="text-sm font-medium mb-3">{t("settings.joinHousehold")}</h3>
                <form onSubmit={handleJoin} className="flex gap-2 max-w-sm">
                  <Input 
                    placeholder={t("settings.enterInviteCode")} 
                    value={inviteCode} 
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                  />
                  <Button type="submit" disabled={loading || !inviteCode}>
                    {t("settings.join")}
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

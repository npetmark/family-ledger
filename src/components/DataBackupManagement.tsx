import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { useHouseholdMembers } from "@/hooks/queries/useHouseholdMembers";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileSpreadsheet,
  Download,
  Upload,
  ShieldCheck,
  Lock,
  KeyRound,
  AlertTriangle,
  HelpCircle,
  Loader2,
  CheckCircle2,
  Check,
  Database,
  User,
  Users,
} from "lucide-react";
import { getFirstName } from "@/hooks/queries/useProfile";
import { exportTransactionsToCsv } from "@/lib/csvExport";
import {
  downloadEncryptedBackup,
  decryptBackup,
  restoreHouseholdBackup,
  HouseholdBackup,
} from "@/lib/backup";
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from "date-fns";

export default function DataBackupManagement({ householdId }: { householdId: string }) {
  const { user } = useAuth();
  const { t, translateCategory } = useLanguage();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(user?.id);
  const { data: householdInfo } = useHouseholdMembers(user?.id);

  const isOwner = (householdInfo as any)?.myRole === "owner" || (householdInfo as any)?.role === "owner";

  // Account permissions:
  // Owner can export all accounts.
  // Regular member can only export their own accounts (owner_user_id === user.id) or shared accounts (owner_user_id === null).
  const selectableAccounts = useMemo(() => {
    if (isOwner) return accounts;
    return accounts.filter(
      (a: any) => a.owner_user_id === null || a.owner_user_id === user?.id
    );
  }, [accounts, isOwner, user?.id]);

  // CSV Export state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [dateRangePreset, setDateRangePreset] = useState<string>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const initializedHouseholdRef = useRef<string | null>(null);

  // Initialize selected accounts once loaded per household
  useEffect(() => {
    if (selectableAccounts.length > 0 && initializedHouseholdRef.current !== householdId) {
      initializedHouseholdRef.current = householdId;
      setSelectedAccountIds(selectableAccounts.map((a: any) => a.id));
    }
  }, [selectableAccounts, householdId]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedAccountIds(selectableAccounts.map((a: any) => a.id));
  };

  const handleDeselectAll = () => {
    setSelectedAccountIds([]);
  };

  // Compute date range
  const computedDateRange = useMemo(() => {
    const now = new Date();
    switch (dateRangePreset) {
      case "this_month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last_month": {
        const lastM = subMonths(now, 1);
        return { from: startOfMonth(lastM), to: endOfMonth(lastM) };
      }
      case "this_year":
        return { from: startOfYear(now), to: endOfYear(now) };
      case "last_year": {
        const lastY = subYears(now, 1);
        return { from: startOfYear(lastY), to: endOfYear(lastY) };
      }
      case "custom":
        return {
          from: customFrom ? new Date(customFrom + "T00:00:00") : undefined,
          to: customTo ? new Date(customTo + "T23:59:59") : undefined,
        };
      default:
        return undefined;
    }
  }, [dateRangePreset, customFrom, customTo]);

  const handleExportCsv = async () => {
    if (selectedAccountIds.length === 0) {
      toast.error(t("settings.noAccountsSelected"));
      return;
    }

    setIsExportingCsv(true);
    try {
      const result = await exportTransactionsToCsv({
        accountIds: selectedAccountIds,
        dateRange: computedDateRange,
        accounts,
        householdMembers: householdInfo?.members,
        t,
        translateCategory,
      });

      toast.success(
        t("settings.exportSuccess") + ` (${result.count} ${result.filename})`
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to export CSV");
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Backup State
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupConfirmPassword, setBackupConfirmPassword] = useState("");
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  const handleCreateBackup = async () => {
    if (!backupPassword || backupPassword.length < 4) {
      toast.error(t("settings.passwordTooShort"));
      return;
    }
    if (backupPassword !== backupConfirmPassword) {
      toast.error(t("settings.passwordMismatch"));
      return;
    }

    setIsCreatingBackup(true);
    try {
      await downloadEncryptedBackup(householdId, backupPassword);
      toast.success(t("settings.backupSuccess"));
      setBackupDialogOpen(false);
      setBackupPassword("");
      setBackupConfirmPassword("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create backup");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Restore State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [restorePasswordOpen, setRestorePasswordOpen] = useState(false);
  const [restorePassword, setRestorePassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedBackup, setDecryptedBackup] = useState<HouseholdBackup | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedBackupFile(file);
      setRestorePassword("");
      setRestorePasswordOpen(true);
    }
    // reset input value so re-selecting the same file works
    e.target.value = "";
  };

  const handleDecryptAndInspect = async () => {
    if (!selectedBackupFile || !restorePassword) return;

    setIsDecrypting(true);
    try {
      const fileText = await selectedBackupFile.text();
      const backup = await decryptBackup(fileText, restorePassword);
      setDecryptedBackup(backup);
      setRestorePasswordOpen(false);
      setRestoreConfirmOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Decryption failed. Please check your password.");
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!decryptedBackup || !user) return;

    setIsRestoring(true);
    try {
      await restoreHouseholdBackup(decryptedBackup, householdId, user.id);
      toast.success(t("settings.restoreSuccess"));

      // Invalidate all react-query caches
      await queryClient.invalidateQueries();

      setRestoreConfirmOpen(false);
      setDecryptedBackup(null);
      setSelectedBackupFile(null);
      setRestorePassword("");
    } catch (e: any) {
      toast.error(e?.message || "Restore failed");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. CSV EXPORT CARD */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <CardTitle>{t("settings.csvExportTitle")}</CardTitle>
            </div>
            {isOwner && (
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                {t("settings.ownerBadge")}
              </Badge>
            )}
          </div>
          <CardDescription>{t("settings.csvExportDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isOwner && (
            <Alert className="bg-muted/40 border-muted">
              <AlertDescription className="text-xs text-muted-foreground">
                {t("settings.memberExportNotice")}
              </AlertDescription>
            </Alert>
          )}

          {/* Account Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{t("settings.selectAccounts")}</Label>
              <div className="flex items-center gap-2 text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleSelectAll}
                  disabled={selectedAccountIds.length === selectableAccounts.length}
                >
                  {t("settings.selectAll")}
                </Button>
                <span className="text-muted-foreground">·</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleDeselectAll}
                  disabled={selectedAccountIds.length === 0}
                >
                  {t("settings.deselectAll")}
                </Button>
              </div>
            </div>

            {accountsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading accounts...</span>
              </div>
            ) : selectableAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No accounts available for export.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {selectableAccounts.map((acc: any) => {
                  const isChecked = selectedAccountIds.includes(acc.id);
                  const isShared = acc.owner_user_id === null;
                  const isMine = acc.owner_user_id === user?.id;
                  const ownerMember = (householdInfo?.members || []).find((m: any) => m.user_id === acc.owner_user_id);
                  const ownerFirstName = getFirstName(ownerMember?.profile) || ownerMember?.profile?.display_name;
                  const ownerLabel = isMine
                    ? (ownerFirstName ? `${ownerFirstName} (${t("accounts.you")})` : t("accounts.you"))
                    : (ownerFirstName || t("accounts.personal"));

                  return (
                    <div
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-sm cursor-pointer transition-all select-none ${
                        isChecked
                          ? "bg-primary/5 border-primary/50 text-foreground"
                          : "bg-card border-border hover:bg-muted/30"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleAccount(acc.id)}
                        id={`csv-acc-${acc.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="font-medium truncate text-xs">{acc.name}</p>
                          {isShared ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 flex items-center gap-1 font-medium">
                              <Users className="h-2.5 w-2.5" />
                              {t("accounts.shared")}
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1 font-medium ${
                                isMine ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <User className="h-2.5 w-2.5" />
                              {ownerLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {acc.currency || "EUR"} · {isShared ? t("accounts.shared") : `${t("accounts.personal")} (${ownerLabel})`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Date Range Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t("settings.dateRange")}</Label>
              <Select value={dateRangePreset} onValueChange={setDateRangePreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("settings.allTime")}</SelectItem>
                  <SelectItem value="this_month">{t("settings.thisMonth")}</SelectItem>
                  <SelectItem value="last_month">{t("settings.lastMonth")}</SelectItem>
                  <SelectItem value="this_year">{t("settings.thisYear")}</SelectItem>
                  <SelectItem value="last_year">{t("settings.lastYear")}</SelectItem>
                  <SelectItem value="custom">{t("settings.customRange")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRangePreset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("settings.startDate")}</Label>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("settings.endDate")}</Label>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              onClick={handleExportCsv}
              disabled={isExportingCsv || selectedAccountIds.length === 0}
              className="gap-2"
            >
              {isExportingCsv ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isExportingCsv ? t("settings.exporting") : t("settings.exportCsvButton")}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. ENCRYPTED BACKUP CARD */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{t("settings.backupTitle")}</CardTitle>
          </div>
          <CardDescription>{t("settings.backupDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-muted/30 border border-border/60">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">AES-GCM 256-bit Encryption</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                Your data is encrypted directly on your device before download. Only someone with your secret password can decrypt and restore it.
              </p>
            </div>

            <Button
              onClick={() => {
                setBackupPassword("");
                setBackupConfirmPassword("");
                setBackupDialogOpen(true);
              }}
              className="gap-2 shrink-0"
            >
              <Download className="h-4 w-4" />
              <span>{t("settings.createBackupButton")}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. RESTORE DATABASE CARD */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>{t("settings.restoreTitle")}</CardTitle>
          </div>
          <CardDescription>{t("settings.restoreDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-muted/30 border border-border/60">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Disaster Recovery Restore</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                Upload your encrypted backup file to restore all your household accounts, transactions, and categories directly within the app.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".flbackup,.json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 shrink-0"
              >
                <Upload className="h-4 w-4" />
                <span>{t("settings.selectBackupFile")}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG: CREATE BACKUP PASSWORD */}
      <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <span>{t("settings.backupPasswordPrompt")}</span>
            </DialogTitle>
            <DialogDescription>{t("settings.backupPasswordDesc")}</DialogDescription>
          </DialogHeader>

          {/* CRITICAL WARNING / TOOLTIP ALERT REQUIRED BY USER */}
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 text-destructive dark:border-destructive/40">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="ml-2">
              <AlertTitle className="text-xs font-semibold">Important Security Notice</AlertTitle>
              <AlertDescription className="text-xs mt-0.5 font-normal leading-relaxed">
                {t("settings.backupPasswordTooltip")}
              </AlertDescription>
            </div>
          </Alert>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="backup-pw" className="text-xs font-medium">
                  {t("settings.passwordLabel")}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      {t("settings.backupPasswordTooltip")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="backup-pw"
                type="password"
                placeholder="••••••••"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="backup-confirm-pw" className="text-xs font-medium">
                {t("settings.confirmPasswordLabel")}
              </Label>
              <Input
                id="backup-confirm-pw"
                type="password"
                placeholder="••••••••"
                value={backupConfirmPassword}
                onChange={(e) => setBackupConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setBackupDialogOpen(false)}
              disabled={isCreatingBackup}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBackup}
              disabled={
                isCreatingBackup ||
                !backupPassword ||
                backupPassword.length < 4 ||
                backupPassword !== backupConfirmPassword
              }
              className="gap-2"
            >
              {isCreatingBackup ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isCreatingBackup ? t("settings.generatingBackup") : t("settings.downloadBackup")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: RESTORE PASSWORD ENTRY */}
      <Dialog open={restorePasswordOpen} onOpenChange={setRestorePasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <span>{t("settings.restorePasswordPrompt")}</span>
            </DialogTitle>
            <DialogDescription>{t("settings.restorePasswordDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-xs">
              <span className="text-muted-foreground">Selected File: </span>
              <span className="font-mono font-medium">{selectedBackupFile?.name}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="restore-pw" className="text-xs font-medium">
                {t("settings.passwordLabel")}
              </Label>
              <Input
                id="restore-pw"
                type="password"
                placeholder="••••••••"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && restorePassword && !isDecrypting) {
                    handleDecryptAndInspect();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setRestorePasswordOpen(false);
                setSelectedBackupFile(null);
              }}
              disabled={isDecrypting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDecryptAndInspect}
              disabled={isDecrypting || !restorePassword}
              className="gap-2"
            >
              {isDecrypting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              <span>{isDecrypting ? t("settings.decrypting") : t("settings.decryptAndInspect")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: CONFIRM RESTORE REPLACE */}
      <Dialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>{t("settings.restoreConfirmTitle")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("settings.restoreWarning")}
            </DialogDescription>
          </DialogHeader>

          {decryptedBackup && (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-xs flex justify-between items-center">
                <span className="text-muted-foreground">{t("settings.backupCreatedAt")}:</span>
                <span className="font-mono-numbers font-medium">
                  {new Date(decryptedBackup.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold">{t("settings.backupContents")}:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono-numbers">
                  <div className="p-2 rounded bg-muted/30 border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Accounts</span>
                    <span className="font-bold text-sm">{decryptedBackup.data.accounts?.length || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Transactions</span>
                    <span className="font-bold text-sm">{decryptedBackup.data.transactions?.length || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Categories</span>
                    <span className="font-bold text-sm">
                      {(decryptedBackup.data.main_categories?.length || 0) +
                        (decryptedBackup.data.subcategories?.length || 0)}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Budgets</span>
                    <span className="font-bold text-sm">{decryptedBackup.data.budgets?.length || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Shopping Items</span>
                    <span className="font-bold text-sm">{decryptedBackup.data.shopping_items?.length || 0}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Templates & Rec</span>
                    <span className="font-bold text-sm">
                      {(decryptedBackup.data.recurring_transactions?.length || 0) +
                        (decryptedBackup.data.transaction_templates?.length || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setRestoreConfirmOpen(false);
                setDecryptedBackup(null);
                setSelectedBackupFile(null);
              }}
              disabled={isRestoring}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleExecuteRestore}
              disabled={isRestoring}
              className="gap-2"
            >
              {isRestoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>{isRestoring ? t("settings.restoring") : t("settings.restoreNow")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  requestNotificationPermission,
  syncDeviceTokenIfPermitted,
  isNotificationSupported,
  type NotificationSetupResult,
} from "@/lib/firebase";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function NotificationBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set when permission is granted but registering this device failed, so the user can retry.
  const [setupError, setSetupError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isNotificationSupported()) return;

    // Only show the prompt banner if permission is 'default' (not yet asked)
    if (Notification.permission === "default") {
      // Small delay so it doesn't pop up instantly on first load
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }

    if (Notification.permission === "granted") {
      // Permission may have been granted via browser settings or a previous attempt that failed
      // after the prompt. Silently (re)register this device so it actually receives pushes.
      let cancelled = false;
      syncDeviceTokenIfPermitted().then((result) => {
        if (cancelled || !result || result.status !== "error") return;
        setSetupError(result.message);
        setShowBanner(true);
      });
      return () => {
        cancelled = true;
      };
    }
  }, []);

  const reportResult = (result: NotificationSetupResult) => {
    switch (result.status) {
      case "granted":
        toast({
          title: "Notifications Enabled",
          description: "You'll now receive alerts when your household adds transactions.",
        });
        setSetupError(null);
        setShowBanner(false);
        break;
      case "denied":
        toast({
          title: "Permission Denied",
          description: "You can enable notifications later in your browser settings.",
          variant: "destructive",
        });
        setShowBanner(false);
        break;
      case "unsupported":
        toast({
          title: "Not Supported",
          description: "This browser doesn't support push notifications. Try Chrome.",
          variant: "destructive",
        });
        setShowBanner(false);
        break;
      case "error":
        toast({
          title: "Couldn't enable notifications",
          description: result.message,
          variant: "destructive",
        });
        // Keep the banner visible so the user can retry.
        setSetupError(result.message);
        setShowBanner(true);
        break;
    }
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      reportResult(await requestNotificationPermission());
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/20 text-foreground px-4 py-3 flex items-center justify-between gap-3 sm:px-6 lg:px-8">
      <div className="flex items-center space-x-3 min-w-0">
        <div className="bg-primary/20 p-2 rounded-full shrink-0">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {setupError ? "Notifications not set up" : "Enable Notifications"}
          </p>
          <p className="text-xs text-muted-foreground break-words">
            {setupError
              ? `This device couldn't be registered: ${setupError}`
              : "Get notified when a family member adds a transaction."}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2 shrink-0">
        <Button size="sm" onClick={handleEnable} disabled={busy}>
          {busy ? "Enabling…" : setupError ? "Retry" : "Enable"}
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

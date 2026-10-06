import { useState, useEffect } from "react";
import { requestNotificationPermission } from "@/lib/firebase";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function NotificationBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Only show if notifications are supported and permission is 'default' (not yet asked)
    if ("Notification" in window && Notification.permission === "default") {
      // Small delay so it doesn't pop up instantly on first load
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleEnable = async () => {
    const token = await requestNotificationPermission();
    if (token) {
      toast({
        title: "Notifications Enabled",
        description: "You'll now receive alerts when your household adds transactions.",
      });
      setShowBanner(false);
    } else {
      toast({
        title: "Permission Denied",
        description: "You can enable notifications later in your browser settings.",
        variant: "destructive",
      });
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/20 text-foreground px-4 py-3 flex items-center justify-between sm:px-6 lg:px-8">
      <div className="flex items-center space-x-3">
        <div className="bg-primary/20 p-2 rounded-full">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Enable Notifications</p>
          <p className="text-xs text-muted-foreground">
            Get notified when a family member adds a transaction.
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Button size="sm" onClick={handleEnable}>
          Enable
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

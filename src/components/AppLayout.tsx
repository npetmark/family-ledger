import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { QuickAddTransaction } from "@/components/QuickAddTransaction";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-hidden">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
            <ThemeToggle />
          </header>
          <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </div>
        </main>
        <QuickAddTransaction />
      </div>
    </SidebarProvider>
  );
}

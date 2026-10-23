import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, ArrowLeftRight, Wallet, Target, Repeat, BarChart3, ShoppingCart, Settings, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useProfile, getDisplayLabel, getFirstName, getInitials } from "@/hooks/queries/useProfile";
import { useLanguage } from "@/lib/i18n";

export function AppSidebar() {
  const { user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: profile } = useProfile();
  const { t } = useLanguage();
  const label = getDisplayLabel(profile, user?.email);

  const navItems = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
    { title: t("nav.transactions"), url: "/transactions", icon: ArrowLeftRight },
    { title: t("nav.analytics"), url: "/analytics", icon: BarChart3 },
    { title: t("nav.accounts"), url: "/accounts", icon: Wallet },
    { title: t("nav.budgets"), url: "/budgets", icon: Target },
    { title: t("nav.recurring"), url: "/recurring", icon: Repeat },
    { title: t("nav.shopping"), url: "/shopping", icon: ShoppingCart },
    { title: t("nav.settings"), url: "/settings", icon: Settings },
  ];

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 px-3 py-4 text-base font-semibold text-foreground">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            {t("nav.familyFinance")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      activeClassName="bg-primary/10 text-primary"
                      onClick={() => { if (isMobile) setOpenMobile(false); }}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-border">
        <NavLink
          id="sidebar-profile-link"
          to="/profile"
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          activeClassName="bg-primary/10"
          onClick={() => { if (isMobile) setOpenMobile(false); }}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(label, profile)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{label}</p>
            {getFirstName(profile) && (
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </NavLink>
      </SidebarFooter>
    </Sidebar>
  );
}

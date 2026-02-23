import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CATEGORY_COLORS: Record<string, string> = {
  Needs: "bg-needs/10 text-needs",
  Wants: "bg-wants/10 text-wants",
  Investments: "bg-investments/10 text-investments",
};

export default function CategoriesPage() {
  const { user } = useAuth();

  const { data: mainCategories = [] } = useQuery({
    queryKey: ["main_categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("main_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("subcategories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-muted-foreground mt-1">50/30/20 budgeting model</p>
      </div>

      <div className="space-y-6">
        {mainCategories.map((cat) => {
          const subs = subcategories.filter((s) => s.main_category_id === cat.id);
          const colorClass = CATEGORY_COLORS[cat.name] || "bg-primary/10 text-primary";
          
          return (
            <Card key={cat.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={colorClass}>
                    {cat.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {cat.name === "Needs" ? "50%" : cat.name === "Wants" ? "30%" : "20%"} target
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {subs.map((sub) => (
                    <div
                      key={sub.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border border-border transition-colors ${
                        sub.is_active ? "bg-card" : "bg-muted/50 opacity-50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <DynamicIcon name={sub.icon} className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{sub.name}</p>
                        {!sub.is_active && <p className="text-xs text-muted-foreground">Inactive</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

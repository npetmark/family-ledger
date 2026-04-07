import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Filter, Check } from "lucide-react";

export type AccountFilterMode = "all-visible" | "custom";

export interface AccountFilterValue {
  mode: AccountFilterMode;
  customAccountIds?: string[];
}

interface AccountFilterProps {
  accounts: Array<{
    id: string;
    name: string;
    icon: string;
    is_visible: boolean;
  }>;
  value: AccountFilterValue;
  onChange: (value: AccountFilterValue) => void;
}

export function getFilteredAccountIds(
  accounts: Array<{ id: string; is_visible: boolean }>,
  filter: AccountFilterValue
): string[] | null {
  switch (filter.mode) {
    case "all-visible":
      return accounts.filter((a) => a.is_visible).map((a) => a.id);
    case "custom":
      return filter.customAccountIds?.length ? filter.customAccountIds : null;
    default:
      return null;
  }
}

export function AccountFilter({ accounts, value, onChange }: AccountFilterProps) {
  const [open, setOpen] = useState(false);

  const visibleAccounts = accounts.filter((a) => a.is_visible);
  const isAllVisible = value.mode === "all-visible";
  const selectedCount = isAllVisible
    ? visibleAccounts.length
    : (value.customAccountIds?.length || 0);

  const label = isAllVisible
    ? "All accounts"
    : selectedCount === accounts.length
      ? "All accounts"
      : `${selectedCount} account${selectedCount !== 1 ? "s" : ""}`;

  const toggleAccount = (accountId: string) => {
    const currentIds = value.mode === "all-visible"
      ? visibleAccounts.map((a) => a.id)
      : (value.customAccountIds || []);

    const isSelected = currentIds.includes(accountId);
    const nextIds = isSelected
      ? currentIds.filter((id) => id !== accountId)
      : [...currentIds, accountId];

    // If all visible are selected, go back to "all-visible" mode
    const allVisibleSelected = visibleAccounts.every((a) => nextIds.includes(a.id))
      && nextIds.length === visibleAccounts.length;

    if (allVisibleSelected) {
      onChange({ mode: "all-visible" });
    } else {
      onChange({ mode: "custom", customAccountIds: nextIds });
    }
  };

  const selectAll = () => {
    onChange({ mode: "all-visible" });
  };

  const isAccountSelected = (accountId: string) => {
    if (value.mode === "all-visible") {
      return accounts.find((a) => a.id === accountId)?.is_visible ?? false;
    }
    return value.customAccountIds?.includes(accountId) ?? false;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="end">
        <div className="p-2 border-b border-border">
          <button
            type="button"
            className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
            onClick={selectAll}
          >
            {isAllVisible ? (
              <span className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-primary" />
                All accounts selected
              </span>
            ) : (
              "Select all"
            )}
          </button>
        </div>
        <div className="max-h-[240px] overflow-y-auto">
          <div className="p-1.5 space-y-0.5">
            {[...accounts].sort((a, b) => (a.is_visible === b.is_visible ? 0 : a.is_visible ? -1 : 1)).map((a) => {
              const checked = isAccountSelected(a.id);
              return (
                <label
                  key={a.id}
                  className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleAccount(a.id)}
                  />
                  <DynamicIcon name={a.icon} className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{a.name}</span>
                  {!a.is_visible && (
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">(hidden)</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

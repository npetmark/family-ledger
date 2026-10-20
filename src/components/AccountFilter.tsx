import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Filter, Check } from "lucide-react";
import { HouseholdMemberOption, formatAccountNameWithOwner } from "./AccountSelectItems";

export type AccountFilterMode = "all-visible" | "custom";

export interface AccountFilterValue {
  mode: AccountFilterMode;
  customAccountIds?: string[];
}

export interface AccountFilterItem {
  id: string;
  name: string;
  icon: string;
  is_visible: boolean;
  owner_user_id?: string | null;
  sort_order?: number;
}

interface AccountFilterProps {
  accounts: AccountFilterItem[];
  value: AccountFilterValue;
  onChange: (value: AccountFilterValue) => void;
  currentUserId?: string;
  householdMembers?: HouseholdMemberOption[];
}

export function getFilteredAccountIds(
  accounts: Array<{ id: string; is_visible: boolean }>,
  filter: AccountFilterValue
): string[] | null {
  switch (filter.mode) {
    case "all-visible":
      return accounts.filter((a) => a.is_visible).map((a) => a.id);
    case "custom":
      return filter.customAccountIds ?? [];
    default:
      return null;
  }
}

export function AccountFilter({
  accounts,
  value,
  onChange,
  currentUserId,
  householdMembers,
}: AccountFilterProps) {
  const [open, setOpen] = useState(false);

  const visibleAccounts = accounts.filter((a) => a.is_visible);
  const isAllVisible = value.mode === "all-visible";
  const selectedCount = isAllVisible
    ? visibleAccounts.length
    : (value.customAccountIds?.length || 0);

  const singleSelectedAccount = useMemo(() => {
    if (!isAllVisible && selectedCount === 1) {
      return accounts.find((a) => value.customAccountIds?.includes(a.id));
    }
    return null;
  }, [isAllVisible, selectedCount, accounts, value.customAccountIds]);

  const singleAccountLabel = useMemo(() => {
    if (!singleSelectedAccount) return null;
    return formatAccountNameWithOwner(singleSelectedAccount, householdMembers);
  }, [singleSelectedAccount, householdMembers]);

  const label = isAllVisible
    ? "All accounts"
    : selectedCount === 0
      ? "No accounts"
      : singleAccountLabel || (selectedCount === accounts.length
        ? "All accounts"
        : `${selectedCount} account${selectedCount !== 1 ? "s" : ""}`);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      // 1. Visible first
      if (a.is_visible !== b.is_visible) {
        return a.is_visible ? -1 : 1;
      }
      // 2. Current user accounts
      const aMine = a.owner_user_id === currentUserId;
      const bMine = b.owner_user_id === currentUserId;
      if (aMine && !bMine) return -1;
      if (!aMine && bMine) return 1;

      // 3. Shared accounts
      const aShared = a.owner_user_id === null;
      const bShared = b.owner_user_id === null;
      if (aShared && !bShared) return -1;
      if (!aShared && bShared) return 1;

      // 4. Sort order
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [accounts, currentUserId]);

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

  const clearAll = () => {
    onChange({ mode: "custom", customAccountIds: [] });
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
        <Button variant="outline" size="sm" className="h-8 gap-1.5 max-w-[200px]">
          <Filter className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="p-2 border-b border-border flex items-center gap-1">
          <button
            type="button"
            className="flex-1 text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
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
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted/50 transition-colors shrink-0"
            onClick={clearAll}
          >
            Clear
          </button>
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          <div className="p-1.5 space-y-0.5">
            {sortedAccounts.map((a) => {
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
                  <span className="text-sm truncate flex-1 min-w-0">
                    {formatAccountNameWithOwner(a, householdMembers)}
                  </span>
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

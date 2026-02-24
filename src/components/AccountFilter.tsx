import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Filter } from "lucide-react";

export type AccountFilterMode = "all-visible" | "specific" | "custom";

export interface AccountFilterValue {
  mode: AccountFilterMode;
  specificAccountId?: string;
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
    case "specific":
      return filter.specificAccountId ? [filter.specificAccountId] : null;
    case "custom":
      return filter.customAccountIds?.length ? filter.customAccountIds : null;
    default:
      return null;
  }
}

export function AccountFilter({ accounts, value, onChange }: AccountFilterProps) {
  const [customOpen, setCustomOpen] = useState(false);

  const label = (() => {
    switch (value.mode) {
      case "all-visible":
        return "All Visible";
      case "specific": {
        const acc = accounts.find((a) => a.id === value.specificAccountId);
        return acc?.name || "Select Account";
      }
      case "custom":
        return `${value.customAccountIds?.length || 0} accounts`;
    }
  })();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value.mode}
        onValueChange={(mode: AccountFilterMode) => {
          if (mode === "all-visible") {
            onChange({ mode });
          } else if (mode === "specific") {
            onChange({ mode, specificAccountId: "" });
          } else {
            onChange({
              mode,
              customAccountIds: accounts.filter((a) => a.is_visible).map((a) => a.id),
            });
          }
        }}
      >
        <SelectTrigger className="w-[140px] h-8">
          <Filter className="h-3.5 w-3.5 mr-1.5 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-visible">All Visible</SelectItem>
          <SelectItem value="specific">Specific Account</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>

      {value.mode === "specific" && (
        <Select
          value={value.specificAccountId || ""}
          onValueChange={(id) => onChange({ ...value, specificAccountId: id })}
        >
          <SelectTrigger className="w-[160px] h-8">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex items-center gap-2">
                  <DynamicIcon name={a.icon} className="h-3.5 w-3.5" />
                  {a.name}
                  {!a.is_visible && (
                    <span className="text-xs text-muted-foreground">(hidden)</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.mode === "custom" && (
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              {label}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Select accounts</p>
              {accounts.map((a) => {
                const checked = value.customAccountIds?.includes(a.id) ?? false;
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-1"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const current = value.customAccountIds || [];
                        const next = c
                          ? [...current, a.id]
                          : current.filter((id) => id !== a.id);
                        onChange({ ...value, customAccountIds: next });
                      }}
                    />
                    <DynamicIcon name={a.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{a.name}</span>
                    {!a.is_visible && (
                      <span className="text-xs text-muted-foreground">(hidden)</span>
                    )}
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

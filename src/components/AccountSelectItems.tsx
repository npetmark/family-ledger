import { SelectGroup, SelectLabel, SelectItem, SelectSeparator } from "@/components/ui/select";
import { DynamicIcon } from "@/components/DynamicIcon";
import { getFirstName } from "@/hooks/queries/useProfile";

export interface AccountOption {
  id: string;
  name: string;
  icon?: string;
  owner_user_id?: string | null;
  sort_order?: number;
  [key: string]: any;
}

export interface HouseholdMemberOption {
  user_id: string;
  profile?: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
  } | null;
  [key: string]: any;
}

export interface CategorizedAccount extends AccountOption {
  ownerName?: string;
}

export function getAccountOwnerName(
  ownerUserId: string | null | undefined,
  currentUserId?: string,
  householdMembers?: HouseholdMemberOption[]
): string | undefined {
  if (!ownerUserId || ownerUserId === currentUserId) return undefined;
  const member = householdMembers?.find((m) => m.user_id === ownerUserId);
  const firstName = getFirstName(member?.profile);
  return firstName || undefined;
}

export function getCategorizedAccounts({
  accounts,
  currentUserId,
  householdMembers,
  excludeAccountId,
  isTransfer = false,
}: {
  accounts: AccountOption[];
  currentUserId?: string;
  householdMembers?: HouseholdMemberOption[];
  excludeAccountId?: string;
  isTransfer?: boolean;
}): {
  ownedAccounts: CategorizedAccount[];
  otherAccounts: CategorizedAccount[];
} {
  const filtered = accounts.filter((a) => !excludeAccountId || a.id !== excludeAccountId);

  // Owned accounts: either owned by current user or shared (owner_user_id === null)
  const ownedAccounts = filtered
    .filter((a) => a.owner_user_id === null || a.owner_user_id === currentUserId)
    .sort((a, b) => {
      if (a.owner_user_id === currentUserId && b.owner_user_id === null) return -1;
      if (a.owner_user_id === null && b.owner_user_id === currentUserId) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  if (!isTransfer) {
    return { ownedAccounts, otherAccounts: [] };
  }

  // Other accounts: owned by other household members
  const otherAccounts = filtered
    .filter((a) => a.owner_user_id !== null && a.owner_user_id !== undefined && a.owner_user_id !== currentUserId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((a) => ({
      ...a,
      ownerName: getAccountOwnerName(a.owner_user_id, currentUserId, householdMembers),
    }));

  return { ownedAccounts, otherAccounts };
}

interface AccountSelectItemsProps {
  accounts: AccountOption[];
  currentUserId?: string;
  householdMembers?: HouseholdMemberOption[];
  excludeAccountId?: string;
  isTransfer?: boolean;
}

export function AccountSelectItems({
  accounts,
  currentUserId,
  householdMembers,
  excludeAccountId,
  isTransfer = false,
}: AccountSelectItemsProps) {
  const { ownedAccounts, otherAccounts } = getCategorizedAccounts({
    accounts,
    currentUserId,
    householdMembers,
    excludeAccountId,
    isTransfer,
  });

  if (isTransfer && otherAccounts.length > 0) {
    return (
      <>
        {ownedAccounts.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground">
              Owned accounts
            </SelectLabel>
            {ownedAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <div className="flex items-center gap-2">
                  <DynamicIcon name={a.icon || "wallet"} className="h-4 w-4" />
                  <span>{a.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {ownedAccounts.length > 0 && <SelectSeparator />}
        <SelectGroup>
          <SelectLabel className="text-xs font-semibold text-muted-foreground">
            Other accounts
          </SelectLabel>
          {otherAccounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <div className="flex items-center gap-2">
                <DynamicIcon name={a.icon || "wallet"} className="h-4 w-4" />
                <span>
                  {a.name}
                  {a.ownerName ? ` (${a.ownerName})` : ""}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </>
    );
  }

  return (
    <>
      {ownedAccounts.map((a) => (
        <SelectItem key={a.id} value={a.id}>
          <div className="flex items-center gap-2">
            <DynamicIcon name={a.icon || "wallet"} className="h-4 w-4" />
            <span>{a.name}</span>
          </div>
        </SelectItem>
      ))}
    </>
  );
}

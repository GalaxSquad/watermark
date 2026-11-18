import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ConsumerGroupTable } from "@/components/consumers/consumer-group-table";
import { SearchInput } from "@/components/shared/search-input";
import { RefreshButton } from "@/components/shared/refresh-button";
import { PageHeader } from "@/components/shared/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { ConsumerGroupState } from "@/types/kafka";

type StateFilter = ConsumerGroupState | "all";

const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: "all", label: "All states" },
  { value: "Stable", label: "Stable" },
  { value: "Rebalancing", label: "Rebalancing" },
  { value: "Empty", label: "Empty" },
  { value: "Dead", label: "Dead" },
  { value: "Unknown", label: "Unknown" },
];

export function ConsumersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [hideEmpty, setHideEmpty] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader title="Consumer Groups" />
      <div className="flex items-center gap-4 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search consumer groups..."
          className="w-80"
        />
        <RefreshButton queryKeys={[["consumer-groups"]]} />
        <Select
          value={stateFilter}
          onValueChange={(v) => setStateFilter(v as StateFilter)}
        >
          <SelectTrigger className="w-40" aria-label="Filter by group state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className={
                stateFilter !== "all"
                  ? "flex items-center gap-2 text-sm text-muted-foreground/50 cursor-not-allowed"
                  : "flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"
              }
            >
              <Checkbox
                checked={hideEmpty}
                disabled={stateFilter !== "all"}
                onCheckedChange={(v) => setHideEmpty(!!v)}
                className="size-4"
              />
              Hide Empty groups
            </label>
          </TooltipTrigger>
          {stateFilter !== "all" && (
            <TooltipContent side="top" className="text-xs">
              Clear the state filter to use Hide Empty groups
            </TooltipContent>
          )}
        </Tooltip>
      </div>
      <ConsumerGroupTable
        onGroupClick={(id) =>
          navigate({ to: "/consumers/$groupId", params: { groupId: id } })
        }
        searchFilter={search}
        stateFilter={stateFilter}
        hideEmpty={hideEmpty && stateFilter === "all"}
      />
    </div>
  );
}

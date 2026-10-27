import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ConsumerGroupTable } from "@/components/consumers/consumer-group-table";
import { SearchInput } from "@/components/shared/search-input";
import { RefreshButton } from "@/components/shared/refresh-button";

export function ConsumersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold uppercase tracking-wider">
        Consumer Groups
      </h1>
      <div className="flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search consumer groups..."
          className="w-80"
        />
        <RefreshButton queryKeys={[["consumer-groups"]]} />
      </div>
      <ConsumerGroupTable
        onGroupClick={(id) =>
          navigate({ to: "/consumers/$groupId", params: { groupId: id } })
        }
        searchFilter={search}
      />
    </div>
  );
}

import { useState } from "react";
import { SearchInput } from "@/components/shared/search-input";
import { cn } from "@/lib/utils";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetSubjects } from "@/lib/wails-client";

interface SubjectListProps {
  selectedSubject: string | null;
  onSelect: (name: string) => void;
}

export function SubjectList({ selectedSubject, onSelect }: SubjectListProps) {
  const [search, setSearch] = useState("");

  const { data: subjects = [] } = useKafkaQuery(
    ["schema-subjects"],
    GetSubjects,
    { refetchInterval: 30_000 },
  );

  const filtered = subjects.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h3 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Subjects ({filtered.length})
        </h3>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter..."
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            {subjects.length === 0
              ? "No subjects registered"
              : "No subjects match filter"}
          </div>
        ) : (
          filtered.map((subject) => (
            <button
              key={subject.name}
              type="button"
              onClick={() => onSelect(subject.name)}
              title={subject.name}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm font-mono truncate transition-colors",
                selectedSubject === subject.name
                  ? "bg-primary/15 text-primary border-l-2 border-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {subject.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

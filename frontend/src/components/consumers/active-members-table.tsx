import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { CopyableText } from "@/components/shared/copyable-text";
import type { ConsumerGroupMember } from "@/types/kafka";

const columns: ColumnDef<ConsumerGroupMember, unknown>[] = [
  {
    accessorKey: "clientId",
    header: "Client ID",
    cell: ({ row }) => (
      <CopyableText
        value={row.original.clientId}
        textClassName="text-foreground font-medium max-w-[320px]"
        copyLabel="Copy Client ID"
      />
    ),
  },
  {
    accessorKey: "host",
    header: "Host IP",
    cell: ({ row }) => (
      <CopyableText
        value={row.original.host}
        textClassName="text-foreground max-w-[240px]"
        copyLabel="Copy Host IP"
      />
    ),
  },
  {
    accessorKey: "assignedPartitions",
    header: "Assigned Partitions",
    cell: ({ row }) => (
      <div className="flex gap-1">
        {row.original.assignedPartitions.map((p) => (
          <span
            key={p}
            className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono rounded"
          >
            {p}
          </span>
        ))}
      </div>
    ),
  },
];

interface ActiveMembersTableProps {
  members: ConsumerGroupMember[];
}

export function ActiveMembersTable({ members }: ActiveMembersTableProps) {
  return (
    <div>
      <h3 className="text-sm font-display font-bold text-foreground mb-3 uppercase tracking-wider">
        Active Members ({members.length})
      </h3>
      <DataTable data={members} columns={columns} />
    </div>
  );
}

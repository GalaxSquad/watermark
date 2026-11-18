import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { cn, formatNumber } from "@/lib/utils";
import type { Partition } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetTopicPartitions } from "@/lib/wails-client";
import { useReadOnly } from "@/hooks/use-read-only";
import { DeleteRecordsDialog, type DeleteMode } from "./delete-records-dialog";

const isIsrMismatch = (p: Partition) => p.isr.length !== p.replicas.length;

function buildColumns(onPurge?: (partition: Partition) => void): ColumnDef<Partition, unknown>[] {
  const base: ColumnDef<Partition, unknown>[] = [
    { accessorKey: "id", header: "Partition", meta: { align: "right" } },
    { accessorKey: "leader", header: "Leader Broker", meta: { align: "right" } },
    {
      accessorKey: "replicas",
      header: "Replicas",
      cell: ({ row }) => row.original.replicas.join(", "),
    },
    {
      accessorKey: "isr",
      header: "ISR",
      cell: ({ row }) => (
        <span className={cn(isIsrMismatch(row.original) && "text-semantic-red font-bold")}>
          {row.original.isr.join(", ")}
        </span>
      ),
    },
    {
      accessorKey: "lowWatermark",
      header: "Low Watermark",
      meta: { align: "right" },
      cell: ({ row }) => formatNumber(row.original.lowWatermark),
    },
    {
      accessorKey: "highWatermark",
      header: "High Watermark",
      meta: { align: "right" },
      cell: ({ row }) => formatNumber(row.original.highWatermark),
    },
  ];

  if (onPurge) {
    base.push({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        const isEmpty = p.lowWatermark === p.highWatermark;
        return (
          <Button
            variant="destructive"
            size="xs"
            onClick={(e) => { e.stopPropagation(); onPurge(p); }}
            disabled={isEmpty}
            title={isEmpty ? "Partition is already empty" : `Purge partition ${p.id}`}
            className="gap-1.5"
          >
            <Icon name="trash" className="size-3" />
            Purge
          </Button>
        );
      },
    });
  }

  return base;
}

interface PartitionsTabProps {
  topicName: string;
}

export function PartitionsTab({ topicName }: PartitionsTabProps) {
  const { data: partitions = [], refetch } = useKafkaQuery(
    ["topic-partitions", topicName],
    () => GetTopicPartitions(topicName),
  );
  const isReadOnly = useReadOnly();
  const [deleteMode, setDeleteMode] = useState<DeleteMode | null>(null);

  const handlePurgePartition = (p: Partition) => {
    setDeleteMode({
      type: "beforeOffset",
      topicName,
      partition: p.id,
      offset: p.highWatermark,
    });
  };

  const columns = buildColumns(isReadOnly ? undefined : handlePurgePartition);

  return (
    <>
      <DataTable
        data={partitions}
        columns={columns}
        highlightRow={(row) =>
          isIsrMismatch(row) ? "bg-semantic-red/10" : undefined
        }
      />
      <DeleteRecordsDialog
        mode={deleteMode}
        onClose={() => setDeleteMode(null)}
        onSuccess={() => { setDeleteMode(null); refetch(); }}
      />
    </>
  );
}

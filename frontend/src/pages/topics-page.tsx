import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "sonner";
import { SearchInput } from "@/components/shared/search-input";
import { RefreshButton } from "@/components/shared/refresh-button";
import { PageHeader } from "@/components/shared/page-header";
import { TopicListTable } from "@/components/topics/topic-list-table";
import { CreateTopicModal } from "@/components/topics/create-topic-modal";
import { GetTopic, GetTopicConfigs } from "@/lib/wails-client";
import { useReadOnly } from "@/hooks/use-read-only";

export function TopicsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // Internal topics (__consumer_offsets, …) are hidden by default —
  // most users open this page to find their own topics.
  const [hideInternal, setHideInternal] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const isReadOnly = useReadOnly();
  const [cloneSource, setCloneSource] = useState<{
    name: string;
    partitions: number;
    replicationFactor: number;
    configs: Record<string, string>;
  } | null>(null);

  const handleCloneTopic = async (topicName: string) => {
    try {
      const [topic, configs] = await Promise.all([
        GetTopic(topicName),
        GetTopicConfigs(topicName),
      ]);

      // Filter to overridden configs only
      const overridden: Record<string, string> = {};
      configs
        .filter((c) => c.isOverridden)
        .forEach((c) => {
          overridden[c.name] = c.value;
        });

      setCloneSource({
        name: topicName,
        partitions: topic.partitions,
        replicationFactor: topic.replicas,
        configs: overridden,
      });
    } catch (err) {
      toast.error(
        `Failed to clone topic: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleCloseCreateModal = () => {
    setCreateOpen(false);
    setCloneSource(null);
  };

  const isCreateModalOpen = createOpen || !!cloneSource;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Topics"
        actions={
          !isReadOnly ? (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="gap-1.5 shrink-0"
            >
              <Icon name="plus" className="size-3.5" />
              Create Topic
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search topics..."
          className="w-80"
        />
        <RefreshButton queryKeys={[["topics"]]} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox
            checked={hideInternal}
            onCheckedChange={(v) => setHideInternal(!!v)}
            className="size-4"
          />
          Hide Internal Topics
        </label>
      </div>

      <TopicListTable
        onTopicClick={(name) =>
          navigate({ to: "/topics/$topicId", params: { topicId: name } })
        }
        onCloneTopic={handleCloneTopic}
        searchFilter={search}
        hideInternal={hideInternal}
      />

      <CreateTopicModal
        key={cloneSource ? `clone-${cloneSource.name}` : "create"}
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        cloneFrom={cloneSource ?? undefined}
      />
    </div>
  );
}

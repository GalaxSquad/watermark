import { useState } from "react";
import { SubjectList } from "@/components/schemas/subject-list";
import { SchemaViewer } from "@/components/schemas/schema-viewer";
import { VersionHistory } from "@/components/schemas/version-history";
import { RefreshButton } from "@/components/shared/refresh-button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetSubjects } from "@/lib/wails-client";
import { useSettingsStore } from "@/store/settings";

export function SchemasPage() {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const { data: subjects = [], isLoading } = useKafkaQuery(
    ["schema-subjects"],
    GetSubjects,
    { refetchInterval: 30_000 },
  );

  return (
    <div className="space-y-6">
      {/* Page title matches the sidebar label ("Schemas"), not the
          backend service name ("Schema Registry"). */}
      <PageHeader
        title="Schemas"
        actions={<RefreshButton queryKeys={[["schema-subjects"]]} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-200px)]">
        <div className="glass-panel overflow-hidden">
          <SubjectList
            selectedSubject={selectedSubject}
            onSelect={setSelectedSubject}
          />
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="glass-panel flex-1 overflow-hidden">
            {selectedSubject ? (
              <SchemaViewer subjectName={selectedSubject} />
            ) : !isLoading && subjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <EmptyState
                  icon="file-code"
                  title="No Schema Subjects Available"
                  description={
                    <>
                      Verify that a <span className="text-foreground font-medium">Schema Registry URL</span> is configured for this cluster in Settings, or publish a schema using Avro/Protobuf/JSON Schema serializers (<span className="font-mono">TopicNameStrategy</span>).
                    </>
                  }
                  action={
                    <Button type="button" size="sm" onClick={() => openSettings()} className="gap-1.5">
                      <Icon name="settings" className="size-3.5" />
                      Configure Schema Registry
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <EmptyState
                  icon="file-code"
                  title="Select a subject"
                  description={`Choose one of the ${subjects.length} subject${subjects.length !== 1 ? "s" : ""} on the left to inspect its schema definition and version history.`}
                />
              </div>
            )}
          </div>

          {selectedSubject && (
            <VersionHistory subjectName={selectedSubject} />
          )}
        </div>
      </div>
    </div>
  );
}

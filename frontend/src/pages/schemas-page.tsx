import { useState } from "react";
import { SubjectList } from "@/components/schemas/subject-list";
import { SchemaViewer } from "@/components/schemas/schema-viewer";
import { VersionHistory } from "@/components/schemas/version-history";
import { RefreshButton } from "@/components/shared/refresh-button";
import { Icon } from "@/components/ui/icon";
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold uppercase tracking-wider min-w-0">
          Schema Registry
        </h1>
        <div className="shrink-0">
          <RefreshButton queryKeys={[["schema-subjects"]]} />
        </div>
      </div>

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
              <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4">
                <div className="size-12 rounded-xl bg-secondary border border-border flex items-center justify-center">
                  <Icon name="file-code" tone="muted" className="size-6" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h2 className="text-sm font-semibold text-foreground">
                    No Schema Subjects Available
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Verify that a <span className="text-foreground font-medium">Schema Registry URL</span> is configured for this cluster in Settings, or publish a schema using Avro/Protobuf/JSON Schema serializers (`TopicNameStrategy`).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openSettings()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Icon name="settings" className="size-3.5" />
                  Configure Schema Registry
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2 text-muted-foreground">
                <Icon name="file-code" tone="muted" className="size-8" />
                <p className="text-sm font-medium text-foreground">Select a subject</p>
                <p className="text-xs text-muted-foreground">
                  Choose one of the {subjects.length} subject{subjects.length !== 1 ? "s" : ""} on the left to inspect its schema definition and version history.
                </p>
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

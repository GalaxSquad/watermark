import { lazy, Suspense, useState, useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { CompatibilityBadge } from "./compatibility-badge";
import type { SchemaType, CompatibilityLevel } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetSchemaVersions, GetCompatibility } from "@/lib/wails-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/store/settings";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

const LANGUAGE_MAP: Record<SchemaType, string> = {
  AVRO: "json",
  JSON: "json",
  PROTOBUF: "protobuf",
};

interface SchemaViewerProps {
  subjectName: string;
}

export function SchemaViewer({ subjectName }: SchemaViewerProps) {
  const { data: versions = [] } = useKafkaQuery(
    ["schema-versions", subjectName],
    () => GetSchemaVersions(subjectName),
    { refetchInterval: 30_000 },
  );

  const { data: compatibility } = useKafkaQuery(
    ["schema-compatibility", subjectName],
    () => GetCompatibility(subjectName),
    { refetchInterval: 60_000 },
  );

  const [selectedVersion, setSelectedVersion] = useState(versions[0]?.version ?? 1);
  const { resolvedTheme } = useSettingsStore();

  // Reset version selection when subject changes
  useEffect(() => {
    if (versions.length > 0) {
      setSelectedVersion(versions[0].version);
    }
  }, [subjectName, versions]);

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a subject to view its schema
      </div>
    );
  }

  const currentVersion = versions.find((v) => v.version === selectedVersion) ?? versions[0];
  const schemaType = (currentVersion?.type ?? "AVRO") as SchemaType;

  const copySchema = () => {
    navigator.clipboard.writeText(currentVersion.schema);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-display font-bold text-foreground uppercase tracking-wider">
            {subjectName}
          </h3>
          <Select value={String(selectedVersion)} onValueChange={(v) => setSelectedVersion(Number(v))}>
              <SelectTrigger className="h-8 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version} value={String(v.version)}>
                    v{v.version} {v.version === versions[0].version ? "(latest)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          {compatibility && (
            <CompatibilityBadge level={compatibility as CompatibilityLevel} />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">
            {schemaType} | ID: {currentVersion.id}
          </span>
          <Button
            variant="outline"
            size="xs"
            onClick={copySchema}
            className="gap-1 text-xs"
          >
            <Icon name="copy" className="size-3" /> Copy
          </Button>
        </div>
      </div>

      {/* Monaco editor */}
      <div className="flex-1 min-h-[300px]">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading editor...</div>}>
          <MonacoEditor
            height="100%"
            language={LANGUAGE_MAP[schemaType]}
            theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
            value={currentVersion.schema}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              fontFamily: "JetBrains Mono",
              lineNumbers: "on",
              folding: true,
              renderLineHighlight: "none",
              padding: { top: 12 },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { SaveCluster, TestConnection, GetCluster, UpdateReadOnly, DisconnectCluster } from "@/lib/wails-client";
import * as config from "../../../bindings/watermark-01/internal/config/models";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ClusterFormFields } from "./cluster-form-fields";
import { useSettingsStore } from "@/store/settings";

// Back-end connection test statuses returned by the Go service.
type TestConnectionStatus = "unreachable" | "auth_error" | "forbidden" | "ok";

// Full UI state including loading states.
type TestUIState = "idle" | "testing" | TestConnectionStatus;

interface ClusterFormProps {
  /** Cluster ID — pass "new" for creating a new cluster */
  clusterId: string;
  /** Pre-filled name (from list or empty for new) */
  clusterName: string;
  onClose: () => void;
}

export function ClusterForm({ clusterId, clusterName, onClose }: ClusterFormProps) {
  const queryClient = useQueryClient();
  const activeClusterId = useSettingsStore((s) => s.activeClusterId);
  const isNew = clusterId === "new";

  const [form, setForm] = useState({
    name: clusterName || "",
    bootstrapServers: "",
    labelColor: "green",
    securityProtocol: "NONE",
    saslMechanism: "PLAIN",
    username: "",
    password: "",
    readOnly: false,
    schemaRegistryUrl: "",
    schemaRegistryPassword: "",
    awsProfile: "",
    awsRegion: "",
  });

  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<TestUIState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loaded, setLoaded] = useState(isNew);

  // Load existing cluster data for edit mode
  if (!isNew && !loaded) {
    GetCluster(clusterId)
      .then((cluster) => {
        setForm({
          name: cluster.name,
          bootstrapServers: cluster.bootstrapServers,
          labelColor: cluster.color || "green",
          securityProtocol: cluster.securityProtocol || "NONE",
          saslMechanism: cluster.saslMechanism || "PLAIN",
          username: cluster.username || "",
          password: "",
          readOnly: cluster.readOnly,
          schemaRegistryUrl: cluster.schemaRegistryUrl || "",
          schemaRegistryPassword: "",
          awsProfile: cluster.awsProfile || "",
          awsRegion: cluster.awsRegion || "",
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  const handleTestConnection = async () => {
    if (!form.bootstrapServers.trim()) {
      setTestStatus("unreachable");
      setTestMessage("Bootstrap servers required");
      return;
    }
    setTestStatus("testing");
    setTestMessage("");
    try {
      const isAwsMsk = form.securityProtocol === "AWS_MSK_IAM";
      const isNoAuth = form.securityProtocol === "NONE";
      const profile = new config.ClusterProfile({
        bootstrapServers: form.bootstrapServers.trim(),
        securityProtocol: form.securityProtocol,
        saslMechanism: (!isNoAuth && !isAwsMsk) ? form.saslMechanism : "",
        username: (!isNoAuth && !isAwsMsk) ? form.username : "",
        password: (!isNoAuth && !isAwsMsk) ? (form.password || undefined) : undefined,
        awsProfile: isAwsMsk ? form.awsProfile : "",
        awsRegion: isAwsMsk ? form.awsRegion : "",
      });
      // Pass clusterID so backend can fetch saved password in edit mode
      const result = await TestConnection(profile, isNew ? "" : clusterId);
      setTestStatus(result.status as TestConnectionStatus);
      setTestMessage(result.message);
    } catch (err) {
      setTestStatus("unreachable");
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError("Cluster name is required"); return; }
    if (!form.bootstrapServers.trim()) { setSaveError("Bootstrap servers required"); return; }

    setSaving(true);
    setSaveError("");
    try {
      const isAwsMsk = form.securityProtocol === "AWS_MSK_IAM";
      const isNoAuth = form.securityProtocol === "NONE";
      const profile = new config.ClusterProfile({
        id: isNew ? "" : clusterId,
        name: form.name.trim(),
        bootstrapServers: form.bootstrapServers.trim(),
        color: form.labelColor,
        readOnly: form.readOnly,
        securityProtocol: form.securityProtocol,
        saslMechanism: (!isNoAuth && !isAwsMsk) ? form.saslMechanism : "",
        username: (!isNoAuth && !isAwsMsk) ? form.username : "",
        password: (!isNoAuth && !isAwsMsk) ? (form.password || undefined) : undefined,
        awsProfile: isAwsMsk ? form.awsProfile : "",
        awsRegion: isAwsMsk ? form.awsRegion : "",
        schemaRegistryUrl: form.schemaRegistryUrl || undefined,
        schemaRegistryPassword: form.schemaRegistryPassword || undefined,
      });
      await SaveCluster(profile);

      // Sync backend readOnly flag if editing the currently active cluster,
      // or evict pooled warm client if editing an inactive cluster so new credentials take effect
      if (!isNew) {
        if (clusterId === activeClusterId) {
          await UpdateReadOnly(form.readOnly);
        } else {
          await DisconnectCluster(clusterId).catch(() => {});
          await useSettingsStore.getState().refreshPooledClusters();
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["clusters"] });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleFormChange = (updates: Partial<typeof form>) => setForm({ ...form, ...updates });

  return (
    <div className="glass-panel p-5 space-y-4">
      <h4 className="text-sm font-display font-bold text-foreground uppercase tracking-wider">
        {isNew ? <span className="flex items-center gap-1.5"><Icon name="sparkles" className="size-3.5" tone="brand" />New Cluster</span> : `Edit Cluster: ${form.name}`}
      </h4>

      <ClusterFormFields
        form={form}
        onChange={handleFormChange}
        clusterId={clusterId}
        isNew={isNew}
      />

      {/* Test Connection feedback — 4-status visual */}
      {testStatus !== "idle" && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono",
            testStatus === "testing" && "bg-primary/10 text-primary",
            testStatus === "ok" && "bg-status-healthy/10 text-status-healthy",
            testStatus === "auth_error" && "bg-orange-500/10 text-orange-400",
            testStatus === "forbidden" && "bg-amber-500/10 text-amber-400",
            testStatus === "unreachable" && "bg-semantic-red/10 text-semantic-red",
          )}
        >
          {testStatus === "testing" && <Icon name="loader" className="size-3.5 animate-spin" tone="brand" />}
          {testStatus === "ok" && <Icon name="check-circle" className="size-3.5" tone="success" />}
          {testStatus === "auth_error" && <Icon name="shield-x" className="size-3.5" tone="warning" />}
          {testStatus === "forbidden" && <Icon name="shield-alert" className="size-3.5" tone="warning" />}
          {testStatus === "unreachable" && <Icon name="x-circle" className="size-3.5" tone="danger" />}
          <span>{testStatus === "testing" ? "Testing connection..." : testMessage}</span>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono bg-semantic-red/10 text-semantic-red">
          <Icon name="x-circle" className="size-3.5" tone="danger" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-border">
        <button
          onClick={handleTestConnection}
          disabled={testStatus === "testing"}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground bg-secondary rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testStatus === "testing" ? (
            <Icon name="loader" className="size-3.5 animate-spin" tone="brand" />
          ) : (
            <Icon name="zap" className="size-3.5" tone="warning" />
          )}
          Test Connection
        </button>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground bg-secondary rounded-lg border border-border hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving && <Icon name="loader" className="size-3.5 animate-spin" />}
            {isNew ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

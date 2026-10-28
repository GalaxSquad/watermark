/**
 * Centralized Wails backend client.
 * Re-exports all service bindings with typed wrappers for use with useKafkaQuery.
 */

import type { Topic } from "@/types/kafka";
import type { ClusterProfile } from "@/types/config";
import type { TopicAnnotation } from "@/types/annotations";
import type { TopicTemplate } from "@/types/templates";
import type { ClusterAlertConfig } from "@/types/lag-alerts";

// --- Kafka Service ---
import { GetTopic as _GetTopic } from "../../bindings/watermark-01/internal/kafka/kafkaservice";
export {
  Connect,
  Disconnect,
  DisconnectCluster,
  GetPooledClusters,
  IsConnected,
  GetClusterHealth,
  GetBrokers,
  GetDashboardData,
  GetTopics,
  GetTopicPartitions,
  GetTopicConfigs,
  GetTopicConsumers,
  GetTopicACLs,
  CreateTopic,
  DeleteTopic,
  ConsumeMessages,
  ConsumeMessagesFromTimestamp,
  ProduceMessage,
  ProduceMessages,
  DeleteRecordsBefore,
  DeleteRecordsBeforeTimestamp,
  PurgeTopic,
  StartLiveTail,
  StopLiveTail,
  GetConsumerGroups,
  GetConsumerGroupDetail,
  GetAllGroupsLagDetail,
  ResetConsumerGroupOffsets,
  DeleteConsumerGroup,
  ClearCache,
  UpdateReadOnly,
} from "../../bindings/watermark-01/internal/kafka/kafkaservice";

export const GetTopic = (name: string): Promise<Topic> =>
  _GetTopic(name) as Promise<Topic>;

// --- Config Service ---
// NOTE: GetDecryptedPassword intentionally NOT exported — decryption stays server-side only
import {
  GetCluster as _GetCluster,
  DuplicateCluster as _DuplicateCluster,
  TestConnection as _TestConnection,
} from "../../bindings/watermark-01/internal/config/configservice";
export {
  GetClusters,
  SaveCluster,
  DeleteCluster as DeleteClusterProfile,
  GetSettings,
  SaveSettings,
  GetActiveClusterID,
  SetActiveCluster,
  ExportConfig,
  ImportConfig,
  ListAWSProfiles,
  GetSkippedVersion,
  SkipVersion,
} from "../../bindings/watermark-01/internal/config/configservice";

export const GetCluster = (id: string): Promise<ClusterProfile> =>
  _GetCluster(id) as Promise<ClusterProfile>;

export const DuplicateCluster = (id: string): Promise<ClusterProfile> =>
  _DuplicateCluster(id) as Promise<ClusterProfile>;

export const TestConnection = (
  profile: ClusterProfile,
  clusterID: string,
): Promise<NonNullable<Awaited<ReturnType<typeof _TestConnection>>>> =>
  _TestConnection(profile, clusterID) as Promise<
    NonNullable<Awaited<ReturnType<typeof _TestConnection>>>
  >;

// --- Schema Service ---
export {
  GetSubjects,
  GetSchemaVersions,
  GetSchemaVersion,
  GetCompatibility,
  Configure as ConfigureSchemaRegistry,
} from "../../bindings/watermark-01/internal/schema/schemaservice";

// --- Annotation Service ---
import { GetAnnotations as _GetAnnotations } from "../../bindings/watermark-01/internal/annotations/annotationservice";
export {
  GetAnnotation,
  SetAnnotation,
  BatchSetAnnotation,
  DeleteAnnotation,
  GetServiceNames,
  ExportAnnotations,
  ExportAllAnnotations,
  ImportAnnotations,
  ExportToFile,
  ExportAllToFile,
  ImportFromFile,
} from "../../bindings/watermark-01/internal/annotations/annotationservice";

export const GetAnnotations = (
  clusterID: string,
): Promise<Record<string, TopicAnnotation>> =>
  _GetAnnotations(clusterID) as Promise<Record<string, TopicAnnotation>>;

// --- Updater Service ---
export {
  GetCurrentVersion,
  CheckForUpdate,
  ApplyUpdate,
  GetChangelog,
} from "../../bindings/watermark-01/internal/updater/updaterservice";

// --- Lag Alert Service ---
import { SaveAlertConfig as _SaveAlertConfig } from "../../bindings/watermark-01/internal/lagalert/lagalertservice";
export {
  GetAlertConfig,
  AddRule,
  UpdateRule,
  DeleteRule,
  GetAlerts,
  GetUnreadCount,
  MarkAllRead,
  ClearAlerts,
  RestartMonitoring,
  GetTopicTimeSeries,
  GetGroupTimeSeries,
} from "../../bindings/watermark-01/internal/lagalert/lagalertservice";

/** Typed wrapper — accepts app interface, bridges to Wails class at boundary. */
export const SaveAlertConfig = (clusterId: string, cfg: ClusterAlertConfig): Promise<void> =>
  _SaveAlertConfig(clusterId, cfg as any);

// --- Template Service ---
import { GetTemplates as _GetTemplates } from "../../bindings/watermark-01/internal/templates/templateservice";
export {
  GetTemplate,
  SaveTemplate,
  UpdateTemplate,
  DeleteTemplate,
  ExportTemplates,
  ImportTemplates,
  ExportToFile as ExportTemplatesToFile,
  ImportFromFile as ImportTemplatesFromFile,
} from "../../bindings/watermark-01/internal/templates/templateservice";

export const GetTemplates = (
  clusterID: string,
): Promise<Record<string, TopicTemplate>> =>
  _GetTemplates(clusterID) as Promise<Record<string, TopicTemplate>>;


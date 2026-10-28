/**
 * Kafka Domain Types
 *
 * Re-exports Wails-generated model classes as the canonical types.
 * This ensures frontend components and Wails bindings use the same types.
 */

import * as kafka from "../../bindings/watermark-01/internal/kafka/models";
import * as schema from "../../bindings/watermark-01/internal/schema/models";

// Re-export kafka namespace types as top-level
export type Broker = kafka.Broker;
export type Topic = kafka.Topic;
export type Partition = kafka.Partition;
export type Message = kafka.Message;
export type ProduceResult = kafka.ProduceResult;
export type ProduceMessageRequest = kafka.ProduceMessageRequest;
export type DeleteRecordsResult = kafka.DeleteRecordsResult;
export type ConsumerGroup = kafka.ConsumerGroup;
export type ConsumerGroupDetail = kafka.ConsumerGroupDetail;
export type ConsumerGroupMember = kafka.ConsumerGroupMember;
export type ConsumerGroupOffset = kafka.ConsumerGroupOffset;
export type ClusterHealth = kafka.ClusterHealth;
export type TopicConfig = kafka.TopicConfig;

// UI filter types shared between MessagesTab and MessagesFilterBar
export type StartPosition = "Latest" | "Earliest" | "CustomOffset" | "FromDate";
export type MessageFormat = "Auto" | "String" | "JSON" | "Avro" | "Protobuf" | "Hex";
export type AclEntry = kafka.AclEntry;
export type DashboardData = kafka.DashboardData;

// Re-export schema namespace types as top-level
export type SchemaSubject = schema.SchemaSubject;
export type SchemaVersion = schema.SchemaVersion;

/* Convenience aliases — Wails generates `state: string`, so we keep
   a union type for components that need exhaustive switch matching. */
export type ConsumerGroupState =
  | "Stable"
  | "Rebalancing"
  | "Dead"
  | "Empty"
  | "Unknown";

export type SchemaType = "AVRO" | "JSON" | "PROTOBUF";

export type CompatibilityLevel =
  | "BACKWARD"
  | "FORWARD"
  | "FULL"
  | "NONE";

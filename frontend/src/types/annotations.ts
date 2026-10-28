/**
 * Annotation Domain Types
 *
 * Re-exports Wails-generated model classes as the canonical types.
 */

import * as annotations from "../../bindings/watermark-01/internal/annotations/models";

export type TopicAnnotation = annotations.TopicAnnotation;

/** Flattened view for UI display */
export interface TopicWithAnnotation {
  topicName: string;
  producers: string[];
  consumers: string[];
  notes: string;
}

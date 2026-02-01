/**
 * Provenance tracking module for golden record merges
 * @module merge/provenance
 */

// Provenance tracker
export { ProvenanceTracker, createProvenanceTracker } from './provenance-tracker.js'

// Provenance store
export type {
  ProvenanceStore,
  UnmergeInfo,
  ProvenanceQueryOptions,
  FieldHistoryEntry,
  MergeTimelineEntry,
} from './provenance-store.js'
export { InMemoryProvenanceStore, createInMemoryProvenanceStore } from './provenance-store.js'

/**
 * Feedback Collector
 *
 * Collects human review decisions and converts them into training data for ML model improvement.
 * Integrates with the review queue to capture confirm/reject decisions as labeled pairs.
 */

import type {
  TrainingExample,
  TrainingDataset,
  RecordPair,
} from '../types';
import type {
  QueueItem,
} from '../../queue/types';
import { createTrainingDataset, createTrainingExample } from './trainer';

/**
 * Quality metrics for a feedback item
 */
export interface FeedbackQuality {
  /** Confidence of the reviewer's decision (0-1) */
  confidence: number;
  /** Match score from the original resolution (0-1 normalized) */
  matchScore: number;
  /** Time spent on the decision (milliseconds) */
  decisionTimeMs?: number;
  /** Whether the decision was made by an expert reviewer */
  isExpert?: boolean;
  /** Review iteration (for items reviewed multiple times) */
  reviewIteration?: number;
}

/**
 * A collected feedback item with metadata
 */
export interface FeedbackItem<T> {
  /** Unique identifier for this feedback */
  id: string;
  /** The record pair that was evaluated */
  pair: RecordPair<T>;
  /** The label assigned (match or nonMatch) */
  label: 'match' | 'nonMatch';
  /** Source of the feedback */
  source: FeedbackSource;
  /** Quality metrics */
  quality: FeedbackQuality;
  /** When the feedback was collected */
  collectedAt: Date;
  /** Original queue item ID (if from queue) */
  queueItemId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Source of feedback data
 */
export type FeedbackSource =
  | 'queue-confirm'
  | 'queue-reject'
  | 'queue-merge'
  | 'manual'
  | 'synthetic'
  | 'import';

/**
 * Filter options for feedback items
 */
export interface FeedbackFilter {
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Minimum match score */
  minMatchScore?: number;
  /** Maximum match score */
  maxMatchScore?: number;
  /** Filter by source types */
  sources?: FeedbackSource[];
  /** Filter by label */
  label?: 'match' | 'nonMatch';
  /** Only include expert decisions */
  expertOnly?: boolean;
  /** Minimum decision time (filters out too-quick decisions) */
  minDecisionTimeMs?: number;
  /** Collected after this date */
  since?: Date;
  /** Collected before this date */
  until?: Date;
  /** Maximum number of items */
  limit?: number;
}

/**
 * Statistics about collected feedback
 */
export interface FeedbackStats {
  /** Total feedback items */
  total: number;
  /** Count by label */
  byLabel: {
    match: number;
    nonMatch: number;
  };
  /** Count by source */
  bySource: Record<FeedbackSource, number>;
  /** Average confidence across all items */
  avgConfidence: number;
  /** Match ratio (matches / total) */
  matchRatio: number;
  /** Whether dataset is balanced (ratio between 0.4 and 0.6) */
  isBalanced: boolean;
  /** Oldest feedback timestamp */
  oldestFeedback?: Date;
  /** Newest feedback timestamp */
  newestFeedback?: Date;
}

/**
 * Options for the feedback collector
 */
export interface FeedbackCollectorOptions {
  /** Default confidence when not specified (default: 0.8) */
  defaultConfidence?: number;
  /** Default match score when not available (default: 0.5) */
  defaultMatchScore?: number;
  /** Normalize scores to 0-100 range if true (default: false, assumes 0-1) */
  normalizeScores?: boolean;
  /** Maximum score value if normalizing (default: 100) */
  maxScore?: number;
}

/**
 * Export format options
 */
export interface ExportOptions {
  /** Filter to apply before export */
  filter?: FeedbackFilter;
  /** Whether to balance the dataset */
  balance?: boolean;
  /** Random seed for balancing */
  seed?: number;
  /** Include metadata in export */
  includeMetadata?: boolean;
}

/**
 * Feedback Collector class
 *
 * Collects and manages feedback from human review decisions for ML model training.
 */
export class FeedbackCollector<T extends Record<string, unknown> = Record<string, unknown>> {
  private feedback: Map<string, FeedbackItem<T>> = new Map();
  private readonly options: Required<FeedbackCollectorOptions>;
  private idCounter: number = 0;

  constructor(options: FeedbackCollectorOptions = {}) {
    this.options = {
      defaultConfidence: options.defaultConfidence ?? 0.8,
      defaultMatchScore: options.defaultMatchScore ?? 0.5,
      normalizeScores: options.normalizeScores ?? false,
      maxScore: options.maxScore ?? 100,
    };
  }

  /**
   * Convert a queue item decision to a feedback item and add it to the collection
   */
  collectFromQueueItem(
    queueItem: QueueItem<T>,
    candidateRecord?: T
  ): FeedbackItem<T> | null {
    const { decision, candidateRecord: queueCandidate, potentialMatches } = queueItem;

    // Must have a decision
    if (!decision) {
      return null;
    }

    // Determine label based on decision action
    let label: 'match' | 'nonMatch';
    let source: FeedbackSource;

    switch (decision.action) {
      case 'confirm':
        label = 'match';
        source = 'queue-confirm';
        break;
      case 'reject':
        label = 'nonMatch';
        source = 'queue-reject';
        break;
      case 'merge':
        label = 'match';
        source = 'queue-merge';
        break;
      default:
        return null;
    }

    // Get the candidate record
    const candidate = candidateRecord ?? queueCandidate;
    if (!candidate) {
      return null;
    }

    // Get the matched record (for confirm/merge, use selected match; for reject, use first potential match)
    let matchedRecord: T | undefined;
    let matchScore = this.options.defaultMatchScore;

    if (decision.action === 'confirm' || decision.action === 'merge') {
      // Find the selected match
      const selectedMatch = potentialMatches?.find(
        (pm) => this.getRecordId(pm.record) === decision.selectedMatchId
      );
      if (selectedMatch) {
        matchedRecord = selectedMatch.record;
        matchScore = this.normalizeScore(selectedMatch.score);
      } else if (potentialMatches && potentialMatches.length > 0) {
        // Fallback to first match if selected not found
        matchedRecord = potentialMatches[0].record;
        matchScore = this.normalizeScore(potentialMatches[0].score);
      }
    } else if (decision.action === 'reject') {
      // For rejections, use each potential match as a non-match example
      const feedbackItems: FeedbackItem<T>[] = [];

      for (const pm of potentialMatches || []) {
        const pair: RecordPair<T> = {
          record1: candidate,
          record2: pm.record,
        };

        const feedbackItem = this.addFeedback(pair, label, source, {
          confidence: decision.confidence ?? this.options.defaultConfidence,
          matchScore: this.normalizeScore(pm.score),
          decisionTimeMs: this.calculateDecisionTime(queueItem),
        }, queueItem.id);

        feedbackItems.push(feedbackItem);
      }

      // Return the first item (or null if none)
      return feedbackItems.length > 0 ? feedbackItems[0] : null;
    }

    if (!matchedRecord) {
      return null;
    }

    // Create the record pair
    const pair: RecordPair<T> = {
      record1: candidate,
      record2: matchedRecord,
    };

    // Add feedback
    return this.addFeedback(pair, label, source, {
      confidence: decision.confidence ?? this.options.defaultConfidence,
      matchScore,
      decisionTimeMs: this.calculateDecisionTime(queueItem),
    }, queueItem.id);
  }

  /**
   * Collect feedback from multiple queue items
   */
  collectFromQueueItems(queueItems: QueueItem<T>[]): FeedbackItem<T>[] {
    const collected: FeedbackItem<T>[] = [];

    for (const item of queueItems) {
      const feedback = this.collectFromQueueItem(item);
      if (feedback) {
        collected.push(feedback);
      }
    }

    return collected;
  }

  /**
   * Add feedback manually (for direct labeling or imports)
   */
  addFeedback(
    pair: RecordPair<T>,
    label: 'match' | 'nonMatch',
    source: FeedbackSource = 'manual',
    quality?: Partial<FeedbackQuality>,
    queueItemId?: string
  ): FeedbackItem<T> {
    const id = this.generateId();

    const feedbackItem: FeedbackItem<T> = {
      id,
      pair,
      label,
      source,
      quality: {
        confidence: quality?.confidence ?? this.options.defaultConfidence,
        matchScore: quality?.matchScore ?? this.options.defaultMatchScore,
        decisionTimeMs: quality?.decisionTimeMs,
        isExpert: quality?.isExpert,
        reviewIteration: quality?.reviewIteration ?? 1,
      },
      collectedAt: new Date(),
      queueItemId,
    };

    this.feedback.set(id, feedbackItem);
    return feedbackItem;
  }

  /**
   * Add multiple feedback items at once
   */
  addFeedbackBatch(
    items: Array<{
      pair: RecordPair<T>;
      label: 'match' | 'nonMatch';
      source?: FeedbackSource;
      quality?: Partial<FeedbackQuality>;
    }>
  ): FeedbackItem<T>[] {
    return items.map((item) =>
      this.addFeedback(item.pair, item.label, item.source, item.quality)
    );
  }

  /**
   * Import feedback from an external source
   */
  importFeedback(
    pairs: Array<{
      record1: T;
      record2: T;
      label: 'match' | 'nonMatch';
      confidence?: number;
    }>
  ): FeedbackItem<T>[] {
    return pairs.map((p) =>
      this.addFeedback(
        { record1: p.record1, record2: p.record2 },
        p.label,
        'import',
        { confidence: p.confidence }
      )
    );
  }

  /**
   * Get all feedback items matching the filter
   */
  getFeedback(filter?: FeedbackFilter): FeedbackItem<T>[] {
    let items = Array.from(this.feedback.values());

    if (filter) {
      items = this.applyFilter(items, filter);
    }

    // Sort by collection date (newest first)
    items.sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());

    return items;
  }

  /**
   * Get a single feedback item by ID
   */
  getFeedbackById(id: string): FeedbackItem<T> | null {
    return this.feedback.get(id) ?? null;
  }

  /**
   * Remove a feedback item
   */
  removeFeedback(id: string): boolean {
    return this.feedback.delete(id);
  }

  /**
   * Clear all feedback
   */
  clear(): void {
    this.feedback.clear();
  }

  /**
   * Get statistics about collected feedback
   */
  getStats(filter?: FeedbackFilter): FeedbackStats {
    const items = this.getFeedback(filter);

    const byLabel = {
      match: 0,
      nonMatch: 0,
    };

    const bySource: Record<FeedbackSource, number> = {
      'queue-confirm': 0,
      'queue-reject': 0,
      'queue-merge': 0,
      'manual': 0,
      'synthetic': 0,
      'import': 0,
    };

    let totalConfidence = 0;
    let oldestFeedback: Date | undefined;
    let newestFeedback: Date | undefined;

    for (const item of items) {
      byLabel[item.label]++;
      bySource[item.source]++;
      totalConfidence += item.quality.confidence;

      if (!oldestFeedback || item.collectedAt < oldestFeedback) {
        oldestFeedback = item.collectedAt;
      }
      if (!newestFeedback || item.collectedAt > newestFeedback) {
        newestFeedback = item.collectedAt;
      }
    }

    const total = items.length;
    const matchRatio = total > 0 ? byLabel.match / total : 0;
    const isBalanced = matchRatio >= 0.4 && matchRatio <= 0.6;

    return {
      total,
      byLabel,
      bySource,
      avgConfidence: total > 0 ? totalConfidence / total : 0,
      matchRatio,
      isBalanced,
      oldestFeedback,
      newestFeedback,
    };
  }

  /**
   * Export feedback as a training dataset
   */
  exportAsTrainingDataset(options: ExportOptions = {}): TrainingDataset<T> {
    let items = this.getFeedback(options.filter);

    // Balance if requested
    if (options.balance && items.length > 0) {
      items = this.balanceFeedback(items, options.seed);
    }

    // Convert to training examples
    const examples: TrainingExample<T>[] = items.map((item) =>
      createTrainingExample(item.pair, item.label, item.source)
    );

    // Create dataset with metadata
    const stats = this.getStats(options.filter);

    return createTrainingDataset(examples, {
      name: 'Feedback-collected dataset',
      description: `Collected from ${stats.total} human review decisions`,
      createdAt: new Date(),
      matchCount: stats.byLabel.match,
      nonMatchCount: stats.byLabel.nonMatch,
    });
  }

  /**
   * Export feedback as training examples (without dataset wrapper)
   */
  exportAsTrainingExamples(options: ExportOptions = {}): TrainingExample<T>[] {
    let items = this.getFeedback(options.filter);

    if (options.balance && items.length > 0) {
      items = this.balanceFeedback(items, options.seed);
    }

    return items.map((item) =>
      createTrainingExample(item.pair, item.label, item.source)
    );
  }

  /**
   * Get the count of feedback items
   */
  get size(): number {
    return this.feedback.size;
  }

  /**
   * Check if collector has any feedback
   */
  get isEmpty(): boolean {
    return this.feedback.size === 0;
  }

  /**
   * Apply filter to feedback items
   */
  private applyFilter(
    items: FeedbackItem<T>[],
    filter: FeedbackFilter
  ): FeedbackItem<T>[] {
    return items.filter((item) => {
      // Confidence filter
      if (
        filter.minConfidence !== undefined &&
        item.quality.confidence < filter.minConfidence
      ) {
        return false;
      }

      // Match score filters
      if (
        filter.minMatchScore !== undefined &&
        item.quality.matchScore < filter.minMatchScore
      ) {
        return false;
      }
      if (
        filter.maxMatchScore !== undefined &&
        item.quality.matchScore > filter.maxMatchScore
      ) {
        return false;
      }

      // Source filter
      if (filter.sources && filter.sources.length > 0) {
        if (!filter.sources.includes(item.source)) {
          return false;
        }
      }

      // Label filter
      if (filter.label && item.label !== filter.label) {
        return false;
      }

      // Expert filter
      if (filter.expertOnly && !item.quality.isExpert) {
        return false;
      }

      // Minimum decision time filter
      if (
        filter.minDecisionTimeMs !== undefined &&
        item.quality.decisionTimeMs !== undefined &&
        item.quality.decisionTimeMs < filter.minDecisionTimeMs
      ) {
        return false;
      }

      // Date range filters
      if (filter.since && item.collectedAt < filter.since) {
        return false;
      }
      if (filter.until && item.collectedAt > filter.until) {
        return false;
      }

      return true;
    }).slice(0, filter.limit);
  }

  /**
   * Balance feedback by undersampling the majority class
   */
  private balanceFeedback(
    items: FeedbackItem<T>[],
    seed?: number
  ): FeedbackItem<T>[] {
    const matches = items.filter((i) => i.label === 'match');
    const nonMatches = items.filter((i) => i.label === 'nonMatch');

    const minCount = Math.min(matches.length, nonMatches.length);

    if (minCount === 0) {
      return items;
    }

    // Shuffle and take minCount from each
    const rng = seed !== undefined ? this.seededRandom(seed) : Math.random;
    const shuffle = <U>(arr: U[]): U[] => {
      const shuffled = [...arr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const balancedMatches = shuffle(matches).slice(0, minCount);
    const balancedNonMatches = shuffle(nonMatches).slice(0, minCount);

    return [...balancedMatches, ...balancedNonMatches];
  }

  /**
   * Generate a unique ID for feedback items
   */
  private generateId(): string {
    return `feedback-${Date.now()}-${++this.idCounter}`;
  }

  /**
   * Calculate decision time from queue item timestamps
   */
  private calculateDecisionTime(queueItem: QueueItem<T>): number | undefined {
    if (!queueItem.decidedAt) {
      return undefined;
    }

    // If we have updatedAt, use it as the start time (when reviewing started)
    // Otherwise use createdAt
    const startTime = queueItem.updatedAt ?? queueItem.createdAt;
    return queueItem.decidedAt.getTime() - startTime.getTime();
  }

  /**
   * Normalize score to 0-1 range
   */
  private normalizeScore(score: number): number {
    if (!this.options.normalizeScores) {
      // Assume already 0-1, but clamp just in case
      return Math.max(0, Math.min(1, score));
    }
    // Normalize from 0-maxScore to 0-1
    return Math.max(0, Math.min(1, score / this.options.maxScore));
  }

  /**
   * Get record ID (simple heuristic - looks for common ID fields)
   */
  private getRecordId(record: T): string | undefined {
    const r = record as Record<string, unknown>;

    if (typeof r.id === 'string' || typeof r.id === 'number') {
      return String(r.id);
    }
    if (typeof r._id === 'string' || typeof r._id === 'number') {
      return String(r._id);
    }
    if (typeof r.recordId === 'string' || typeof r.recordId === 'number') {
      return String(r.recordId);
    }

    // Fallback: stringify the record
    return JSON.stringify(record);
  }

  /**
   * Simple seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }
}

/**
 * Create a feedback collector with default options
 */
export function createFeedbackCollector<T extends Record<string, unknown> = Record<string, unknown>>(
  options?: FeedbackCollectorOptions
): FeedbackCollector<T> {
  return new FeedbackCollector<T>(options);
}

/**
 * Convert a single queue decision to a training example
 * Utility function for simple one-off conversions
 */
export function queueDecisionToTrainingExample<T extends Record<string, unknown>>(
  queueItem: QueueItem<T>
): TrainingExample<T> | null {
  const collector = new FeedbackCollector<T>();
  const feedback = collector.collectFromQueueItem(queueItem);

  if (!feedback) {
    return null;
  }

  return createTrainingExample(feedback.pair, feedback.label, feedback.source);
}

/**
 * Convert multiple queue decisions to training examples
 * Utility function for batch conversions
 */
export function queueDecisionsToTrainingExamples<T extends Record<string, unknown>>(
  queueItems: QueueItem<T>[]
): TrainingExample<T>[] {
  const collector = new FeedbackCollector<T>();
  collector.collectFromQueueItems(queueItems);
  return collector.exportAsTrainingExamples();
}

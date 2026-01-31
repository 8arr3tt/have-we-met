/**
 * Helper functions for integrating queue with resolver
 * @module core/queue-resolver-integration
 */

import type { MatchResult } from './scoring/types.js'
import type { MatchExplanation } from '../types/match.js'
import type { AddQueueItemRequest, QueueContext } from '../queue/types.js'

/**
 * Convert match results to queue item request
 *
 * This function transforms the resolver's match results into the format
 * required by the review queue.
 *
 * @param candidateRecord - The record being evaluated
 * @param matchResults - Array of match results from resolver
 * @param context - Optional queue context
 * @returns Queue item request ready to be added to queue
 */
export function matchResultToQueueItem<T extends Record<string, unknown>>(
  candidateRecord: T,
  matchResults: MatchResult[],
  context?: Partial<QueueContext>
): AddQueueItemRequest<T> {
  // Filter only potential matches
  const potentialMatches = matchResults
    .filter((result) => result.outcome === 'potential-match')
    .map((result) => ({
      record: result.candidateRecord as T,
      score: result.score.totalScore,
      outcome: 'potential-match' as const,
      explanation: parseExplanation(result.explanation),
    }))

  return {
    candidateRecord,
    potentialMatches,
    context: enrichQueueContext(context),
  }
}

/**
 * Enrich queue context with additional metadata
 *
 * Adds timestamps and other useful metadata to queue context
 *
 * @param context - Base queue context
 * @returns Enriched queue context
 */
export function enrichQueueContext(
  context?: Partial<QueueContext>
): QueueContext {
  return {
    ...context,
    metadata: {
      ...context?.metadata,
      queuedAt: new Date().toISOString(),
      autoQueued: true,
    },
  }
}

/**
 * Parse explanation string into MatchExplanation object
 *
 * Currently just wraps the string explanation. In future phases,
 * this could parse structured explanations.
 *
 * @param explanation - Explanation string from match result
 * @returns Structured match explanation
 */
function parseExplanation(explanation: string): MatchExplanation {
  return {
    summary: explanation,
    fieldComparisons: [],
    appliedRules: [],
  }
}

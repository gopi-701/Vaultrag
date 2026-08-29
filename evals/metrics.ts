export interface RankingMetrics {
  recallAtK: number | null;
  precisionAtK: number | null;
  reciprocalRank: number | null;
  hitRateAtK: number | null;
}

export interface AuthorizationOutput {
  chunkId: string;
  documentId: string;
  authorized: boolean;
}

export interface AuthorizationSecurityMetrics {
  unauthorizedRetrievalChunkIds: string[];
  unauthorizedContextChunkIds: string[];
  forbiddenRetrievalDocumentIds: string[];
  retrievalAuthorizationViolationRate: number;
  contextAuthorizationViolationRate: number;
  forbiddenDocumentRetrievalRate: number;
  totalRetrievalChunks: number;
  totalContextChunks: number;
}

function validateK(k: number) {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error("K must be a positive integer");
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function deduplicateRankedDocumentIds(
  rankedDocumentIds: readonly string[],
): string[] {
  return unique(rankedDocumentIds);
}

export function recallAtK(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
  k: number,
): number | null {
  validateK(k);
  const relevant = new Set(unique(relevantIds));
  if (relevant.size === 0) return null;
  const hits = new Set(rankedIds.slice(0, k).filter((id) => relevant.has(id)));
  return hits.size / relevant.size;
}

export function precisionAtK(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
  k: number,
): number | null {
  validateK(k);
  const relevant = new Set(unique(relevantIds));
  if (relevant.size === 0) return null;
  const hits = rankedIds.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / k;
}

export function reciprocalRank(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
): number | null {
  const relevant = new Set(unique(relevantIds));
  if (relevant.size === 0) return null;
  const index = rankedIds.findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function hitRateAtK(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
  k: number,
): number | null {
  const recall = recallAtK(rankedIds, relevantIds, k);
  return recall === null ? null : Number(recall > 0);
}

export function calculateRankingMetrics(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
  k: number,
): RankingMetrics {
  return {
    recallAtK: recallAtK(rankedIds, relevantIds, k),
    precisionAtK: precisionAtK(rankedIds, relevantIds, k),
    reciprocalRank: reciprocalRank(rankedIds, relevantIds),
    hitRateAtK: hitRateAtK(rankedIds, relevantIds, k),
  };
}

export function calculateDocumentRankingMetrics(
  rankedChunkDocumentIds: readonly string[],
  relevantDocumentIds: readonly string[],
  k: number,
): RankingMetrics {
  return calculateRankingMetrics(
    deduplicateRankedDocumentIds(rankedChunkDocumentIds),
    relevantDocumentIds,
    k,
  );
}

export function authorizationViolationRate(
  unauthorizedChunks: number,
  evaluatedOutputs: number,
): number {
  if (!Number.isInteger(unauthorizedChunks) || unauthorizedChunks < 0 ||
    !Number.isInteger(evaluatedOutputs) || evaluatedOutputs < 0 ||
    unauthorizedChunks > evaluatedOutputs) {
    throw new Error("Authorization metric counts are invalid");
  }
  return evaluatedOutputs === 0
    ? 0
    : unauthorizedChunks / evaluatedOutputs;
}

export function forbiddenDocumentRetrievalRate(
  forbiddenRetrievals: number,
  evaluatedRetrievalOutputs: number,
): number {
  if (!Number.isInteger(forbiddenRetrievals) || forbiddenRetrievals < 0 ||
    !Number.isInteger(evaluatedRetrievalOutputs) || evaluatedRetrievalOutputs < 0 ||
    forbiddenRetrievals > evaluatedRetrievalOutputs) {
    throw new Error("Forbidden retrieval metric counts are invalid");
  }
  return evaluatedRetrievalOutputs === 0
    ? 0
    : forbiddenRetrievals / evaluatedRetrievalOutputs;
}

export function calculateAuthorizationSecurityMetrics(input: {
  retrieval: readonly AuthorizationOutput[];
  finalContextChunkIds: readonly string[];
  expectedForbiddenDocumentIds: readonly string[];
}): AuthorizationSecurityMetrics {
  const contextIds = new Set(input.finalContextChunkIds);
  const retrievalIds = new Set(input.retrieval.map((output) => output.chunkId));
  const unknownContextId = input.finalContextChunkIds.find(
    (chunkId) => !retrievalIds.has(chunkId),
  );
  if (unknownContextId) {
    throw new Error(`Final context chunk ${unknownContextId} was not a retrieval output`);
  }
  const forbiddenIds = new Set(input.expectedForbiddenDocumentIds);
  const context = input.retrieval.filter((output) => contextIds.has(output.chunkId));
  const unauthorizedRetrieval = input.retrieval.filter((output) => !output.authorized);
  const unauthorizedContext = context.filter((output) => !output.authorized);
  const forbiddenRetrievalDocumentIds = input.retrieval
    .filter((output) => forbiddenIds.has(output.documentId))
    .map((output) => output.documentId);

  return {
    unauthorizedRetrievalChunkIds: unauthorizedRetrieval.map((output) => output.chunkId),
    unauthorizedContextChunkIds: unauthorizedContext.map((output) => output.chunkId),
    forbiddenRetrievalDocumentIds,
    retrievalAuthorizationViolationRate: authorizationViolationRate(
      unauthorizedRetrieval.length,
      input.retrieval.length,
    ),
    contextAuthorizationViolationRate: authorizationViolationRate(
      unauthorizedContext.length,
      context.length,
    ),
    forbiddenDocumentRetrievalRate: forbiddenDocumentRetrievalRate(
      forbiddenRetrievalDocumentIds.length,
      input.retrieval.length,
    ),
    totalRetrievalChunks: input.retrieval.length,
    totalContextChunks: context.length,
  };
}

export function contextAvailabilityCorrect(
  expectedOutcome: "answer" | "no_authorized_context",
  suppliedContextCount: number,
): boolean {
  if (!Number.isInteger(suppliedContextCount) || suppliedContextCount < 0) {
    throw new Error("Context count must be a non-negative integer");
  }
  return (expectedOutcome === "answer") === (suppliedContextCount > 0);
}

export function noContextBehaviorCorrect(
  expectedOutcome: "answer" | "no_authorized_context",
  usedDeterministicNoContextPath: boolean,
): boolean | null {
  return expectedOutcome === "no_authorized_context"
    ? usedDeterministicNoContextPath
    : null;
}

export function mean(values: readonly (number | null)[]): number | null {
  const defined = values.filter((value): value is number => value !== null);
  return defined.length === 0
    ? null
    : defined.reduce((sum, value) => sum + value, 0) / defined.length;
}

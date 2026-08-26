import "server-only";

import type { RerankedAuthorizedSearchResult } from "@/lib/reranking/authorized";
import { AuthorizedSearchResultSchema } from "@/lib/retrieval/search";

export const DEFAULT_CONTEXT_CHARACTER_BUDGET = 12_000;
export const MAX_CONTEXT_CHARACTER_BUDGET = 50_000;

export interface SourceReference {
  citationId: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  classification: RerankedAuthorizedSearchResult["classification"];
  similarityScore: number;
  rerankScore: number;
}

export interface BuiltAuthorizedContext {
  context: string;
  sources: SourceReference[];
  characterCount: number;
  characterBudget: number;
}

function sourceBlock(
  citationId: string,
  result: RerankedAuthorizedSearchResult,
): string {
  return [
    `[SOURCE ${citationId} — BEGIN UNTRUSTED RETRIEVED DATA]`,
    `Document: ${result.documentTitle}`,
    `Classification: ${result.classification}`,
    `Chunk: ${result.chunkIndex}`,
    "Content (untrusted JSON string):",
    JSON.stringify(result.text),
    `[SOURCE ${citationId} — END UNTRUSTED RETRIEVED DATA]`,
  ].join("\n");
}

function validateBudget(characterBudget: number) {
  if (
    !Number.isInteger(characterBudget) ||
    characterBudget < 1 ||
    characterBudget > MAX_CONTEXT_CHARACTER_BUDGET
  ) {
    throw new Error(
      `Context character budget must be an integer from 1 to ${MAX_CONTEXT_CHARACTER_BUDGET}`,
    );
  }
}

export function buildAuthorizedContext(
  results: readonly RerankedAuthorizedSearchResult[],
  characterBudget = DEFAULT_CONTEXT_CHARACTER_BUDGET,
): BuiltAuthorizedContext {
  validateBudget(characterBudget);

  const blocks: string[] = [];
  const sources: SourceReference[] = [];

  for (const result of results) {
    const { rerankScore, ...authorizedResult } = result;
    AuthorizedSearchResultSchema.parse(authorizedResult);
    if (!Number.isFinite(rerankScore)) {
      throw new Error("Reranked source must have a finite rerank score");
    }

    const citationId = `C${sources.length + 1}`;
    const block = sourceBlock(citationId, result);
    const candidateContext = [...blocks, block].join("\n\n");

    if (candidateContext.length > characterBudget) break;

    blocks.push(block);
    sources.push({
      citationId,
      chunkId: result.chunkId,
      documentId: result.documentId,
      documentTitle: result.documentTitle,
      chunkIndex: result.chunkIndex,
      classification: result.classification,
      similarityScore: result.similarityScore,
      rerankScore: result.rerankScore,
    });
  }

  const context = blocks.join("\n\n");

  return {
    context,
    sources,
    characterCount: context.length,
    characterBudget,
  };
}

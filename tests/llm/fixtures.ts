import type { Schemas } from "@qdrant/js-client-rest";
import { vi } from "vitest";

import { getPersona } from "@/lib/auth/personas";
import type { RerankedAuthorizedSearchResult } from "@/lib/reranking/authorized";
import { rerankAuthorizedCandidates } from "@/lib/reranking/authorized";
import type { Reranker } from "@/lib/reranking/reranker";
import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { SYNTHETIC_DATASET_ID } from "@/lib/retrieval/preparation";
import type { QdrantQueryClient } from "@/lib/retrieval/qdrant";
import {
  searchAuthorizedDocuments,
  type AuthorizedSearchDependencies,
  type AuthorizedSearchResult,
} from "@/lib/retrieval/search";

export interface RerankedFixtureInput {
  text: string;
  documentId?: string;
  title?: string;
  similarityScore?: number;
  rerankScore?: number;
}

export async function createRerankedAuthorizedFixtures(
  inputs: readonly RerankedFixtureInput[],
  rankedIndexes: readonly number[] = inputs.map((_, index) => index),
): Promise<RerankedAuthorizedSearchResult[]> {
  const points: Schemas["ScoredPoint"][] = inputs.map((input, index) => ({
    id: `00000000-0000-5000-a000-${String(index).padStart(12, "0")}`,
    version: 1,
    score: input.similarityScore ?? 0.9 - index / 10,
    payload: {
      documentId: input.documentId ?? `DOC-${index}`,
      documentTitle: input.title ?? `Synthetic document ${index}`,
      docType: "PUBLIC_FAQ",
      allowedRoles: [],
      minimumClearance: 0,
      classification: "PUBLIC",
      branchId: null,
      clientId: null,
      dealId: null,
      chunkIndex: index,
      text: input.text,
      datasetId: SYNTHETIC_DATASET_ID,
    },
  }));
  const client = {
    query: vi.fn().mockResolvedValue({ points }),
  } as unknown as QdrantQueryClient;
  const embeddingService: Pick<EmbeddingService, "embedQueries"> = {
    embedQueries: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  };
  const dependencies: AuthorizedSearchDependencies = {
    client,
    collectionName: "vaultrag_docs",
    embeddingService,
  };
  const authorized = await searchAuthorizedDocuments(
    { query: "synthetic query", user: getPersona("guest"), limit: 20 },
    dependencies,
  );
  const reranker: Reranker<AuthorizedSearchResult> = {
    rerank: vi.fn(async (input) =>
      rankedIndexes.map((originalIndex) => ({
        document: input.documents[originalIndex],
        originalIndex,
        rerankScore: inputs[originalIndex].rerankScore ??
          0.95 - originalIndex / 10,
      })),
    ),
  };

  return rerankAuthorizedCandidates(
    "synthetic query",
    authorized.results,
    rankedIndexes.length,
    reranker,
  );
}

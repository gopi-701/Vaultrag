import type { Schemas } from "@qdrant/js-client-rest";
import { describe, expect, it, vi } from "vitest";

import { getPersona } from "@/lib/auth/personas";
import {
  DEFAULT_RERANK_CANDIDATE_LIMIT,
  searchAndRerankAuthorizedDocuments,
} from "@/lib/reranking/pipeline";
import type { Reranker } from "@/lib/reranking/reranker";
import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { SYNTHETIC_DATASET_ID } from "@/lib/retrieval/preparation";
import type { QdrantQueryClient } from "@/lib/retrieval/qdrant";
import {
  searchAuthorizedDocuments,
  type AuthorizedSearchDependencies,
  type AuthorizedSearchResult,
} from "@/lib/retrieval/search";

function point(index: number): Schemas["ScoredPoint"] {
  return {
    id: `00000000-0000-5000-a000-${String(index).padStart(12, "0")}`,
    version: 1,
    score: 0.9 - index / 10,
    payload: {
      documentId: `DOC-${index}`,
      documentTitle: `Authorized document ${index}`,
      docType: "PUBLIC_FAQ",
      allowedRoles: [],
      minimumClearance: 0,
      classification: "PUBLIC",
      branchId: null,
      clientId: null,
      dealId: null,
      chunkIndex: index,
      text: `Authorized candidate text ${index}`,
      datasetId: SYNTHETIC_DATASET_ID,
    },
  };
}

function secureSearch(points: Schemas["ScoredPoint"][]) {
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
    now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(14),
  };
  const search = vi.fn((input: Parameters<typeof searchAuthorizedDocuments>[0]) =>
    searchAuthorizedDocuments(input, dependencies),
  );

  return { search, client, embeddingService };
}

describe("secure retrieval and reranking orchestration", () => {
  it("passes exactly the branded secure-retrieval candidates to reranking", async () => {
    const points = [point(0), point(1), point(2)];
    const { search, client } = secureSearch(points);
    const reranker: Reranker<AuthorizedSearchResult> = {
      rerank: vi.fn(async (input) => [
        { document: input.documents[2], originalIndex: 2, rerankScore: 0.97 },
        { document: input.documents[0], originalIndex: 0, rerankScore: 0.71 },
        { document: input.documents[1], originalIndex: 1, rerankScore: 0.42 },
      ]),
    };

    const response = await searchAndRerankAuthorizedDocuments(
      { query: "banking security", user: getPersona("guest") },
      { search, reranker },
    );
    const rerankInput = vi.mocked(reranker.rerank).mock.calls[0][0];

    expect(search).toHaveBeenCalledWith({
      query: "banking security",
      user: getPersona("guest"),
      limit: DEFAULT_RERANK_CANDIDATE_LIMIT,
    });
    expect(client.query).toHaveBeenCalledOnce();
    expect(rerankInput.documents.map((item) => item.chunkId)).toEqual(
      points.map((item) => String(item.id)),
    );
    expect(vi.mocked(search).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(reranker.rerank).mock.invocationCallOrder[0],
    );
    expect(response.results.map((item) => item.chunkId)).toEqual([
      String(points[2].id),
      String(points[0].id),
      String(points[1].id),
    ]);
    expect(response.results[0]).toMatchObject({
      similarityScore: points[2].score,
      rerankScore: 0.97,
      metadata: {
        minimumClearance: 0,
        datasetId: SYNTHETIC_DATASET_ID,
      },
    });
    expect(response.candidateCount).toBe(3);
    expect(response.retrievalDebug.authorizationPrefilterApplied).toBe(true);
    expect(response.retrievalDebug).toEqual({
      authorizationPrefilterApplied: true,
      filter: vi.mocked(client.query).mock.calls[0][1].filter,
      topK: DEFAULT_RERANK_CANDIDATE_LIMIT,
      retrievalLatencyMs: 4,
    });
  });

  it("skips reranking when secure retrieval returns no candidates", async () => {
    const { search } = secureSearch([]);
    const reranker: Reranker<AuthorizedSearchResult> = {
      rerank: vi.fn(),
    };

    const response = await searchAndRerankAuthorizedDocuments(
      { query: "public information", user: getPersona("guest") },
      { search, reranker },
    );

    expect(response.results).toEqual([]);
    expect(response.candidateCount).toBe(0);
    expect(response.retrievalDebug.authorizationPrefilterApplied).toBe(true);
    expect(reranker.rerank).not.toHaveBeenCalled();
  });
});

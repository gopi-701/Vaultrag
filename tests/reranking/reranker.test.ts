import { describe, expect, it, vi } from "vitest";

import {
  createReranker,
  type RerankTransport,
} from "@/lib/reranking/reranker";
import { SYNTHETIC_DATASET_ID } from "@/lib/retrieval/preparation";
import {
  AuthorizedSearchResultSchema,
  type AuthorizedSearchResultData,
} from "@/lib/retrieval/search";

function candidate(
  index: number,
  overrides: Partial<AuthorizedSearchResultData> = {},
): AuthorizedSearchResultData {
  return {
    chunkId: `chunk-${index}`,
    documentId: `DOC-${index}`,
    documentTitle: `Synthetic document ${index}`,
    text: `Authorized synthetic chunk ${index}`,
    classification: "RESTRICTED",
    similarityScore: 0.9 - index / 10,
    chunkIndex: index,
    metadata: {
      docType: "SYNTHETIC_MEMO",
      allowedRoles: ["investment_banker"],
      minimumClearance: 3,
      branchId: null,
      clientId: null,
      dealId: "PROJECT_APOLLO",
      datasetId: SYNTHETIC_DATASET_ID,
    },
    ...overrides,
  };
}

function service(response: unknown) {
  const transport: RerankTransport = {
    rerank: vi.fn().mockResolvedValue(response),
  };
  const reranker = createReranker<AuthorizedSearchResultData>({
    transport,
    getText: (document) => document.text,
    validateDocument: (document) => {
      AuthorizedSearchResultSchema.parse(document);
    },
  });

  return { reranker, transport };
}

describe("provider-neutral authorized reranker", () => {
  it("maps provider indexes onto original authorized chunks in ranked order", async () => {
    const candidates = [candidate(0), candidate(1), candidate(2)];
    const { reranker, transport } = service([
      { originalIndex: 2, rerankScore: 0.98 },
      { originalIndex: 0, rerankScore: 0.73 },
    ]);

    const results = await reranker.rerank({
      query: "Apollo valuation",
      documents: candidates,
      topK: 2,
    });

    expect(transport.rerank).toHaveBeenCalledWith({
      query: "Apollo valuation",
      documents: candidates.map((item) => item.text),
      topK: 2,
    });
    expect(results.map((result) => result.document.chunkId)).toEqual([
      "chunk-2",
      "chunk-0",
    ]);
    expect(results[0].document).toBe(candidates[2]);
    expect(results[0].document.metadata).toBe(candidates[2].metadata);
    expect(results[0].document.similarityScore).toBe(0.7);
    expect(results[0].rerankScore).toBe(0.98);
  });

  it("returns no results and skips the provider for empty candidates", async () => {
    const { reranker, transport } = service([]);

    await expect(
      reranker.rerank({ query: "public policy", documents: [], topK: 1 }),
    ).resolves.toEqual([]);
    expect(transport.rerank).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "non-integer index",
      response: [{ originalIndex: 0.5, rerankScore: 0.8 }],
      message: /malformed/i,
    },
    {
      name: "out-of-range index",
      response: [{ originalIndex: 4, rerankScore: 0.8 }],
      message: /out-of-range/i,
    },
    {
      name: "non-finite score",
      response: [{ originalIndex: 0, rerankScore: Number.NaN }],
      message: /malformed/i,
    },
  ])("rejects $name", async ({ response, message }) => {
    const { reranker } = service(response);

    await expect(
      reranker.rerank({
        query: "query",
        documents: [candidate(0)],
        topK: 1,
      }),
    ).rejects.toThrow(message);
  });

  it("rejects duplicate provider indexes", async () => {
    const { reranker } = service([
      { originalIndex: 0, rerankScore: 0.9 },
      { originalIndex: 0, rerankScore: 0.8 },
    ]);

    await expect(
      reranker.rerank({
        query: "query",
        documents: [candidate(0), candidate(1)],
        topK: 2,
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it.each([0, -1, 1.5, 101])("rejects invalid topK %s", async (topK) => {
    const { reranker, transport } = service([]);

    await expect(
      reranker.rerank({
        query: "query",
        documents: [candidate(0)],
        topK,
      }),
    ).rejects.toThrow(/topK/i);
    expect(transport.rerank).not.toHaveBeenCalled();
  });

  it("rejects topK above the authorized candidate count", async () => {
    const { reranker, transport } = service([]);

    await expect(
      reranker.rerank({
        query: "query",
        documents: [candidate(0)],
        topK: 2,
      }),
    ).rejects.toThrow(/candidate count/i);
    expect(transport.rerank).not.toHaveBeenCalled();
  });

  it("rejects malformed authorized candidates before provider access", async () => {
    const { reranker, transport } = service([]);
    const malformed = { ...candidate(0), metadata: { dealId: "PROJECT_APOLLO" } };

    await expect(
      reranker.rerank({
        query: "query",
        documents: [malformed as AuthorizedSearchResultData],
        topK: 1,
      }),
    ).rejects.toThrow();
    expect(transport.rerank).not.toHaveBeenCalled();
  });
});

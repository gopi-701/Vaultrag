import type { Cohere } from "cohere-ai";
import { describe, expect, it, vi } from "vitest";

import type { RerankingConfig } from "@/lib/env/reranking";
import {
  createCohereRerankTransport,
  type CohereRerankClient,
} from "@/lib/reranking/providers/cohere";

const config: RerankingConfig = {
  apiKey: "cohere-secret-that-must-not-leak",
  model: "rerank-v4.0-pro",
};

describe("Cohere v2 rerank adapter", () => {
  it("sends only candidate text and maps the typed v2 response", async () => {
    const response: Cohere.V2RerankResponse = {
      results: [
        { index: 1, relevanceScore: 0.95 },
        { index: 0, relevanceScore: 0.61 },
      ],
    };
    const client = {
      rerank: vi.fn().mockResolvedValue(response),
    } as unknown as CohereRerankClient;
    const transport = createCohereRerankTransport(config, client);

    await expect(
      transport.rerank({
        query: "Apollo retention",
        documents: ["authorized chunk A", "authorized chunk B"],
        topK: 2,
      }),
    ).resolves.toEqual([
      { originalIndex: 1, rerankScore: 0.95 },
      { originalIndex: 0, rerankScore: 0.61 },
    ]);
    expect(client.rerank).toHaveBeenCalledWith({
      model: "rerank-v4.0-pro",
      query: "Apollo retention",
      documents: ["authorized chunk A", "authorized chunk B"],
      topN: 2,
    });
  });

  it("sanitizes credential-bearing provider errors", async () => {
    const client = {
      rerank: vi.fn().mockRejectedValue(
        new Error(`Authorization: Bearer ${config.apiKey}`),
      ),
    } as unknown as CohereRerankClient;
    const transport = createCohereRerankTransport(config, client);
    const operation = transport.rerank({
      query: "query",
      documents: ["authorized chunk"],
      topK: 1,
    });

    await expect(operation).rejects.toThrow("Cohere reranking request failed");
    await expect(operation).rejects.not.toThrow(config.apiKey);
  });
});

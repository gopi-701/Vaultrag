import "server-only";

import { CohereClientV2, type Cohere } from "cohere-ai";

import type { RerankingConfig } from "@/lib/env/reranking";
import type { RerankTransport } from "@/lib/reranking/reranker";

export type CohereRerankClient = Pick<CohereClientV2, "rerank">;

export function createCohereRerankClient(
  config: RerankingConfig,
): CohereClientV2 {
  return new CohereClientV2({ token: config.apiKey });
}

export function createCohereRerankTransport(
  config: RerankingConfig,
  client: CohereRerankClient = createCohereRerankClient(config),
): RerankTransport {
  return {
    async rerank(input) {
      try {
        const response: Cohere.V2RerankResponse = await client.rerank({
          model: config.model,
          query: input.query,
          documents: [...input.documents],
          topN: input.topK,
        });

        return response.results.map((result) => ({
          originalIndex: result.index,
          rerankScore: result.relevanceScore,
        }));
      } catch {
        throw new Error("Cohere reranking request failed");
      }
    },
  };
}

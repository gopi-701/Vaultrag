import "server-only";

import { getRerankingConfig } from "@/lib/env/reranking";
import {
  createReranker,
  type Reranker,
} from "@/lib/reranking/reranker";
import { createCohereRerankTransport } from "@/lib/reranking/providers/cohere";
import {
  AuthorizedSearchResultSchema,
  type AuthorizedSearchResult,
} from "@/lib/retrieval/search";

export type RerankedAuthorizedSearchResult = AuthorizedSearchResult & {
  rerankScore: number;
};

export function createAuthorizedSearchReranker(): Reranker<AuthorizedSearchResult> {
  return createReranker({
    transport: {
      rerank(input) {
        const config = getRerankingConfig();
        return createCohereRerankTransport(config).rerank(input);
      },
    },
    getText: (document: AuthorizedSearchResult) => document.text,
    validateDocument: (document) => {
      AuthorizedSearchResultSchema.parse(document);
    },
  });
}

export async function rerankAuthorizedCandidates(
  query: string,
  candidates: readonly AuthorizedSearchResult[],
  topK: number,
  reranker?: Reranker<AuthorizedSearchResult>,
): Promise<RerankedAuthorizedSearchResult[]> {
  const ranked = await (reranker ?? createAuthorizedSearchReranker()).rerank({
    query,
    documents: candidates,
    topK,
  });

  return ranked.map(({ document, rerankScore }) => ({
    ...document,
    rerankScore,
  }));
}

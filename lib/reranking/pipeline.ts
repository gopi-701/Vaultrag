import "server-only";

import type { Reranker } from "@/lib/reranking/reranker";
import {
  createAuthorizedSearchReranker,
  rerankAuthorizedCandidates,
  type RerankedAuthorizedSearchResult,
} from "@/lib/reranking/authorized";
import {
  searchAuthorizedDocuments,
  type AuthorizedSearchResponse,
  type AuthorizedSearchResult,
  type RetrievalPrincipal,
} from "@/lib/retrieval/search";

export const DEFAULT_RERANK_CANDIDATE_LIMIT = 20;
export const DEFAULT_RERANK_TOP_K = 5;

export interface AuthorizedRerankingInput {
  query: string;
  user: RetrievalPrincipal;
  candidateLimit?: number;
  topK?: number;
}

export interface AuthorizedRerankingDependencies {
  search?: typeof searchAuthorizedDocuments;
  reranker?: Reranker<AuthorizedSearchResult>;
}

export interface AuthorizedRerankingResponse {
  results: RerankedAuthorizedSearchResult[];
  candidateCount: number;
  retrievalDebug: AuthorizedSearchResponse["debug"];
}

export async function searchAndRerankAuthorizedDocuments(
  input: AuthorizedRerankingInput,
  dependencies: AuthorizedRerankingDependencies = {},
): Promise<AuthorizedRerankingResponse> {
  const authorized = await (dependencies.search ?? searchAuthorizedDocuments)({
    query: input.query,
    user: input.user,
    limit: input.candidateLimit ?? DEFAULT_RERANK_CANDIDATE_LIMIT,
  });

  if (authorized.results.length === 0) {
    return {
      results: [],
      candidateCount: 0,
      retrievalDebug: authorized.debug,
    };
  }

  const topK =
    input.topK ?? Math.min(DEFAULT_RERANK_TOP_K, authorized.results.length);
  const reranker = dependencies.reranker ?? createAuthorizedSearchReranker();
  const results = await rerankAuthorizedCandidates(
    input.query,
    authorized.results,
    topK,
    reranker,
  );

  return {
    results,
    candidateCount: authorized.results.length,
    retrievalDebug: authorized.debug,
  };
}

import "server-only";

import { z } from "zod";

const MAX_RERANK_CANDIDATES = 100;

const ProviderResultSchema = z.object({
  originalIndex: z.number().int().nonnegative(),
  rerankScore: z.number().finite(),
});

export interface RerankInput<T> {
  query: string;
  documents: readonly T[];
  topK: number;
}

export interface RerankedResult<T> {
  document: T;
  originalIndex: number;
  rerankScore: number;
}

export interface Reranker<T> {
  rerank(input: RerankInput<T>): Promise<RerankedResult<T>[]>;
}

export interface RerankTransport {
  rerank(input: {
    query: string;
    documents: readonly string[];
    topK: number;
  }): Promise<unknown>;
}

export interface CreateRerankerOptions<T> {
  transport: RerankTransport;
  getText(document: T): string;
  validateDocument(document: unknown): void;
}

export function createReranker<T>(
  options: CreateRerankerOptions<T>,
): Reranker<T> {
  return {
    async rerank(input) {
      const query = input.query.trim();
      if (!query) throw new Error("Reranking query must not be empty");

      if (
        !Number.isInteger(input.topK) ||
        input.topK < 1 ||
        input.topK > MAX_RERANK_CANDIDATES
      ) {
        throw new Error(
          `Reranking topK must be an integer from 1 to ${MAX_RERANK_CANDIDATES}`,
        );
      }

      if (input.documents.length === 0) return [];
      if (input.topK > input.documents.length) {
        throw new Error("Reranking topK cannot exceed the candidate count");
      }

      const texts = input.documents.map((document) => {
        options.validateDocument(document);
        const text = options.getText(document).trim();
        if (!text) throw new Error("Reranking candidate text must not be empty");
        return text;
      });
      const response = await options.transport.rerank({
        query,
        documents: texts,
        topK: input.topK,
      });
      const parsed = z.array(ProviderResultSchema).safeParse(response);

      if (!parsed.success || parsed.data.length !== input.topK) {
        throw new Error("Reranking provider returned a malformed response");
      }

      const indexes = new Set<number>();

      return parsed.data.map((result) => {
        if (result.originalIndex >= input.documents.length) {
          throw new Error("Reranking provider returned an out-of-range index");
        }
        if (indexes.has(result.originalIndex)) {
          throw new Error("Reranking provider returned a duplicate index");
        }

        indexes.add(result.originalIndex);
        return {
          document: input.documents[result.originalIndex],
          originalIndex: result.originalIndex,
          rerankScore: result.rerankScore,
        };
      });
    },
  };
}

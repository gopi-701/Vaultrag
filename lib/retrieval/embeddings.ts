import { z } from "zod";

import {
  getEmbeddingConfig,
  type EmbeddingConfig,
} from "@/lib/env/embeddings";
import { createJinaTransport } from "@/lib/retrieval/providers/jina";

const EmbeddingVectorsSchema = z.array(
  z.array(z.number().finite()).min(1),
);

export interface EmbeddingTransport {
  embedDocumentBatch(texts: readonly string[]): Promise<unknown>;
  embedQueryBatch(texts: readonly string[]): Promise<unknown>;
}

export interface EmbeddingService {
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
  embedQueries(texts: readonly string[]): Promise<number[][]>;
}

export type EmbeddingServiceConfig = Pick<
  EmbeddingConfig,
  "dimension" | "batchSize"
>;

function validateInputs(texts: readonly string[]) {
  if (texts.some((text) => !text.trim())) {
    throw new Error("Embedding inputs must be non-empty strings");
  }
}

function validateResponse(
  response: unknown,
  expectedCount: number,
  expectedDimension: number,
): number[][] {
  const parsed = EmbeddingVectorsSchema.safeParse(response);

  if (!parsed.success) {
    throw new Error("Embedding provider returned malformed vectors", {
      cause: parsed.error,
    });
  }

  if (parsed.data.length === 0) {
    throw new Error("Embedding provider returned an empty response");
  }

  if (parsed.data.length !== expectedCount) {
    throw new Error(
      `Embedding response count ${parsed.data.length} does not match input count ${expectedCount}`,
    );
  }

  for (const vector of parsed.data) {
    if (vector.length !== expectedDimension) {
      throw new Error(
        `Embedding dimension ${vector.length} does not match configured dimension ${expectedDimension}`,
      );
    }
  }

  return parsed.data;
}

export function createEmbeddingService(
  config: EmbeddingServiceConfig,
  transport: EmbeddingTransport,
): EmbeddingService {
  if (
    !Number.isInteger(config.batchSize) ||
    config.batchSize < 1 ||
    config.batchSize > 128
  ) {
    throw new Error("Embedding batch size must be an integer from 1 to 128");
  }

  if (!Number.isInteger(config.dimension) || config.dimension < 1) {
    throw new Error("Embedding dimension must be a positive integer");
  }

  async function embed(
    texts: readonly string[],
    embedBatch: (batch: readonly string[]) => Promise<unknown>,
  ): Promise<number[][]> {
    validateInputs(texts);
    if (texts.length === 0) return [];

    const vectors: number[][] = [];

    for (let offset = 0; offset < texts.length; offset += config.batchSize) {
      const batch = texts.slice(offset, offset + config.batchSize);
      const response = await embedBatch(batch);
      vectors.push(
        ...validateResponse(response, batch.length, config.dimension),
      );
    }

    return vectors;
  }

  return {
    embedDocuments(texts) {
      return embed(texts, (batch) => transport.embedDocumentBatch(batch));
    },
    embedQueries(texts) {
      return embed(texts, (batch) => transport.embedQueryBatch(batch));
    },
  };
}

function createConfiguredEmbeddingService(): EmbeddingService {
  const config = getEmbeddingConfig();
  return createEmbeddingService(config, createJinaTransport(config));
}

export async function embedDocuments(
  texts: readonly string[],
): Promise<number[][]> {
  return createConfiguredEmbeddingService().embedDocuments(texts);
}

export async function embedQueries(
  texts: readonly string[],
): Promise<number[][]> {
  return createConfiguredEmbeddingService().embedQueries(texts);
}

import { z } from "zod";

import type { EmbeddingConfig } from "@/lib/env/embeddings";
import type { EmbeddingTransport } from "@/lib/retrieval/embeddings";

const JINA_EMBEDDINGS_URL = "https://api.jina.ai/v1/embeddings";

const JinaResponseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number()),
    }),
  ),
});

export function createJinaTransport(
  config: EmbeddingConfig,
  fetchImplementation: typeof fetch = fetch,
): EmbeddingTransport {
  return {
    async embedBatch(texts) {
      const response = await fetchImplementation(JINA_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          input: [...texts],
          task: "retrieval.passage",
          dimensions: config.dimension,
        }),
      });

      if (!response.ok) {
        throw new Error(`Jina embedding request failed with status ${response.status}`);
      }

      const parsed = JinaResponseSchema.parse(await response.json());
      const ordered = [...parsed.data].sort((left, right) => left.index - right.index);

      if (ordered.some((item, index) => item.index !== index)) {
        throw new Error("Jina embedding response contains invalid indexes");
      }

      return ordered.map((item) => item.embedding);
    },
  };
}

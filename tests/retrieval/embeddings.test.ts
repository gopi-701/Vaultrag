import { describe, expect, it, vi } from "vitest";

import {
  createEmbeddingService,
  type EmbeddingTransport,
} from "@/lib/retrieval/embeddings";

function transportReturning(response: unknown): EmbeddingTransport {
  return {
    embedBatch: vi.fn().mockResolvedValue(response),
  };
}

describe("embedding abstraction", () => {
  it("rejects malformed embedding responses", async () => {
    const service = createEmbeddingService(
      { batchSize: 2, dimension: 3 },
      transportReturning([[1, Number.NaN, 3]]),
    );

    await expect(service.embedTexts(["valid input"])).rejects.toThrow(
      /malformed vectors/i,
    );
  });

  it("rejects empty provider responses", async () => {
    const service = createEmbeddingService(
      { batchSize: 2, dimension: 3 },
      transportReturning([]),
    );

    await expect(service.embedTexts(["valid input"])).rejects.toThrow(
      /empty response/i,
    );
  });

  it("rejects vector dimension mismatches", async () => {
    const service = createEmbeddingService(
      { batchSize: 2, dimension: 3 },
      transportReturning([[1, 2]]),
    );

    await expect(service.embedTexts(["valid input"])).rejects.toThrow(
      /dimension 2 does not match configured dimension 3/i,
    );
  });

  it("rejects response count mismatches", async () => {
    const service = createEmbeddingService(
      { batchSize: 2, dimension: 3 },
      transportReturning([[1, 2, 3]]),
    );

    await expect(
      service.embedTexts(["first input", "second input"]),
    ).rejects.toThrow(/response count 1 does not match input count 2/i);
  });

  it("batches inputs and returns one vector per input", async () => {
    const transport: EmbeddingTransport = {
      embedBatch: vi.fn(async (texts: readonly string[]) =>
        texts.map((text, index) => [text.length, index, 1]),
      ),
    };
    const service = createEmbeddingService(
      { batchSize: 2, dimension: 3 },
      transport,
    );
    const vectors = await service.embedTexts(["one", "two", "three"]);

    expect(vectors).toHaveLength(3);
    expect(transport.embedBatch).toHaveBeenCalledTimes(2);
  });
});

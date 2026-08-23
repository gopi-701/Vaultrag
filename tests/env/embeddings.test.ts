import { describe, expect, it } from "vitest";

import {
  getEmbeddingConfig,
  getEmbeddingModelConfig,
} from "@/lib/env/embeddings";

const validEnvironment = {
  EMBEDDING_PROVIDER: "jina",
  EMBEDDING_MODEL: "jina-embeddings-v3",
  EMBEDDING_DIMENSION: "1024",
  EMBEDDING_BATCH_SIZE: "32",
  JINA_API_KEY: "synthetic-test-key",
};

describe("embedding environment configuration", () => {
  it("loads model configuration without runtime credentials", () => {
    const modelEnvironment = { ...validEnvironment, JINA_API_KEY: undefined };

    expect(getEmbeddingModelConfig(modelEnvironment)).toEqual({
      provider: "jina",
      model: "jina-embeddings-v3",
      dimension: 1024,
      batchSize: 32,
    });
  });

  it("requires runtime credentials for embedding operations", () => {
    const modelEnvironment = { ...validEnvironment, JINA_API_KEY: undefined };

    expect(() => getEmbeddingConfig(modelEnvironment)).toThrow(/JINA_API_KEY/);
  });

  it("parses a supported model and dimension", () => {
    expect(getEmbeddingConfig(validEnvironment)).toMatchObject({
      provider: "jina",
      model: "jina-embeddings-v3",
      dimension: 1024,
      batchSize: 32,
    });
  });

  it("rejects arbitrary dimensions unsupported by the model", () => {
    expect(() =>
      getEmbeddingConfig({
        ...validEnvironment,
        EMBEDDING_DIMENSION: "777",
      }),
    ).toThrow();
  });

  it("rejects provider batch sizes above the supported maximum", () => {
    expect(() =>
      getEmbeddingConfig({
        ...validEnvironment,
        EMBEDDING_BATCH_SIZE: "129",
      }),
    ).toThrow();
  });
});

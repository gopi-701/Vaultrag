import { describe, expect, it } from "vitest";

import { loadSetupConfiguration } from "@/scripts/setup-db";

describe("Qdrant setup entry point", () => {
  it("loads its vector configuration without a Jina API key", () => {
    const configuration = loadSetupConfiguration({
      QDRANT_URL: "http://localhost:6333",
      QDRANT_COLLECTION: "vaultrag_docs",
      EMBEDDING_PROVIDER: "jina",
      EMBEDDING_MODEL: "jina-embeddings-v3",
      EMBEDDING_DIMENSION: "1024",
      EMBEDDING_BATCH_SIZE: "32",
    });

    expect(configuration.embedding.dimension).toBe(1024);
    expect(configuration.qdrant.collection).toBe("vaultrag_docs");
  });
});

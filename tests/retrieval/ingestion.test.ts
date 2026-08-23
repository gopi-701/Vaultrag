import type { QdrantClient } from "@qdrant/js-client-rest";
import { describe, expect, it, vi } from "vitest";

import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { ingestDocuments } from "@/lib/retrieval/ingestion";

describe("document ingestion", () => {
  it("rejects invalid source documents before Qdrant access or embedding", async () => {
    const client = {
      getCollection: vi.fn(),
      upsert: vi.fn(),
    } as unknown as Pick<QdrantClient, "getCollection" | "upsert">;
    const embeddingService: EmbeddingService = {
      embedTexts: vi.fn(),
    };

    await expect(
      ingestDocuments([{ id: "malformed" }], {
        client,
        collectionName: "vaultrag_docs",
        vectorDimension: 3,
        embeddingService,
      }),
    ).rejects.toThrow();

    expect(client.getCollection).not.toHaveBeenCalled();
    expect(client.upsert).not.toHaveBeenCalled();
    expect(embeddingService.embedTexts).not.toHaveBeenCalled();
  });
});

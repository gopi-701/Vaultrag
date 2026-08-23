import { describe, expect, it } from "vitest";

import { getQdrantConfig } from "@/lib/env/qdrant";

describe("Qdrant environment configuration", () => {
  it("parses connection settings and strips an empty API key", () => {
    expect(
      getQdrantConfig({
        QDRANT_URL: "http://localhost:6333/",
        QDRANT_API_KEY: "",
        QDRANT_COLLECTION: "vaultrag_docs",
      }),
    ).toEqual({
      url: "http://localhost:6333",
      collection: "vaultrag_docs",
    });
  });

  it("defaults the collection name", () => {
    expect(
      getQdrantConfig({ QDRANT_URL: "http://localhost:6333" }).collection,
    ).toBe("vaultrag_docs");
  });
});

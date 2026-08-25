import { describe, expect, it } from "vitest";

import { getRerankingConfig } from "@/lib/env/reranking";

describe("reranking environment configuration", () => {
  it("uses the centralized default Cohere rerank model", () => {
    expect(
      getRerankingConfig({ COHERE_API_KEY: "synthetic-test-key" }),
    ).toEqual({
      apiKey: "synthetic-test-key",
      model: "rerank-v4.0-pro",
    });
  });

  it("requires a server-side Cohere API key", () => {
    expect(() => getRerankingConfig({})).toThrow(/COHERE_API_KEY/);
  });
});

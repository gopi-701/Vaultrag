import { describe, expect, it } from "vitest";

import { getLlmConfig } from "@/lib/env/llm";

describe("LLM environment configuration", () => {
  it("loads the configured Groq model and API key", () => {
    expect(
      getLlmConfig({
        GROQ_API_KEY: "synthetic-groq-key",
        GROQ_MODEL: "configured-test-model",
      }),
    ).toEqual({
      apiKey: "synthetic-groq-key",
      model: "configured-test-model",
    });
  });

  it("requires both Groq settings", () => {
    expect(() => getLlmConfig({})).toThrow();
    expect(() => getLlmConfig({ GROQ_API_KEY: "key" })).toThrow(/GROQ_MODEL/);
  });
});

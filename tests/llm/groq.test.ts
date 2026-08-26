import { describe, expect, it, vi } from "vitest";

import type { LlmConfig } from "@/lib/env/llm";
import {
  createGroqGenerationProvider,
  type AiSdkTextGenerator,
} from "@/lib/llm/groq";

const config: LlmConfig = {
  apiKey: "groq-secret-that-must-not-leak",
  model: "configured-groq-model",
};

describe("Groq AI SDK generation adapter", () => {
  it("uses the configured model with system and prompt input", async () => {
    const textGenerator: AiSdkTextGenerator = {
      generate: vi.fn().mockResolvedValue({
        text: "Generated answer [C1].",
        usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
      }),
    };
    const provider = createGroqGenerationProvider(config, textGenerator);

    await expect(
      provider.generate({ system: "system rules", prompt: "user and context" }),
    ).resolves.toEqual({
      text: "Generated answer [C1].",
      usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
    });
    expect(provider.model).toBe("configured-groq-model");
    const request = vi.mocked(textGenerator.generate).mock.calls[0][0];
    expect(request.system).toBe("system rules");
    expect(request.prompt).toBe("user and context");
    expect(request).not.toHaveProperty("apiKey");
  });

  it("sanitizes credential-bearing provider errors", async () => {
    const textGenerator: AiSdkTextGenerator = {
      generate: vi.fn().mockRejectedValue(
        new Error(`Authorization: Bearer ${config.apiKey}`),
      ),
    };
    const provider = createGroqGenerationProvider(config, textGenerator);
    const operation = provider.generate({ system: "rules", prompt: "context" });

    await expect(operation).rejects.toThrow("Groq generation request failed");
    await expect(operation).rejects.not.toThrow(config.apiKey);
  });
});

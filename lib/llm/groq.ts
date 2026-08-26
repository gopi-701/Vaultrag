import "server-only";

import { createGroq } from "@ai-sdk/groq";
import { generateText, type LanguageModel } from "ai";

import type { LlmConfig } from "@/lib/env/llm";
import type {
  GenerationProvider,
  ProviderGenerationResult,
} from "@/lib/llm/generator";

export interface AiSdkTextGenerator {
  generate(input: {
    model: LanguageModel;
    system: string;
    prompt: string;
  }): Promise<{
    text: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }>;
}

const defaultTextGenerator: AiSdkTextGenerator = {
  async generate(input) {
    const result = await generateText(input);

    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  },
};

export function createGroqGenerationProvider(
  config: LlmConfig,
  textGenerator: AiSdkTextGenerator = defaultTextGenerator,
): GenerationProvider {
  const provider = createGroq({ apiKey: config.apiKey });
  const model = provider(config.model);

  return {
    model: config.model,
    async generate(input): Promise<ProviderGenerationResult> {
      try {
        return await textGenerator.generate({
          model,
          system: input.system,
          prompt: input.prompt,
        });
      } catch {
        throw new Error("Groq generation request failed");
      }
    },
  };
}

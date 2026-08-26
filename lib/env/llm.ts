import { z } from "zod";

const LlmEnvironmentSchema = z.object({
  GROQ_API_KEY: z.string().trim().min(1),
  GROQ_MODEL: z.string().trim().min(1),
});

export interface LlmConfig {
  apiKey: string;
  model: string;
}

export function getLlmConfig(
  environment: Record<string, string | undefined> = process.env,
): LlmConfig {
  const parsed = LlmEnvironmentSchema.parse(environment);

  return {
    apiKey: parsed.GROQ_API_KEY,
    model: parsed.GROQ_MODEL,
  };
}

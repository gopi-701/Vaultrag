import { z } from "zod";

const RerankingEnvironmentSchema = z.object({
  COHERE_API_KEY: z.string().trim().min(1),
  COHERE_RERANK_MODEL: z.string().trim().min(1).default("rerank-v4.0-pro"),
});

export interface RerankingConfig {
  apiKey: string;
  model: string;
}

export function getRerankingConfig(
  environment: Record<string, string | undefined> = process.env,
): RerankingConfig {
  const parsed = RerankingEnvironmentSchema.parse(environment);

  return {
    apiKey: parsed.COHERE_API_KEY,
    model: parsed.COHERE_RERANK_MODEL,
  };
}

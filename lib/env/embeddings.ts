import { z } from "zod";

const MODEL_DIMENSIONS = {
  "jina-embeddings-v3": [32, 64, 128, 256, 512, 768, 1024],
} as const;

const PositiveIntegerSchema = z.coerce.number().int().positive();

const EmbeddingEnvironmentSchema = z
  .object({
    EMBEDDING_PROVIDER: z.literal("jina").default("jina"),
    EMBEDDING_MODEL: z.string().min(1),
    EMBEDDING_DIMENSION: PositiveIntegerSchema,
    EMBEDDING_BATCH_SIZE: PositiveIntegerSchema.max(128).default(32),
    JINA_API_KEY: z.string().min(1),
  })
  .superRefine((environment, context) => {
    const dimensions =
      MODEL_DIMENSIONS[
        environment.EMBEDDING_MODEL as keyof typeof MODEL_DIMENSIONS
      ];

    if (!dimensions) {
      context.addIssue({
        code: "custom",
        path: ["EMBEDDING_MODEL"],
        message: "Unsupported embedding model",
      });
      return;
    }

    if (!(dimensions as readonly number[]).includes(environment.EMBEDDING_DIMENSION)) {
      context.addIssue({
        code: "custom",
        path: ["EMBEDDING_DIMENSION"],
        message: `Dimension is not supported by ${environment.EMBEDDING_MODEL}`,
      });
    }
  });

export interface EmbeddingConfig {
  provider: "jina";
  model: keyof typeof MODEL_DIMENSIONS;
  dimension: number;
  batchSize: number;
  apiKey: string;
}

export function getEmbeddingConfig(
  environment: Record<string, string | undefined> = process.env,
): EmbeddingConfig {
  const parsed = EmbeddingEnvironmentSchema.parse(environment);

  return {
    provider: parsed.EMBEDDING_PROVIDER,
    model: parsed.EMBEDDING_MODEL as keyof typeof MODEL_DIMENSIONS,
    dimension: parsed.EMBEDDING_DIMENSION,
    batchSize: parsed.EMBEDDING_BATCH_SIZE,
    apiKey: parsed.JINA_API_KEY,
  };
}

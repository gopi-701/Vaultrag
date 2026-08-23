import { z } from "zod";

const MODEL_DIMENSIONS = {
  "jina-embeddings-v3": [32, 64, 128, 256, 512, 768, 1024],
} as const;

const PositiveIntegerSchema = z.coerce.number().int().positive();

const EmbeddingEnvironmentFields = {
  EMBEDDING_PROVIDER: z.literal("jina").default("jina"),
  EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_DIMENSION: PositiveIntegerSchema,
  EMBEDDING_BATCH_SIZE: PositiveIntegerSchema.max(128).default(32),
};

function validateModelDimension(
  environment: {
    EMBEDDING_MODEL: string;
    EMBEDDING_DIMENSION: number;
  },
  context: z.RefinementCtx,
) {
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

  if (
    !(dimensions as readonly number[]).includes(
      environment.EMBEDDING_DIMENSION,
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["EMBEDDING_DIMENSION"],
      message: `Dimension is not supported by ${environment.EMBEDDING_MODEL}`,
    });
  }
}

const EmbeddingModelEnvironmentSchema = z
  .object(EmbeddingEnvironmentFields)
  .superRefine(validateModelDimension);

const EmbeddingEnvironmentSchema = z
  .object({
    ...EmbeddingEnvironmentFields,
    JINA_API_KEY: z.string().min(1),
  })
  .superRefine(validateModelDimension);

export interface EmbeddingModelConfig {
  provider: "jina";
  model: keyof typeof MODEL_DIMENSIONS;
  dimension: number;
  batchSize: number;
}

export interface EmbeddingConfig extends EmbeddingModelConfig {
  apiKey: string;
}

function toModelConfig(
  parsed: z.infer<typeof EmbeddingModelEnvironmentSchema>,
): EmbeddingModelConfig {
  return {
    provider: parsed.EMBEDDING_PROVIDER,
    model: parsed.EMBEDDING_MODEL as keyof typeof MODEL_DIMENSIONS,
    dimension: parsed.EMBEDDING_DIMENSION,
    batchSize: parsed.EMBEDDING_BATCH_SIZE,
  };
}

export function getEmbeddingModelConfig(
  environment: Record<string, string | undefined> = process.env,
): EmbeddingModelConfig {
  return toModelConfig(EmbeddingModelEnvironmentSchema.parse(environment));
}

export function getEmbeddingConfig(
  environment: Record<string, string | undefined> = process.env,
): EmbeddingConfig {
  const parsed = EmbeddingEnvironmentSchema.parse(environment);

  return {
    ...toModelConfig(parsed),
    apiKey: parsed.JINA_API_KEY,
  };
}

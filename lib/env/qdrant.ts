import { z } from "zod";

const QdrantEnvironmentSchema = z.object({
  QDRANT_URL: z.url(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().min(1).default("vaultrag_docs"),
});

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collection: string;
}

export function getQdrantConfig(
  environment: Record<string, string | undefined> = process.env,
): QdrantConfig {
  const parsed = QdrantEnvironmentSchema.parse(environment);
  const apiKey = parsed.QDRANT_API_KEY?.trim() || undefined;

  return {
    url: parsed.QDRANT_URL.replace(/\/$/, ""),
    ...(apiKey ? { apiKey } : {}),
    collection: parsed.QDRANT_COLLECTION,
  };
}

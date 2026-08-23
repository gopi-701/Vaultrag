import type { QdrantClient } from "@qdrant/js-client-rest";

import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { prepareDocuments } from "@/lib/retrieval/preparation";
import {
  assertCollectionCompatible,
  upsertPreparedPoints,
  type UpsertResult,
} from "@/lib/retrieval/qdrant";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

type IngestionClient = Pick<QdrantClient, "getCollection" | "upsert">;

export interface IngestionOptions {
  client: IngestionClient;
  collectionName: string;
  vectorDimension: number;
  embeddingService: EmbeddingService;
  upsertBatchSize?: number;
}

export async function ingestDocuments(
  input: unknown,
  options: IngestionOptions,
): Promise<UpsertResult> {
  const documents = BankingDocumentCollectionSchema.parse(input);

  await assertCollectionCompatible(
    options.client,
    options.collectionName,
    options.vectorDimension,
  );

  const points = await prepareDocuments(documents, options.embeddingService);

  return upsertPreparedPoints(
    options.client,
    options.collectionName,
    points,
    options.vectorDimension,
    options.upsertBatchSize,
  );
}

import type { QdrantClient } from "@qdrant/js-client-rest";

import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { prepareDocuments } from "@/lib/retrieval/preparation";
import { SYNTHETIC_DATASET_ID } from "@/lib/retrieval/preparation";
import {
  assertCollectionCompatible,
  reconcileDatasetPoints,
  upsertPreparedPoints,
  type ReconciliationResult,
  type UpsertResult,
} from "@/lib/retrieval/qdrant";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

type IngestionClient = Pick<
  QdrantClient,
  "getCollection" | "upsert" | "scroll" | "delete"
>;

export interface IngestionResult
  extends UpsertResult,
    ReconciliationResult {}

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
): Promise<IngestionResult> {
  const documents = BankingDocumentCollectionSchema.parse(input);

  await assertCollectionCompatible(
    options.client,
    options.collectionName,
    options.vectorDimension,
  );

  const points = await prepareDocuments(documents, options.embeddingService);

  const upsertResult = await upsertPreparedPoints(
    options.client,
    options.collectionName,
    points,
    options.vectorDimension,
    options.upsertBatchSize,
  );
  const reconciliationResult = await reconcileDatasetPoints(
    options.client,
    options.collectionName,
    SYNTHETIC_DATASET_ID,
    new Set(points.map((point) => point.id)),
  );

  return { ...upsertResult, ...reconciliationResult };
}

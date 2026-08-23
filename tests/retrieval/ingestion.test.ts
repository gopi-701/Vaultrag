import type { QdrantClient, Schemas } from "@qdrant/js-client-rest";
import { describe, expect, it, vi } from "vitest";

import syntheticDocuments from "@/data/synthetic_docs.json";
import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { ingestDocuments } from "@/lib/retrieval/ingestion";
import { SYNTHETIC_DATASET_ID } from "@/lib/retrieval/preparation";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

const documents = BankingDocumentCollectionSchema.parse(syntheticDocuments);
const collectionInfo = {
  status: "green",
  optimizer_status: "ok",
  segments_count: 1,
  config: { params: { vectors: { size: 3, distance: "Cosine" } }, hnsw_config: {}, optimizer_config: {} },
  payload_schema: {},
} as Schemas["CollectionInfo"];
type IngestionClient = Pick<QdrantClient, "getCollection" | "upsert" | "scroll" | "delete">;

function embeddingService(): EmbeddingService {
  return { embedTexts: vi.fn(async (texts: string[]) => texts.map((text, index) => [text.length, index, 1])) };
}

function inMemoryClient(initial: Schemas["PointStruct"][] = []) {
  const points = new Map(initial.map((point) => [String(point.id), point]));
  const client = {
    getCollection: vi.fn().mockResolvedValue(collectionInfo),
    upsert: vi.fn(async (_collection: string, request: Schemas["PointInsertOperations"]) => {
      if (!("points" in request)) throw new Error("Unexpected point format");
      for (const point of request.points) points.set(String(point.id), point);
      return { status: "completed" };
    }),
    scroll: vi.fn(async () => ({
      points: [...points.values()].filter((point) => point.payload?.datasetId === SYNTHETIC_DATASET_ID).map((point) => ({ id: point.id, version: 1 })),
      next_page_offset: null,
    })),
    delete: vi.fn(async (_collection: string, request: { points: Array<string | number> }) => {
      for (const id of request.points) points.delete(String(id));
      return { status: "completed" };
    }),
  } as unknown as IngestionClient;
  return { client, points };
}

function options(client: IngestionClient, service = embeddingService()) {
  return { client, collectionName: "vaultrag_docs", vectorDimension: 3, embeddingService: service, upsertBatchSize: 2 };
}

describe("document ingestion", () => {
  it("rejects invalid source documents before Qdrant access or embedding", async () => {
    const { client } = inMemoryClient();
    const service: EmbeddingService = { embedTexts: vi.fn() };
    await expect(ingestDocuments([{ id: "malformed" }], options(client, service))).rejects.toThrow();
    expect(client.getCollection).not.toHaveBeenCalled();
    expect(client.upsert).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
    expect(service.embedTexts).not.toHaveBeenCalled();
  });

  it("is idempotent when the identical dataset is ingested twice", async () => {
    const { client, points } = inMemoryClient();
    const input = documents.slice(0, 3);
    await ingestDocuments(input, options(client));
    const firstIds = [...points.keys()].sort();
    const second = await ingestDocuments(input, options(client));
    expect([...points.keys()].sort()).toEqual(firstIds);
    expect(second.stalePointsDeleted).toBe(0);
  });

  it("removes obsolete chunks when content becomes shorter", async () => {
    const { client, points } = inMemoryClient();
    const longDocument = {
      ...documents[0],
      content: `SYNTHETIC DATA — ${"synthetic banking policy ".repeat(90)}`,
    };
    const shortDocument = {
      ...longDocument,
      content:
        "SYNTHETIC DATA — Short synthetic banking policy for controlled testing of secure document ingestion and reconciliation.",
    };
    await ingestDocuments([longDocument], options(client));
    const longCount = points.size;
    const result = await ingestDocuments([shortDocument], options(client));
    expect(longCount).toBeGreaterThan(1);
    expect(points.size).toBe(1);
    expect(result.stalePointsDeleted).toBe(longCount - 1);
  });

  it("removes points for a source document no longer present", async () => {
    const { client, points } = inMemoryClient();
    await ingestDocuments(documents.slice(0, 2), options(client));
    const result = await ingestDocuments(documents.slice(0, 1), options(client));
    expect(points.size).toBe(1);
    expect(result.stalePointsDeleted).toBeGreaterThan(0);
  });

  it("never removes unrelated points", async () => {
    const unrelated: Schemas["PointStruct"] = { id: "11111111-1111-5111-a111-111111111111", vector: [1, 2, 3], payload: { datasetId: "another_dataset", text: "unrelated" } };
    const { client, points } = inMemoryClient([unrelated]);
    await ingestDocuments(documents.slice(0, 1), options(client));
    expect(points.get(String(unrelated.id))).toEqual(unrelated);
  });

  it("preserves authorization metadata and batches writes", async () => {
    const { client, points } = inMemoryClient();
    const input = documents.slice(0, 3);
    const result = await ingestDocuments(input, options(client));
    const stored = [...points.values()][0].payload;
    expect(result.batchesCompleted).toBe(2);
    expect(client.upsert).toHaveBeenCalledTimes(2);
    expect(stored).toMatchObject({ allowedRoles: input[0].allowedRoles, minimumClearance: input[0].minimumClearance, classification: input[0].classification, branchId: input[0].branchId, clientId: input[0].clientId, dealId: input[0].dealId, datasetId: SYNTHETIC_DATASET_ID });
  });

  it("does not clean up when embedding preparation fails", async () => {
    const { client, points } = inMemoryClient();
    await ingestDocuments(documents.slice(0, 2), options(client));
    const idsBefore = [...points.keys()].sort();
    const failedService: EmbeddingService = { embedTexts: vi.fn().mockRejectedValue(new Error("preparation failed")) };
    await expect(ingestDocuments(documents.slice(0, 1), options(client, failedService))).rejects.toThrow(/preparation failed/);
    expect([...points.keys()].sort()).toEqual(idsBefore);
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("does not clean up after a failed upsert batch", async () => {
    const { client } = inMemoryClient();
    client.upsert = vi.fn().mockRejectedValue(new Error("remote failure"));
    await expect(ingestDocuments(documents.slice(0, 2), options(client))).rejects.toThrow(/upsert failed/i);
    expect(client.scroll).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("rejects collection dimension and distance mismatches before embedding", async () => {
    const dimension = inMemoryClient();
    dimension.client.getCollection = vi.fn().mockResolvedValue({ ...collectionInfo, config: { ...collectionInfo.config, params: { vectors: { size: 4, distance: "Cosine" } } } });
    const distance = inMemoryClient();
    distance.client.getCollection = vi.fn().mockResolvedValue({ ...collectionInfo, config: { ...collectionInfo.config, params: { vectors: { size: 3, distance: "Dot" } } } });
    await expect(ingestDocuments(documents.slice(0, 1), options(dimension.client))).rejects.toThrow(/dimension/i);
    await expect(ingestDocuments(documents.slice(0, 1), options(distance.client))).rejects.toThrow(/distance/i);
  });
});

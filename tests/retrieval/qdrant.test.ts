import type { Schemas } from "@qdrant/js-client-rest";
import { describe, expect, it, vi } from "vitest";

import syntheticDocuments from "@/data/synthetic_docs.json";
import { chunkDocument } from "@/lib/retrieval/chunker";
import {
  SYNTHETIC_DATASET_ID,
  type PreparedPoint,
} from "@/lib/retrieval/preparation";
import {
  ensureCollection,
  upsertPreparedPoints,
  type QdrantSetupClient,
  type QdrantUpsertClient,
} from "@/lib/retrieval/qdrant";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

const [sourceDocument] =
  BankingDocumentCollectionSchema.parse(syntheticDocuments);
const payload = chunkDocument(sourceDocument)[0];

function collectionInfo(
  size = 3,
  distance: Schemas["Distance"] = "Cosine",
  payloadSchema: Schemas["CollectionInfo"]["payload_schema"] = {},
): Schemas["CollectionInfo"] {
  return {
    status: "green",
    optimizer_status: "ok",
    segments_count: 1,
    config: {
      params: { vectors: { size, distance } },
      hnsw_config: {} as Schemas["HnswConfig"],
      optimizer_config: {} as Schemas["OptimizersConfig"],
    },
    payload_schema: payloadSchema,
  };
}

function point(index: number, vector = [index, 0.5, 1]): PreparedPoint {
  return {
    id: `00000000-0000-5000-a000-${String(index).padStart(12, "0")}`,
    vector,
    payload: {
      ...payload,
      allowedRoles: [...payload.allowedRoles],
      datasetId: SYNTHETIC_DATASET_ID,
    },
  };
}

describe("Qdrant collection setup", () => {
  it("creates a cosine collection and authorization payload indexes", async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: false }),
      createCollection: vi.fn().mockResolvedValue(true),
      getCollection: vi.fn().mockResolvedValue(collectionInfo()),
      createPayloadIndex: vi.fn().mockResolvedValue({ status: "completed" }),
    } as unknown as QdrantSetupClient;

    const result = await ensureCollection(client, "vaultrag_docs", 3);

    expect(client.createCollection).toHaveBeenCalledWith("vaultrag_docs", {
      vectors: { size: 3, distance: "Cosine" },
    });
    expect(result.created).toBe(true);
    expect(result.indexesCreated).toEqual([
      "allowedRoles",
      "minimumClearance",
      "branchId",
      "clientId",
      "dealId",
      "classification",
      "documentId",
      "datasetId",
    ]);
  });

  it("does not recreate an existing compatible collection", async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
      getCollection: vi.fn().mockResolvedValue(collectionInfo()),
      createPayloadIndex: vi.fn().mockResolvedValue({ status: "completed" }),
    } as unknown as QdrantSetupClient;

    const result = await ensureCollection(client, "vaultrag_docs", 3);

    expect(result.created).toBe(false);
    expect(client.createCollection).not.toHaveBeenCalled();
  });

  it("accepts compatible existing payload indexes", async () => {
    const payloadSchema = {
      allowedRoles: { data_type: "keyword", points: 1 },
      minimumClearance: { data_type: "integer", points: 1 },
      branchId: { data_type: "keyword", points: 1 },
      clientId: { data_type: "keyword", points: 1 },
      dealId: { data_type: "keyword", points: 1 },
      classification: { data_type: "keyword", points: 1 },
      documentId: { data_type: "keyword", points: 1 },
      datasetId: { data_type: "keyword", points: 1 },
    } as Schemas["CollectionInfo"]["payload_schema"];
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
      getCollection: vi.fn().mockResolvedValue(collectionInfo(3, "Cosine", payloadSchema)),
      createPayloadIndex: vi.fn(),
    } as unknown as QdrantSetupClient;

    const result = await ensureCollection(client, "vaultrag_docs", 3);

    expect(result.indexesCreated).toEqual([]);
    expect(client.createPayloadIndex).not.toHaveBeenCalled();
  });

  it("fails on an incompatible clearance index without changing indexes", async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
      getCollection: vi.fn().mockResolvedValue(
        collectionInfo(3, "Cosine", {
          minimumClearance: { data_type: "keyword", points: 1 },
        }),
      ),
      createPayloadIndex: vi.fn(),
    } as unknown as QdrantSetupClient;

    await expect(ensureCollection(client, "vaultrag_docs", 3)).rejects.toThrow(
      /minimumClearance.*keyword.*integer/,
    );
    expect(client.createPayloadIndex).not.toHaveBeenCalled();
    expect(client.createCollection).not.toHaveBeenCalled();
  });

  it("fails on an incompatible keyword index", async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
      getCollection: vi.fn().mockResolvedValue(
        collectionInfo(3, "Cosine", {
          branchId: { data_type: "integer", points: 1 },
        }),
      ),
      createPayloadIndex: vi.fn(),
    } as unknown as QdrantSetupClient;

    await expect(ensureCollection(client, "vaultrag_docs", 3)).rejects.toThrow(
      /branchId.*integer.*keyword/,
    );
  });

  it("creates only indexes missing from a partial compatible schema", async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
      getCollection: vi.fn().mockResolvedValue(
        collectionInfo(3, "Cosine", {
          allowedRoles: { data_type: "keyword", points: 1 },
          minimumClearance: { data_type: "integer", points: 1 },
        }),
      ),
      createPayloadIndex: vi.fn().mockResolvedValue({ status: "completed" }),
    } as unknown as QdrantSetupClient;

    const result = await ensureCollection(client, "vaultrag_docs", 3);

    expect(result.indexesCreated).not.toContain("allowedRoles");
    expect(result.indexesCreated).not.toContain("minimumClearance");
    expect(result.indexesCreated).toContain("datasetId");
    expect(client.createPayloadIndex).toHaveBeenCalledTimes(6);
  });

  it("rejects incompatible vector dimension and distance", async () => {
    const dimensionClient = {
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
      getCollection: vi.fn().mockResolvedValue(collectionInfo(4)),
      createPayloadIndex: vi.fn(),
    } as unknown as QdrantSetupClient;
    const distanceClient = {
      ...dimensionClient,
      getCollection: vi.fn().mockResolvedValue(collectionInfo(3, "Dot")),
    } as unknown as QdrantSetupClient;

    await expect(ensureCollection(dimensionClient, "vaultrag_docs", 3)).rejects.toThrow(/dimension/i);
    await expect(ensureCollection(distanceClient, "vaultrag_docs", 3)).rejects.toThrow(/distance/i);
  });
});

describe("Qdrant point upserts", () => {
  it("preserves payloads and batches point writes", async () => {
    const client = {
      upsert: vi.fn().mockResolvedValue({ status: "completed" }),
    } as unknown as QdrantUpsertClient;
    const points = [point(1), point(2), point(3)];

    const result = await upsertPreparedPoints(
      client,
      "vaultrag_docs",
      points,
      3,
      2,
    );

    expect(result).toEqual({ pointsUpserted: 3, batchesCompleted: 2 });
    expect(client.upsert).toHaveBeenCalledTimes(2);
    expect(client.upsert).toHaveBeenNthCalledWith(1, "vaultrag_docs", {
      wait: true,
      points: points.slice(0, 2).map((point) => ({
        ...point,
        payload: { ...point.payload },
      })),
    });
    expect(points[0].payload).toEqual({
      ...payload,
      datasetId: SYNTHETIC_DATASET_ID,
    });
  });

  it("rejects invalid vector dimensions before any upsert", async () => {
    const client = { upsert: vi.fn() } as unknown as QdrantUpsertClient;

    await expect(
      upsertPreparedPoints(client, "vaultrag_docs", [point(1, [1, 2])], 3),
    ).rejects.toThrow(/invalid 2-dimensional vector/i);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("rejects non-finite vectors before any upsert", async () => {
    const client = { upsert: vi.fn() } as unknown as QdrantUpsertClient;

    await expect(
      upsertPreparedPoints(
        client,
        "vaultrag_docs",
        [point(1, [1, Number.NaN, 3])],
        3,
      ),
    ).rejects.toThrow(/finite values/i);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("does not expose credentials from a failed batch", async () => {
    const secret = "jina-secret-never-log";
    const client = {
      upsert: vi.fn().mockRejectedValue(new Error(`request used ${secret}`)),
    } as unknown as QdrantUpsertClient;

    const operation = upsertPreparedPoints(client, "vaultrag_docs", [point(1)], 3);
    await expect(operation).rejects.toThrow(/batch 1/);
    await expect(operation).rejects.not.toThrow(secret);
  });
});

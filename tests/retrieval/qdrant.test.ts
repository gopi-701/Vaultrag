import type { Schemas } from "@qdrant/js-client-rest";
import { describe, expect, it, vi } from "vitest";

import syntheticDocuments from "@/data/synthetic_docs.json";
import { chunkDocument } from "@/lib/retrieval/chunker";
import type { PreparedPoint } from "@/lib/retrieval/preparation";
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
    payload: { ...payload, allowedRoles: [...payload.allowedRoles] },
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
    expect(points[0].payload).toEqual(payload);
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
});

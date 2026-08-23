import { QdrantClient, type Schemas } from "@qdrant/js-client-rest";

import type { QdrantConfig } from "@/lib/env/qdrant";
import type { PreparedPoint } from "@/lib/retrieval/preparation";

const PAYLOAD_INDEXES = [
  ["allowedRoles", "keyword"],
  ["minimumClearance", "integer"],
  ["branchId", "keyword"],
  ["clientId", "keyword"],
  ["dealId", "keyword"],
  ["classification", "keyword"],
  ["documentId", "keyword"],
] as const satisfies ReadonlyArray<
  readonly [string, Schemas["PayloadSchemaType"]]
>;

export type QdrantSetupClient = Pick<
  QdrantClient,
  | "collectionExists"
  | "createCollection"
  | "getCollection"
  | "createPayloadIndex"
>;

export type QdrantUpsertClient = Pick<QdrantClient, "upsert">;

export interface CollectionSetupResult {
  created: boolean;
  indexesCreated: string[];
}

export interface UpsertResult {
  pointsUpserted: number;
  batchesCompleted: number;
}

export function createQdrantClient(config: QdrantConfig): QdrantClient {
  return new QdrantClient({
    url: config.url,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
}

function getUnnamedVectorConfig(
  collection: Schemas["CollectionInfo"],
): Schemas["VectorParams"] {
  const vectors = collection.config.params.vectors;

  if (
    !vectors ||
    typeof vectors !== "object" ||
    !("size" in vectors) ||
    typeof vectors.size !== "number" ||
    !("distance" in vectors)
  ) {
    throw new Error("Qdrant collection must use one unnamed dense vector");
  }

  return vectors as Schemas["VectorParams"];
}

export async function assertCollectionCompatible(
  client: Pick<QdrantClient, "getCollection">,
  collectionName: string,
  vectorDimension: number,
): Promise<Schemas["CollectionInfo"]> {
  const collection = await client.getCollection(collectionName);
  const vectors = getUnnamedVectorConfig(collection);

  if (vectors.size !== vectorDimension) {
    throw new Error(
      `Qdrant collection dimension ${vectors.size} does not match embedding dimension ${vectorDimension}`,
    );
  }

  if (vectors.distance !== "Cosine") {
    throw new Error(
      `Qdrant collection distance ${vectors.distance} must be Cosine`,
    );
  }

  return collection;
}

export async function ensureCollection(
  client: QdrantSetupClient,
  collectionName: string,
  vectorDimension: number,
): Promise<CollectionSetupResult> {
  const existence = await client.collectionExists(collectionName);
  let created = false;

  if (!existence.exists) {
    await client.createCollection(collectionName, {
      vectors: {
        size: vectorDimension,
        distance: "Cosine",
      },
    });
    created = true;
  }

  const collection = await assertCollectionCompatible(
    client,
    collectionName,
    vectorDimension,
  );
  const indexesCreated: string[] = [];

  for (const [fieldName, fieldSchema] of PAYLOAD_INDEXES) {
    if (collection.payload_schema[fieldName]) continue;

    await client.createPayloadIndex(collectionName, {
      field_name: fieldName,
      field_schema: fieldSchema,
      wait: true,
    });
    indexesCreated.push(fieldName);
  }

  return { created, indexesCreated };
}

function validatePoints(
  points: readonly PreparedPoint[],
  vectorDimension: number,
) {
  const ids = new Set<string>();

  for (const point of points) {
    if (ids.has(point.id)) {
      throw new Error(`Duplicate deterministic point ID: ${point.id}`);
    }
    ids.add(point.id);

    if (
      point.vector.length !== vectorDimension ||
      point.vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Point ${point.id} has an invalid ${point.vector.length}-dimensional vector; expected ${vectorDimension} finite values`,
      );
    }
  }
}

export async function upsertPreparedPoints(
  client: QdrantUpsertClient,
  collectionName: string,
  points: readonly PreparedPoint[],
  vectorDimension: number,
  batchSize = 64,
): Promise<UpsertResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Qdrant upsert batch size must be a positive integer");
  }

  validatePoints(points, vectorDimension);
  let batchesCompleted = 0;

  for (let offset = 0; offset < points.length; offset += batchSize) {
    const batch = points.slice(offset, offset + batchSize);
    const qdrantPoints: Schemas["PointStruct"][] = batch.map((point) => ({
      id: point.id,
      vector: point.vector,
      payload: { ...point.payload },
    }));

    try {
      await client.upsert(collectionName, {
        wait: true,
        points: qdrantPoints,
      });
      batchesCompleted += 1;
    } catch (error) {
      throw new Error(
        `Qdrant upsert failed for batch ${batchesCompleted + 1} containing ${batch.length} points`,
        { cause: error },
      );
    }
  }

  return {
    pointsUpserted: points.length,
    batchesCompleted,
  };
}

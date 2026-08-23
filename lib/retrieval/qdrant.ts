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
  ["datasetId", "keyword"],
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
export type QdrantQueryClient = Pick<QdrantClient, "query">;
export type QdrantReconciliationClient = Pick<
  QdrantClient,
  "scroll" | "delete"
>;

export interface CollectionSetupResult {
  created: boolean;
  indexesCreated: string[];
}

export interface UpsertResult {
  pointsUpserted: number;
  batchesCompleted: number;
}

export interface ReconciliationResult {
  stalePointsDeleted: number;
  deleteBatchesCompleted: number;
}

export interface AuthorizedPointQuery {
  vector: readonly number[];
  filter: Schemas["Filter"];
  limit: number;
}

export function createQdrantClient(config: QdrantConfig): QdrantClient {
  return new QdrantClient({
    url: config.url,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
}

export async function queryAuthorizedPoints(
  client: QdrantQueryClient,
  collectionName: string,
  request: AuthorizedPointQuery,
): Promise<Schemas["ScoredPoint"][]> {
  try {
    const response = await client.query(collectionName, {
      query: [...request.vector],
      filter: request.filter,
      limit: request.limit,
      with_payload: true,
      with_vector: false,
    });

    return response.points;
  } catch {
    throw new Error("Authorized Qdrant query failed");
  }
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
    const existingIndex = collection.payload_schema[fieldName];

    if (existingIndex && existingIndex.data_type !== fieldSchema) {
      throw new Error(
        `Qdrant payload index "${fieldName}" has type ${existingIndex.data_type}; expected ${fieldSchema}`,
      );
    }
  }

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
    } catch {
      throw new Error(
        `Qdrant upsert failed for batch ${batchesCompleted + 1} containing ${batch.length} points`,
      );
    }
  }

  return {
    pointsUpserted: points.length,
    batchesCompleted,
  };
}

export async function reconcileDatasetPoints(
  client: QdrantReconciliationClient,
  collectionName: string,
  datasetId: string,
  desiredPointIds: ReadonlySet<string>,
  batchSize = 256,
): Promise<ReconciliationResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Qdrant reconciliation batch size must be a positive integer");
  }

  const existingIds: Schemas["ExtendedPointId"][] = [];
  let offset: Schemas["ExtendedPointId"] | undefined;

  do {
    let page: Awaited<ReturnType<QdrantReconciliationClient["scroll"]>>;

    try {
      page = await client.scroll(collectionName, {
        filter: {
          must: [{ key: "datasetId", match: { value: datasetId } }],
        },
        limit: batchSize,
        ...(offset !== undefined ? { offset } : {}),
        with_payload: false,
        with_vector: false,
      });
    } catch {
      throw new Error("Qdrant synthetic dataset reconciliation scan failed");
    }

    existingIds.push(...page.points.map((point) => point.id));
    offset =
      typeof page.next_page_offset === "string" ||
      typeof page.next_page_offset === "number"
        ? page.next_page_offset
        : undefined;
  } while (offset !== undefined);

  const staleIds = existingIds.filter(
    (id) => typeof id !== "string" || !desiredPointIds.has(id),
  );
  let deleteBatchesCompleted = 0;

  for (let start = 0; start < staleIds.length; start += batchSize) {
    const batch = staleIds.slice(start, start + batchSize);

    try {
      await client.delete(collectionName, {
        wait: true,
        points: batch,
      });
      deleteBatchesCompleted += 1;
    } catch {
      throw new Error(
        `Qdrant stale-point cleanup failed for batch ${deleteBatchesCompleted + 1} containing ${batch.length} points`,
      );
    }
  }

  return {
    stalePointsDeleted: staleIds.length,
    deleteBatchesCompleted,
  };
}

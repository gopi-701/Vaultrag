import "server-only";

import type { Schemas } from "@qdrant/js-client-rest";
import { z } from "zod";

import {
  ClearanceLevelSchema,
  RoleSchema,
  type VerifiedUserClaims,
} from "@/lib/auth/claims";
import {
  getPersona,
  type GuestPrincipal,
} from "@/lib/auth/personas";
import { compileAuthorizationFilter } from "@/lib/authorization";
import { getQdrantConfig } from "@/lib/env/qdrant";
import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { embedQueries } from "@/lib/retrieval/embeddings";
import {
  createQdrantClient,
  queryAuthorizedPoints,
  type QdrantQueryClient,
} from "@/lib/retrieval/qdrant";
import {
  SYNTHETIC_DATASET_ID,
  type PreparedPointPayload,
} from "@/lib/retrieval/preparation";
import { DocumentClassificationSchema } from "@/lib/schemas/bankingDocument";

const SearchPayloadSchema = z.object({
  datasetId: z.literal(SYNTHETIC_DATASET_ID),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  docType: z.string().min(1),
  allowedRoles: z.array(RoleSchema),
  minimumClearance: ClearanceLevelSchema,
  classification: DocumentClassificationSchema,
  branchId: z.string().min(1).nullable(),
  clientId: z.string().min(1).nullable(),
  dealId: z.string().min(1).nullable(),
  chunkIndex: z.number().int().nonnegative(),
  text: z.string().trim().min(1),
});

export const AuthorizedSearchResultSchema = z
  .object({
    chunkId: z.string().min(1),
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    text: z.string().trim().min(1),
    classification: DocumentClassificationSchema,
    similarityScore: z.number().finite(),
    chunkIndex: z.number().int().nonnegative(),
    metadata: z
      .object({
        docType: z.string().min(1),
        allowedRoles: z.array(RoleSchema),
        minimumClearance: ClearanceLevelSchema,
        branchId: z.string().min(1).nullable(),
        clientId: z.string().min(1).nullable(),
        dealId: z.string().min(1).nullable(),
        datasetId: z.literal(SYNTHETIC_DATASET_ID),
      })
      .strict(),
  })
  .strict();

export type AuthorizedSearchResultData = z.infer<
  typeof AuthorizedSearchResultSchema
>;

declare const authorizedSearchResultBrand: unique symbol;
export type AuthorizedSearchResult = AuthorizedSearchResultData & {
  readonly [authorizedSearchResultBrand]: true;
};

export type RetrievalPrincipal = VerifiedUserClaims | GuestPrincipal;

export interface AuthorizedSearchInput {
  query: string;
  user: RetrievalPrincipal;
  limit?: number;
}

export interface AuthorizedSearchDependencies {
  client: QdrantQueryClient;
  collectionName: string;
  embeddingService: Pick<EmbeddingService, "embedQueries">;
  now?: () => number;
}

export type AuthorizedSearchMetadata = Pick<
  PreparedPointPayload,
  | "docType"
  | "allowedRoles"
  | "minimumClearance"
  | "branchId"
  | "clientId"
  | "dealId"
  | "datasetId"
>;

export interface AuthorizedSearchResponse {
  results: AuthorizedSearchResult[];
  debug: {
    filter: Schemas["Filter"];
    topK: number;
    retrievalLatencyMs: number;
  };
}

function defaultDependencies(): AuthorizedSearchDependencies {
  const qdrant = getQdrantConfig();

  return {
    client: createQdrantClient(qdrant),
    collectionName: qdrant.collection,
    embeddingService: { embedQueries },
  };
}

function validatePrincipal(user: RetrievalPrincipal): RetrievalPrincipal {
  if (user.role === null) {
    const guest = getPersona("guest");

    if (
      user.personaId !== guest.personaId ||
      user.clearanceLevel !== guest.clearanceLevel ||
      user.branchIds.length !== 0 ||
      user.clientIds.length !== 0 ||
      user.dealIds.length !== 0
    ) {
      throw new Error("Guest retrieval must use the canonical guest principal");
    }

    return guest;
  }

  return user;
}

function normalizePoint(point: Schemas["ScoredPoint"]): AuthorizedSearchResult {
  const payload = SearchPayloadSchema.parse(point.payload);

  const normalized: AuthorizedSearchResultData = {
    chunkId: String(point.id),
    documentId: payload.documentId,
    documentTitle: payload.documentTitle,
    text: payload.text,
    classification: payload.classification,
    similarityScore: point.score,
    chunkIndex: payload.chunkIndex,
    metadata: {
      docType: payload.docType,
      allowedRoles: payload.allowedRoles,
      minimumClearance: payload.minimumClearance,
      branchId: payload.branchId,
      clientId: payload.clientId,
      dealId: payload.dealId,
      datasetId: payload.datasetId,
    },
  };

  // This is the sole authorization-result branding point. Qdrant has already
  // applied the compiled authorization filter before returning this point, and
  // SearchPayloadSchema has strictly validated its payload above.
  return normalized as AuthorizedSearchResult;
}

export async function searchAuthorizedDocuments(
  input: AuthorizedSearchInput,
  dependencies: AuthorizedSearchDependencies = defaultDependencies(),
): Promise<AuthorizedSearchResponse> {
  const query = input.query.trim();
  if (!query) throw new Error("Retrieval query must not be empty");

  const topK = input.limit ?? 8;
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) {
    throw new Error("Retrieval limit must be an integer from 1 to 100");
  }

  const user = validatePrincipal(input.user);
  const authorizationFilter = compileAuthorizationFilter(user);
  const filter: Schemas["Filter"] = {
    must: [
      authorizationFilter,
      {
        key: "datasetId",
        match: { value: SYNTHETIC_DATASET_ID },
      },
    ],
  };
  const [queryVector] = await dependencies.embeddingService.embedQueries([
    query,
  ]);

  if (!queryVector) {
    throw new Error("Query embedding did not return a vector");
  }

  const now = dependencies.now ?? performance.now.bind(performance);
  const startedAt = now();
  const points = await queryAuthorizedPoints(
    dependencies.client,
    dependencies.collectionName,
    { vector: queryVector, filter, limit: topK },
  );
  const retrievalLatencyMs = Math.max(0, now() - startedAt);

  return {
    results: points.map(normalizePoint),
    debug: { filter, topK, retrievalLatencyMs },
  };
}

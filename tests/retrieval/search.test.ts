import type { Schemas } from "@qdrant/js-client-rest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import syntheticDocuments from "@/data/synthetic_docs.json";
import type {
  PersonaId,
  UserClaims,
  VerifiedUserClaims,
} from "@/lib/auth/claims";
import { createClaimsForPersona, getPersona } from "@/lib/auth/personas";
import { signToken } from "@/lib/auth/signToken";
import { verifyToken } from "@/lib/auth/verifyToken";
import { compileAuthorizationFilter } from "@/lib/authorization";
import { chunkDocument } from "@/lib/retrieval/chunker";
import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import { SYNTHETIC_DATASET_ID } from "@/lib/retrieval/preparation";
import type { QdrantQueryClient } from "@/lib/retrieval/qdrant";
import {
  searchAuthorizedDocuments,
  type AuthorizedSearchInput,
  type AuthorizedSearchDependencies,
  type RetrievalPrincipal,
} from "@/lib/retrieval/search";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

type Condition = Schemas["Condition"];
type Filter = Schemas["Filter"];
type Payload = Record<string, unknown>;

const TEST_SECRET = "retrieval-test-secret-that-is-at-least-32-characters";
const documents = BankingDocumentCollectionSchema.parse(syntheticDocuments);
const candidateIds = [
  "PUB-FAQ-001",
  "RTL-NYC-001",
  "RTL-LON-001",
  "WLT-8832-002",
  "WLT-9911-002",
  "CRD-SFO-001",
  "CRD-LON-002",
  "IB-APL-002",
  "IB-ATL-002",
  "IB-APL-003",
  "CMP-AUD-001",
];

const candidatePoints: Schemas["ScoredPoint"][] = candidateIds.map(
  (documentId, index) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new Error(`Missing fixture ${documentId}`);
    const chunk = chunkDocument(document)[0];

    return {
      id: `00000000-0000-5000-a000-${String(index).padStart(12, "0")}`,
      version: 1,
      score: 1 - index / 100,
      payload: { ...chunk, datasetId: SYNTHETIC_DATASET_ID },
    };
  },
);

function isFilter(condition: Condition): condition is Filter {
  return "must" in condition || "should" in condition || "must_not" in condition;
}

function conditions(value: Filter["must"] | Filter["should"]): Condition[] {
  if (!value) return [];
  return Array.isArray(value) ? (value as Condition[]) : [value as Condition];
}

function matchesCondition(condition: Condition, payload: Payload): boolean {
  if (isFilter(condition)) return matchesFilter(condition, payload);

  if (
    "is_null" in condition &&
    condition.is_null &&
    typeof condition.is_null === "object" &&
    "key" in condition.is_null
  ) {
    return payload[String(condition.is_null.key)] === null;
  }

  if (!("key" in condition)) throw new Error("Unsupported condition in mock");
  const value = payload[condition.key];

  if (condition.match && "value" in condition.match) {
    return Array.isArray(value)
      ? value.includes(condition.match.value)
      : value === condition.match.value;
  }

  if (condition.match && "any" in condition.match) {
    return Array.isArray(condition.match.any) && condition.match.any.includes(value as never);
  }

  if (condition.range && "lte" in condition.range) {
    return typeof value === "number" &&
      typeof condition.range.lte === "number" &&
      value <= condition.range.lte;
  }

  throw new Error("Unsupported field condition in mock");
}

function matchesFilter(filter: Filter, payload: Payload): boolean {
  const must = conditions(filter.must).every((condition) =>
    matchesCondition(condition, payload),
  );
  const should = conditions(filter.should);
  const shouldMatch = should.length === 0 || should.some((condition) =>
    matchesCondition(condition, payload),
  );
  const mustNot = conditions(filter.must_not).some((condition) =>
    matchesCondition(condition, payload),
  );

  return must && shouldMatch && !mustNot;
}

function verifiedClaims(
  personaId: Exclude<PersonaId, "guest">,
): VerifiedUserClaims {
  return verifyToken(signToken(createClaimsForPersona(personaId)));
}

function dependencies(points = candidatePoints) {
  const embeddingService: Pick<EmbeddingService, "embedQueries"> = {
    embedQueries: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  };
  const client = {
    query: vi.fn(async (_collection: string, request: Schemas["QueryRequest"]) => ({
      points: points
        .filter((point) => matchesFilter(request.filter as Filter, point.payload as Payload))
        .slice(0, request.limit ?? 10),
    })),
  } as unknown as QdrantQueryClient;
  const clock = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(107.5);

  return {
    dependencies: {
      client,
      collectionName: "vaultrag_docs",
      embeddingService,
      now: clock,
    } satisfies AuthorizedSearchDependencies,
    client,
    embeddingService,
  };
}

async function search(user: RetrievalPrincipal, limit = 20) {
  const context = dependencies();
  const response = await searchAuthorizedDocuments(
    { query: "synthetic valuation portfolio credit controls", user, limit },
    context.dependencies,
  );

  return { ...context, response };
}

function resultIds(response: Awaited<ReturnType<typeof search>>["response"]) {
  return response.results.map((result) => result.documentId);
}

describe("authorized retrieval", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("puts retail role, NYC scope, and internal clearance in the Qdrant query", async () => {
    const user = verifiedClaims("retail_banker");
    const { client, embeddingService, response } = await search(user);
    const expected = compileAuthorizationFilter(user);
    const [, request] = vi.mocked(client.query).mock.calls[0];

    expect(embeddingService.embedQueries).toHaveBeenCalledWith([
      "synthetic valuation portfolio credit controls",
    ]);
    expect((request.filter as Filter).must).toEqual([
      expected,
      {
        key: "datasetId",
        match: { value: SYNTHETIC_DATASET_ID },
      },
    ]);
    expect(JSON.stringify(request.filter)).toContain("retail_banker");
    expect(JSON.stringify(request.filter)).toContain("NYC-01");
    expect(JSON.stringify(request.filter)).toContain('"lte":1');
    expect(request.with_payload).toBe(true);
    expect(request.with_vector).toBe(false);
    expect(response.debug).toEqual({
      authorizationPrefilterApplied: true,
      filter: request.filter,
      topK: 20,
      retrievalLatencyMs: 7.5,
    });
  });

  it("isolates retail bankers from Apollo and non-NYC records", async () => {
    const { response } = await search(verifiedClaims("retail_banker"));
    expect(resultIds(response)).toContain("RTL-NYC-001");
    expect(resultIds(response)).not.toContain("RTL-LON-001");
    expect(resultIds(response)).not.toContain("IB-APL-002");
  });

  it("isolates a wealth manager to CUST-8832", async () => {
    const { response } = await search(verifiedClaims("wealth_manager"));
    expect(resultIds(response)).toContain("WLT-8832-002");
    expect(resultIds(response)).not.toContain("WLT-9911-002");
  });

  it("allows qualifying confidential credit records across branches", async () => {
    const { response } = await search(verifiedClaims("credit_analyst"));
    expect(resultIds(response)).toEqual(
      expect.arrayContaining(["CRD-SFO-001", "CRD-LON-002"]),
    );
    expect(resultIds(response)).not.toContain("IB-APL-002");
  });

  it("isolates an investment banker to PROJECT_APOLLO", async () => {
    const { response } = await search(verifiedClaims("investment_banker"));
    expect(resultIds(response)).toContain("IB-APL-002");
    expect(resultIds(response)).not.toContain("IB-ATL-002");
  });

  it("constrains the canonical guest to public information", async () => {
    const { client, response } = await search(getPersona("guest"));
    const [, request] = vi.mocked(client.query).mock.calls[0];

    expect(resultIds(response)).toEqual(["PUB-FAQ-001"]);
    expect(JSON.stringify(request.filter)).toContain(
      '"minimumClearance","match":{"value":0}',
    );
  });

  it("derives compliance access from claims and explicit document roles", async () => {
    const user = verifiedClaims("compliance_officer");
    const { client, response } = await search(user);
    const [, request] = vi.mocked(client.query).mock.calls[0];

    expect(JSON.stringify(request.filter)).toContain("compliance_officer");
    expect(resultIds(response)).toEqual(
      expect.arrayContaining(["IB-APL-003", "CMP-AUD-001"]),
    );
    expect(resultIds(response)).not.toContain("IB-APL-002");
  });

  it("normalizes exactly the filtered Qdrant hits without post-search overfetching", async () => {
    const point = candidatePoints.find((item) => item.payload?.documentId === "IB-APL-002");
    if (!point) throw new Error("Missing Apollo point");
    const context = dependencies([point]);
    const response = await searchAuthorizedDocuments(
      { query: "Apollo valuation", user: verifiedClaims("investment_banker"), limit: 1 },
      context.dependencies,
    );
    const [, request] = vi.mocked(context.client.query).mock.calls[0];

    expect(request.limit).toBe(1);
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      documentId: "IB-APL-002",
      classification: "RESTRICTED",
      similarityScore: point.score,
      metadata: { dealId: "PROJECT_APOLLO" },
    });
  });

  it("accepts employee claims produced by JWT verification", async () => {
    const context = dependencies();
    const user: VerifiedUserClaims = verifyToken(
      signToken(createClaimsForPersona("retail_banker")),
    );

    await expect(
      searchAuthorizedDocuments(
        { query: "credit policy", user },
        context.dependencies,
      ),
    ).resolves.toBeDefined();
    expect(context.embeddingService.embedQueries).toHaveBeenCalledOnce();
    expect(context.client.query).toHaveBeenCalledOnce();
  });

  it("excludes plain, forged, and unsigned employee claims from the API type", () => {
    const context = dependencies();
    const now = Math.floor(Date.now() / 1000);
    const plainClaims: UserClaims = {
      sub: "plain",
      role: "retail_banker",
      branchIds: ["NYC-01"],
      clientIds: [],
      dealIds: [],
      clearanceLevel: 1,
      iat: now,
      exp: now + 900,
    };
    const forgedClaims: UserClaims = {
      sub: "forged",
      role: "compliance_officer",
      branchIds: ["ALL"],
      clientIds: ["ALL"],
      dealIds: ["ALL"],
      clearanceLevel: 4,
      iat: 1,
      exp: 9_999_999_999,
    };
    const plainInput: AuthorizedSearchInput = {
      query: "credit policy",
      // @ts-expect-error Plain structurally valid claims lack the private brand.
      user: plainClaims,
    };
    const forgedInput: AuthorizedSearchInput = {
      query: "audit records",
      // @ts-expect-error Complete forged claims lack the private brand.
      user: forgedClaims,
    };
    const unsignedPersonaInput: AuthorizedSearchInput = {
      query: "branch policy",
      // @ts-expect-error Employee persona metadata is not verified JWT claims.
      user: getPersona("retail_banker"),
    };

    // These inputs are never sent to retrieval. The expected TypeScript errors
    // above prove that the supported API rejects all three at compile time.
    expect([plainInput, forgedInput, unsignedPersonaInput]).toHaveLength(3);
    expect(context.embeddingService.embedQueries).not.toHaveBeenCalled();
    expect(context.client.query).not.toHaveBeenCalled();
  });
});

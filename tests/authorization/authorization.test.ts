import type { Schemas } from "@qdrant/js-client-rest";
import { describe, expect, it } from "vitest";

import { getPersona } from "@/lib/auth/personas";
import {
  compileAuthorizationFilter,
  evaluateDocumentAccess,
  type AuthorizationPrincipal,
  type DocumentMetadata,
} from "@/lib/authorization";

type Condition = Schemas["Condition"];
type Filter = Schemas["Filter"];

const baseDocument: DocumentMetadata = {
  documentId: "DOC-001",
  documentTitle: "Test document",
  docType: "memo",
  allowedRoles: ["retail_banker"],
  minimumClearance: 1,
  branchId: null,
  clientId: null,
  dealId: null,
  classification: "INTERNAL",
  chunkIndex: 0,
};

function document(
  overrides: Partial<DocumentMetadata> = {},
): DocumentMetadata {
  return { ...baseDocument, ...overrides };
}

function isFilter(condition: Condition): condition is Filter {
  return "must" in condition || "should" in condition || "must_not" in condition;
}

function matchesCondition(
  condition: Condition,
  metadata: DocumentMetadata,
): boolean {
  if (isFilter(condition)) {
    return matchesFilter(condition, metadata);
  }

  if (
    "is_null" in condition &&
    condition.is_null &&
    typeof condition.is_null === "object" &&
    "key" in condition.is_null
  ) {
    return metadata[condition.is_null.key as keyof DocumentMetadata] === null;
  }

  if (!("key" in condition)) {
    throw new Error("Unsupported test filter condition");
  }

  const value = metadata[condition.key as keyof DocumentMetadata];

  if (condition.match && "value" in condition.match) {
    return Array.isArray(value)
      ? value.includes(condition.match.value as never)
      : value === condition.match.value;
  }

  if (
    condition.match &&
    "any" in condition.match &&
    Array.isArray(condition.match.any)
  ) {
    return (condition.match.any as unknown[]).includes(value);
  }

  if (condition.range && "lte" in condition.range) {
    return (
      typeof value === "number" &&
      typeof condition.range.lte === "number" &&
      value <= condition.range.lte
    );
  }

  throw new Error("Unsupported test field condition");
}

function conditions(value: Filter["must"] | Filter["should"]): Condition[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as Condition[];
  return [value as Condition];
}

function matchesFilter(
  filter: Filter,
  metadata: DocumentMetadata,
): boolean {
  const mustMatch = conditions(filter.must).every((condition) =>
    matchesCondition(condition, metadata),
  );
  const should = conditions(filter.should);
  const shouldMatch =
    should.length === 0 || should.some((condition) => matchesCondition(condition, metadata));
  const mustNotMatch = conditions(filter.must_not).some((condition) =>
    matchesCondition(condition, metadata),
  );

  return mustMatch && shouldMatch && !mustNotMatch;
}

const scenarios: Array<{
  name: string;
  principal: AuthorizationPrincipal;
  metadata: DocumentMetadata;
  allowed: boolean;
}> = [
  {
    name: "retail banker can access an NYC internal document",
    principal: getPersona("retail_banker"),
    metadata: document({ branchId: "NYC-01" }),
    allowed: true,
  },
  {
    name: "retail banker cannot access another branch",
    principal: getPersona("retail_banker"),
    metadata: document({ branchId: "LON-01" }),
    allowed: false,
  },
  {
    name: "retail banker cannot access Project Apollo",
    principal: getPersona("retail_banker"),
    metadata: document({ dealId: "PROJECT_APOLLO" }),
    allowed: false,
  },
  {
    name: "retail banker cannot access confidential content",
    principal: getPersona("retail_banker"),
    metadata: document({ minimumClearance: 2 }),
    allowed: false,
  },
  {
    name: "wealth manager can access their client document",
    principal: getPersona("wealth_manager"),
    metadata: document({
      allowedRoles: ["wealth_manager"],
      minimumClearance: 2,
      clientId: "CUST-8832",
    }),
    allowed: true,
  },
  {
    name: "wealth manager cannot access another client document",
    principal: getPersona("wealth_manager"),
    metadata: document({
      allowedRoles: ["wealth_manager"],
      minimumClearance: 2,
      clientId: "CUST-9999",
    }),
    allowed: false,
  },
  {
    name: "credit analyst can access confidential credit content across branches",
    principal: getPersona("credit_analyst"),
    metadata: document({
      docType: "credit_report",
      allowedRoles: ["credit_analyst"],
      minimumClearance: 2,
      branchId: "SFO-02",
    }),
    allowed: true,
  },
  {
    name: "credit analyst cannot access restricted Apollo content",
    principal: getPersona("credit_analyst"),
    metadata: document({
      allowedRoles: ["credit_analyst", "investment_banker"],
      minimumClearance: 3,
      dealId: "PROJECT_APOLLO",
    }),
    allowed: false,
  },
  {
    name: "investment banker can access restricted Apollo content",
    principal: getPersona("investment_banker"),
    metadata: document({
      allowedRoles: ["investment_banker"],
      minimumClearance: 3,
      dealId: "PROJECT_APOLLO",
    }),
    allowed: true,
  },
  {
    name: "investment banker cannot access another deal",
    principal: getPersona("investment_banker"),
    metadata: document({
      allowedRoles: ["investment_banker"],
      minimumClearance: 3,
      dealId: "PROJECT_ORION",
    }),
    allowed: false,
  },
  {
    name: "compliance officer can access audit content through policy attributes",
    principal: getPersona("compliance_officer"),
    metadata: document({
      allowedRoles: ["compliance_officer"],
      minimumClearance: 4,
      branchId: "LON-01",
      clientId: "CUST-9999",
      dealId: "PROJECT_ORION",
      classification: "AUDIT",
    }),
    allowed: true,
  },
  {
    name: "guest can access a public document",
    principal: getPersona("guest"),
    metadata: document({ allowedRoles: [], minimumClearance: 0 }),
    allowed: true,
  },
  {
    name: "guest cannot access an internal document",
    principal: getPersona("guest"),
    metadata: document(),
    allowed: false,
  },
  {
    name: "null constraints do not restrict access",
    principal: getPersona("wealth_manager"),
    metadata: document({
      allowedRoles: ["wealth_manager"],
      minimumClearance: 2,
      branchId: null,
      clientId: null,
      dealId: null,
    }),
    allowed: true,
  },
  {
    name: "document branch ALL is available without a matching branch",
    principal: getPersona("wealth_manager"),
    metadata: document({
      allowedRoles: ["wealth_manager"],
      minimumClearance: 2,
      branchId: "ALL",
    }),
    allowed: true,
  },
  {
    name: "ALL user scopes cover branch, client, and deal values",
    principal: getPersona("compliance_officer"),
    metadata: document({
      allowedRoles: ["compliance_officer"],
      minimumClearance: 4,
      branchId: "ANY-BRANCH",
      clientId: "ANY-CLIENT",
      dealId: "ANY-DEAL",
    }),
    allowed: true,
  },
  {
    name: "clearance hierarchy allows higher clearance to access lower levels",
    principal: getPersona("investment_banker"),
    metadata: document({
      allowedRoles: ["investment_banker"],
      minimumClearance: 2,
    }),
    allowed: true,
  },
];

describe("deterministic authorization policy", () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const decision = evaluateDocumentAccess(
        scenario.principal,
        scenario.metadata,
      );

      expect(decision.allowed).toBe(scenario.allowed);
      expect(decision.reasons.length === 0).toBe(scenario.allowed);
    });
  }

  it("does not grant compliance access through a role bypass", () => {
    const decision = evaluateDocumentAccess(
      getPersona("compliance_officer"),
      document({
        allowedRoles: ["investment_banker"],
        minimumClearance: 4,
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(
      "Role compliance_officer is not allowed",
    );
  });

  it("compiles the expected Qdrant metadata gates", () => {
    expect(compileAuthorizationFilter(getPersona("retail_banker"))).toEqual({
      must: [
        { key: "minimumClearance", range: { lte: 1 } },
        {
          should: [
            { key: "minimumClearance", match: { value: 0 } },
            { key: "allowedRoles", match: { value: "retail_banker" } },
          ],
        },
        {
          should: [
            { is_null: { key: "branchId" } },
            { key: "branchId", match: { value: "ALL" } },
            { key: "branchId", match: { any: ["NYC-01"] } },
          ],
        },
        { should: [{ is_null: { key: "clientId" } }] },
        { should: [{ is_null: { key: "dealId" } }] },
      ],
    });
  });

  it.each(scenarios)(
    "keeps the Qdrant filter aligned: $name",
    ({ principal, metadata }) => {
      const decision = evaluateDocumentAccess(principal, metadata);
      const filterMatches = matchesFilter(
        compileAuthorizationFilter(principal),
        metadata,
      );

      expect(filterMatches).toBe(decision.allowed);
    },
  );
});

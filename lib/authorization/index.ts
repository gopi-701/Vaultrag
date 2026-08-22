import type { Schemas } from "@qdrant/js-client-rest";

import type { Role, UserClaims } from "@/lib/auth/claims";
import type { SafePersonaMetadata } from "@/lib/auth/personas";

export interface DocumentMetadata {
  documentId: string;
  documentTitle: string;
  docType: string;
  allowedRoles: Role[];
  minimumClearance: number;
  branchId: string | null;
  clientId: string | null;
  dealId: string | null;
  classification: string;
  chunkIndex: number;
}

export interface AccessDecision {
  allowed: boolean;
  reasons: string[];
}

export type AuthorizationPrincipal =
  | Pick<
      UserClaims,
      "role" | "clearanceLevel" | "branchIds" | "clientIds" | "dealIds"
    >
  | SafePersonaMetadata;

type Filter = Schemas["Filter"];
type Condition = Schemas["Condition"];
type ScopeField = "branchId" | "clientId" | "dealId";

type PolicyClause =
  | {
      kind: "clearance";
      maximum: number;
      publicOnly: boolean;
    }
  | {
      kind: "role";
      role: Role;
    }
  | {
      kind: "scope";
      field: ScopeField;
      values: readonly string[];
      documentAllAllowed: boolean;
    };

function buildPolicy(userClaims: AuthorizationPrincipal): PolicyClause[] {
  const isGuest = userClaims.role === null;
  const clauses: PolicyClause[] = [
    {
      kind: "clearance",
      maximum: userClaims.clearanceLevel,
      publicOnly: isGuest,
    },
  ];

  if (userClaims.role !== null) {
    clauses.push({ kind: "role", role: userClaims.role });
  }

  const scopes = [
    {
      field: "branchId",
      values: userClaims.branchIds,
      documentAllAllowed: true,
    },
    {
      field: "clientId",
      values: userClaims.clientIds,
      documentAllAllowed: false,
    },
    {
      field: "dealId",
      values: userClaims.dealIds,
      documentAllAllowed: false,
    },
  ] as const;

  for (const scope of scopes) {
    if (!scope.values.includes("ALL")) {
      clauses.push({ kind: "scope", ...scope });
    }
  }

  return clauses;
}

function scopeFilter(clause: Extract<PolicyClause, { kind: "scope" }>): Filter {
  const should: Condition[] = [
    { is_null: { key: clause.field } },
  ];

  if (clause.documentAllAllowed) {
    should.push({ key: clause.field, match: { value: "ALL" } });
  }

  if (clause.values.length > 0) {
    should.push({ key: clause.field, match: { any: [...clause.values] } });
  }

  return { should };
}

function compileClause(clause: PolicyClause): Condition {
  switch (clause.kind) {
    case "clearance":
      return clause.publicOnly
        ? { key: "minimumClearance", match: { value: 0 } }
        : {
            key: "minimumClearance",
            range: { lte: clause.maximum },
          };
    case "role":
      return {
        should: [
          { key: "minimumClearance", match: { value: 0 } },
          { key: "allowedRoles", match: { value: clause.role } },
        ],
      };
    case "scope":
      return scopeFilter(clause);
  }
}

function evaluateClause(
  clause: PolicyClause,
  document: DocumentMetadata,
): string | null {
  switch (clause.kind) {
    case "clearance":
      if (clause.publicOnly) {
        return document.minimumClearance === 0
          ? null
          : "Guest access is limited to public documents";
      }

      return document.minimumClearance <= clause.maximum
        ? null
        : `Requires clearance ${document.minimumClearance}; user has ${clause.maximum}`;
    case "role":
      return document.minimumClearance === 0 ||
        document.allowedRoles.includes(clause.role)
        ? null
        : `Role ${clause.role} is not allowed`;
    case "scope": {
      const documentValue = document[clause.field];
      const allowed =
        documentValue === null ||
        (clause.documentAllAllowed && documentValue === "ALL") ||
        clause.values.includes(documentValue);

      return allowed
        ? null
        : `${clause.field} ${documentValue} is outside the user's scope`;
    }
  }
}

export function compileAuthorizationFilter(
  userClaims: AuthorizationPrincipal,
): Filter {
  return {
    must: buildPolicy(userClaims).map(compileClause),
  };
}

export function evaluateDocumentAccess(
  userClaims: AuthorizationPrincipal,
  documentMetadata: DocumentMetadata,
): AccessDecision {
  const reasons = buildPolicy(userClaims)
    .map((clause) => evaluateClause(clause, documentMetadata))
    .filter((reason): reason is string => reason !== null);

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

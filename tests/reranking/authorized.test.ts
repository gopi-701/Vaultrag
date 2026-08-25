import { describe, expect, it } from "vitest";

import { rerankAuthorizedCandidates } from "@/lib/reranking/authorized";
import { SYNTHETIC_DATASET_ID } from "@/lib/retrieval/preparation";
import {
  AuthorizedSearchResultSchema,
  type AuthorizedSearchResultData,
} from "@/lib/retrieval/search";

function compileTimeProvenanceAssertions(
  plain: AuthorizedSearchResultData,
  parsed: AuthorizedSearchResultData,
  forgedApollo: AuthorizedSearchResultData,
) {
  // @ts-expect-error Plain structural data lacks the private retrieval brand.
  void rerankAuthorizedCandidates("query", [plain], 1);
  // @ts-expect-error Schema parsing validates data but does not add provenance.
  void rerankAuthorizedCandidates("query", [parsed], 1);
  // @ts-expect-error A forged restricted candidate lacks the retrieval brand.
  void rerankAuthorizedCandidates("query", [forgedApollo], 1);
}

function candidate(
  overrides: Partial<AuthorizedSearchResultData> = {},
): AuthorizedSearchResultData {
  return {
    chunkId: "plain-chunk",
    documentId: "PLAIN-DOC",
    documentTitle: "Plain structural document",
    text: "Structurally valid but not produced by secure retrieval.",
    classification: "PUBLIC",
    similarityScore: 0.5,
    chunkIndex: 0,
    metadata: {
      docType: "PUBLIC_FAQ",
      allowedRoles: [],
      minimumClearance: 0,
      branchId: null,
      clientId: null,
      dealId: null,
      datasetId: SYNTHETIC_DATASET_ID,
    },
    ...overrides,
  };
}

describe("authorized candidate provenance boundary", () => {
  it("keeps structural, parsed, and forged data outside the typed API", () => {
    const plain = candidate();
    const parsed = AuthorizedSearchResultSchema.parse(plain);
    const forgedApollo = candidate({
      chunkId: "forged-apollo",
      documentId: "IB-APL-FORGED",
      documentTitle: "Forged Project Apollo Record",
      text: "Forged restricted Apollo content that never passed Qdrant.",
      classification: "RESTRICTED",
      similarityScore: 0.99,
      metadata: {
        docType: "INVESTMENT_BANKING_VALUATION",
        allowedRoles: ["investment_banker", "compliance_officer"],
        minimumClearance: 3,
        branchId: null,
        clientId: null,
        dealId: "PROJECT_APOLLO",
        datasetId: SYNTHETIC_DATASET_ID,
      },
    });

    // The function is intentionally not invoked. Its @ts-expect-error calls
    // make typecheck fail if any unbranded input becomes accepted later.
    expect(compileTimeProvenanceAssertions).toBeTypeOf("function");
    expect(parsed).toEqual(plain);
    expect(forgedApollo.metadata.dealId).toBe("PROJECT_APOLLO");
  });
});

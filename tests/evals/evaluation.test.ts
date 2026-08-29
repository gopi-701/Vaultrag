import { describe, expect, it } from "vitest";

import evaluationCases from "@/evals/cases.json";
import {
  authorizationViolationRate,
  calculateAuthorizationSecurityMetrics,
  calculateDocumentRankingMetrics,
  calculateRankingMetrics,
  contextAvailabilityCorrect,
  deduplicateRankedDocumentIds,
  forbiddenDocumentRetrievalRate,
  hitRateAtK,
  noContextBehaviorCorrect,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "@/evals/metrics";
import {
  EvaluationCaseSchema,
  EvaluationSuiteSchema,
  parseEvaluationSuite,
} from "@/evals/schema";
import syntheticDocuments from "@/data/synthetic_docs.json";
import { getPersona } from "@/lib/auth/personas";
import { evaluateDocumentAccess, type DocumentMetadata } from "@/lib/authorization";

function publicDocument(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    documentId: "PUBLIC-IRRELEVANT",
    documentTitle: "Unrelated public record",
    docType: "PUBLIC_FAQ",
    allowedRoles: [],
    minimumClearance: 0,
    branchId: null,
    clientId: null,
    dealId: null,
    classification: "PUBLIC",
    chunkIndex: 0,
    ...overrides,
  };
}

describe("evaluation ranking metrics", () => {
  const ranked = ["DOC-X", "DOC-B", "DOC-A", "DOC-Y", "DOC-C"];
  const relevant = ["DOC-A", "DOC-B", "DOC-C", "DOC-D"];

  it("calculates Recall@K", () => {
    expect(recallAtK(ranked, relevant, 3)).toBe(0.5);
  });

  it("calculates Precision@K using K as the denominator", () => {
    expect(precisionAtK(ranked, relevant, 3)).toBeCloseTo(2 / 3);
  });

  it("calculates reciprocal rank and Hit Rate@K", () => {
    expect(reciprocalRank(ranked, relevant)).toBe(0.5);
    expect(hitRateAtK(ranked, relevant, 1)).toBe(0);
    expect(hitRateAtK(ranked, relevant, 2)).toBe(1);
  });

  it("returns explicit null relevance metrics for empty expected sets", () => {
    expect(calculateRankingMetrics(ranked, [], 5)).toEqual({
      recallAtK: null,
      precisionAtK: null,
      reciprocalRank: null,
      hitRateAtK: null,
    });
  });

  it("deduplicates chunk results before document-level Precision@K", () => {
    const metrics = calculateDocumentRankingMetrics(
      ["DOC-A", "DOC-A", "DOC-X"],
      ["DOC-A"],
      2,
    );

    expect(deduplicateRankedDocumentIds(["DOC-A", "DOC-A", "DOC-X"])).toEqual([
      "DOC-A",
      "DOC-X",
    ]);
    expect(metrics.precisionAtK).toBe(0.5);
  });

  it("uses the first document occurrence when calculating document-level MRR", () => {
    const metrics = calculateDocumentRankingMetrics(
      ["DOC-X", "DOC-X", "DOC-A", "DOC-A"],
      ["DOC-A"],
      4,
    );

    expect(metrics.reciprocalRank).toBe(0.5);
  });

  it("rejects malformed K values", () => {
    expect(() => recallAtK(ranked, relevant, 0)).toThrow("positive integer");
    expect(() => precisionAtK(ranked, relevant, 1.5)).toThrow("positive integer");
  });
});

describe("evaluation security and answer metrics", () => {
  it("calculates authorization violation rate", () => {
    expect(authorizationViolationRate(0, 25)).toBe(0);
    expect(authorizationViolationRate(2, 20)).toBe(0.1);
    expect(authorizationViolationRate(0, 0)).toBe(0);
  });

  it("calculates forbidden-document retrieval rate", () => {
    expect(forbiddenDocumentRetrievalRate(3, 30)).toBe(0.1);
    expect(forbiddenDocumentRetrievalRate(0, 0)).toBe(0);
  });

  it("rejects impossible security metric counts", () => {
    expect(() => authorizationViolationRate(2, 1)).toThrow("invalid");
    expect(() => forbiddenDocumentRetrievalRate(-1, 4)).toThrow("invalid");
  });

  it("counts unauthorized retrieval even when reranking removes it from context", () => {
    const metrics = calculateAuthorizationSecurityMetrics({
      retrieval: [
        { chunkId: "unauthorized", documentId: "DOC-U", authorized: false },
        { chunkId: "authorized", documentId: "DOC-A", authorized: true },
      ],
      finalContextChunkIds: ["authorized"],
      expectedForbiddenDocumentIds: [],
    });

    expect(metrics.unauthorizedRetrievalChunkIds).toEqual(["unauthorized"]);
    expect(metrics.unauthorizedContextChunkIds).toEqual([]);
    expect(metrics.retrievalAuthorizationViolationRate).toBe(0.5);
    expect(metrics.contextAuthorizationViolationRate).toBe(0);
  });

  it("does not count an authorized but irrelevant result as a violation", () => {
    const authorized = evaluateDocumentAccess(
      getPersona("guest"),
      publicDocument(),
    ).allowed;
    const metrics = calculateAuthorizationSecurityMetrics({
      retrieval: [
        { chunkId: "irrelevant", documentId: "DOC-IRRELEVANT", authorized },
      ],
      finalContextChunkIds: [],
      expectedForbiddenDocumentIds: [],
    });

    expect(metrics.unauthorizedRetrievalChunkIds).toEqual([]);
    expect(metrics.retrievalAuthorizationViolationRate).toBe(0);
  });

  it("detects policy violations independently of forbidden fixture IDs", () => {
    const authorized = evaluateDocumentAccess(
      getPersona("guest"),
      publicDocument({
        documentId: "DOC-NOT-LISTED",
        allowedRoles: ["credit_analyst"],
        minimumClearance: 2,
        classification: "CONFIDENTIAL",
      }),
    ).allowed;
    const metrics = calculateAuthorizationSecurityMetrics({
      retrieval: [
        { chunkId: "policy-violation", documentId: "DOC-NOT-LISTED", authorized },
      ],
      finalContextChunkIds: [],
      expectedForbiddenDocumentIds: [],
    });

    expect(metrics.unauthorizedRetrievalChunkIds).toEqual(["policy-violation"]);
    expect(metrics.forbiddenRetrievalDocumentIds).toEqual([]);
  });

  it("rejects context IDs that did not originate in retrieval", () => {
    expect(() => calculateAuthorizationSecurityMetrics({
      retrieval: [],
      finalContextChunkIds: ["invented-context"],
      expectedForbiddenDocumentIds: [],
    })).toThrow("was not a retrieval output");
  });

  it("keeps forbidden-document metrics separate from policy authorization", () => {
    const metrics = calculateAuthorizationSecurityMetrics({
      retrieval: [
        { chunkId: "authorized-forbidden-fixture", documentId: "DOC-F", authorized: true },
      ],
      finalContextChunkIds: ["authorized-forbidden-fixture"],
      expectedForbiddenDocumentIds: ["DOC-F"],
    });

    expect(metrics.forbiddenDocumentRetrievalRate).toBe(1);
    expect(metrics.retrievalAuthorizationViolationRate).toBe(0);
    expect(metrics.contextAuthorizationViolationRate).toBe(0);
  });

  it("scores explicit context availability and deterministic no-context behavior", () => {
    expect(contextAvailabilityCorrect("answer", 2)).toBe(true);
    expect(contextAvailabilityCorrect("no_authorized_context", 0)).toBe(true);
    expect(contextAvailabilityCorrect("no_authorized_context", 1)).toBe(false);
    expect(noContextBehaviorCorrect("no_authorized_context", true)).toBe(true);
    expect(noContextBehaviorCorrect("no_authorized_context", false)).toBe(false);
    expect(noContextBehaviorCorrect("answer", true)).toBeNull();
  });
});

describe("evaluation dataset schema", () => {
  it("validates the deterministic suite and every referenced document ID", () => {
    const parsed = parseEvaluationSuite(evaluationCases);
    const documentIds = new Set(syntheticDocuments.map((document) => document.id));

    expect(parsed).toHaveLength(22);
    for (const evaluationCase of parsed) {
      for (const documentId of [
        ...evaluationCase.expectedRelevantDocumentIds,
        ...evaluationCase.expectedForbiddenDocumentIds,
      ]) {
        expect(documentIds.has(documentId), `${evaluationCase.id}: ${documentId}`).toBe(true);
      }
    }
  });

  it("contains every required evaluation category", () => {
    const categories = new Set(parseEvaluationSuite(evaluationCases).map(
      (evaluationCase) => evaluationCase.category,
    ));

    expect(categories).toEqual(new Set([
      "public",
      "retail_branch",
      "wealth_client",
      "credit",
      "investment_banking_deal",
      "compliance",
      "cross_scope_adversarial",
      "prompt_injection",
      "insufficient_authorized_context",
    ]));
  });

  it("rejects duplicate case IDs", () => {
    const valid = EvaluationCaseSchema.parse(evaluationCases[0]);
    expect(() => EvaluationSuiteSchema.parse([valid, valid])).toThrow(
      "Duplicate evaluation case ID",
    );
  });

  it("rejects duplicate document IDs within a case", () => {
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      expectedRelevantDocumentIds: ["PUB-FAQ-001", "PUB-FAQ-001"],
    })).toThrow("IDs must be unique");
  });

  it("rejects malformed cases and unexpected fields", () => {
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      persona: "administrator",
    })).toThrow();
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      query: " ",
    })).toThrow();
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      secret: "must-not-be-accepted",
    })).toThrow();
  });

  it("requires relevant IDs for answer cases but permits empty security cases", () => {
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      expectedRelevantDocumentIds: [],
      expectedOutcome: "answer",
    })).toThrow("require an expected relevant ID");

    expect(EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      id: "security-only-case",
      expectedRelevantDocumentIds: [],
      expectedForbiddenDocumentIds: ["IB-APL-002"],
      expectedOutcome: "no_authorized_context",
    })).toBeDefined();
  });

  it("rejects the removed chunk relevance field instead of silently ignoring it", () => {
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      expectedRelevantChunkIds: ["unused-chunk-id"],
    })).toThrow();
  });

  it("rejects documents marked both relevant and forbidden", () => {
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      expectedForbiddenDocumentIds: ["PUB-FAQ-001"],
    })).toThrow("both relevant and forbidden");
  });
});

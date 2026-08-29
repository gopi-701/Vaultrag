import { describe, expect, it } from "vitest";

import evaluationCases from "@/evals/cases.json";
import {
  answerabilityCorrect,
  authorizationViolationRate,
  calculateRankingMetrics,
  forbiddenDocumentRetrievalRate,
  hitRateAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  refusalCorrect,
} from "@/evals/metrics";
import {
  EvaluationCaseSchema,
  EvaluationSuiteSchema,
  parseEvaluationSuite,
} from "@/evals/schema";
import syntheticDocuments from "@/data/synthetic_docs.json";

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

  it("scores refusal correctness", () => {
    expect(refusalCorrect(false, true)).toBe(true);
    expect(refusalCorrect(false, false)).toBe(false);
    expect(refusalCorrect(true, false)).toBe(true);
    expect(refusalCorrect(true, true)).toBe(false);
  });

  it("scores answerability from supplied authorized context", () => {
    expect(answerabilityCorrect(true, 2)).toBe(true);
    expect(answerabilityCorrect(false, 0)).toBe(true);
    expect(answerabilityCorrect(false, 1)).toBe(false);
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

  it("requires relevant IDs for answerable cases but permits empty security cases", () => {
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      expectedRelevantDocumentIds: [],
      answerable: true,
    })).toThrow("require an expected relevant ID");

    expect(EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      id: "security-only-case",
      expectedRelevantDocumentIds: [],
      expectedForbiddenDocumentIds: ["IB-APL-002"],
      answerable: false,
    })).toBeDefined();
  });

  it("rejects documents marked both relevant and forbidden", () => {
    expect(() => EvaluationCaseSchema.parse({
      ...evaluationCases[0],
      expectedForbiddenDocumentIds: ["PUB-FAQ-001"],
    })).toThrow("both relevant and forbidden");
  });
});

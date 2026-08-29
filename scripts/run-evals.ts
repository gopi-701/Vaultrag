import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import evaluationCases from "@/evals/cases.json";
import {
  answerabilityCorrect,
  authorizationViolationRate,
  calculateRankingMetrics,
  forbiddenDocumentRetrievalRate,
  mean,
  refusalCorrect,
  type RankingMetrics,
} from "@/evals/metrics";
import {
  parseEvaluationSuite,
  type EvalCategory,
  type EvaluationCase,
} from "@/evals/schema";
import { createClaimsForPersona, getPersona } from "@/lib/auth/personas";
import { signToken } from "@/lib/auth/signToken";
import { verifyToken } from "@/lib/auth/verifyToken";
import { evaluateDocumentAccess } from "@/lib/authorization";
import { getEmbeddingModelConfig } from "@/lib/env/embeddings";
import { getLlmConfig } from "@/lib/env/llm";
import { getQdrantConfig } from "@/lib/env/qdrant";
import { getRerankingConfig } from "@/lib/env/reranking";
import {
  generateAuthorizedAnswer,
  INSUFFICIENT_CONTEXT_RESPONSE,
} from "@/lib/llm/generator";
import { RAG_LIMITS } from "@/lib/rag/config";
import {
  rerankAuthorizedCandidates,
  type RerankedAuthorizedSearchResult,
} from "@/lib/reranking/authorized";
import {
  searchAuthorizedDocuments,
  type AuthorizedSearchResult,
  type RetrievalPrincipal,
} from "@/lib/retrieval/search";

const REQUIRED_LIVE_ENVIRONMENT = [
  "JWT_SECRET",
  "JINA_API_KEY",
  "QDRANT_URL",
  "COHERE_API_KEY",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSION",
] as const;

interface RankedObservation {
  chunkId: string;
  documentId: string;
  score: number;
}

interface CaseResult {
  caseId: string;
  category: EvalCategory;
  persona: EvaluationCase["persona"];
  query: string;
  expectedAnswerable: boolean;
  authorizationFilter: unknown;
  qdrant: RankedObservation[];
  reranked: RankedObservation[];
  finalContextIds: string[];
  finalContextDocumentIds: string[];
  vectorMetrics: RankingMetrics;
  rerankedMetrics: RankingMetrics;
  rerankingMrrDelta: number | null;
  forbiddenQdrantDocumentIds: string[];
  unauthorizedContextChunkIds: string[];
  refused: boolean;
  refusalCorrect: boolean;
  answerabilityCorrect: boolean;
  adversarialFixtureApplied: boolean;
  outcome: "answered" | "refused";
  latencyMs: {
    retrievalTotal: number;
    qdrant: number;
    reranking: number;
    generation: number;
  };
}

function principalFor(evaluationCase: EvaluationCase): RetrievalPrincipal {
  return evaluationCase.persona === "guest"
    ? getPersona("guest")
    : verifyToken(signToken(createClaimsForPersona(evaluationCase.persona)));
}

function publicConfiguration() {
  const embedding = getEmbeddingModelConfig();
  const qdrant = getQdrantConfig();
  const reranking = getRerankingConfig();
  const llm = getLlmConfig();

  return {
    embedding: {
      provider: embedding.provider,
      model: embedding.model,
      dimension: embedding.dimension,
    },
    qdrant: { collection: qdrant.collection },
    reranking: { model: reranking.model },
    llm: { model: llm.model },
    limits: RAG_LIMITS,
  };
}

function requireLiveEnvironment() {
  const missing = REQUIRED_LIVE_ENVIRONMENT.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Live evaluation requires environment variables: ${missing.join(", ")}`,
    );
  }
}

function withRetrievedDocumentInjection(
  evaluationCase: EvaluationCase,
  results: RerankedAuthorizedSearchResult[],
): { results: RerankedAuthorizedSearchResult[]; applied: boolean } {
  const injection = evaluationCase.adversarialInput;
  if (injection?.location !== "retrieved_document" || results.length === 0) {
    return { results, applied: false };
  }

  const targetIndex = results.findIndex((result) =>
    evaluationCase.expectedRelevantDocumentIds.includes(result.documentId)
  );
  if (targetIndex < 0) return { results, applied: false };

  return {
    results: results.map((result, index) => index === targetIndex
      ? {
          ...result,
          text: `${result.text}\n\n[EVALUATION ADVERSARIAL DOCUMENT CONTENT]\n${injection.payload}`,
        }
      : result),
    applied: true,
  };
}

function documentAccess(
  principal: RetrievalPrincipal,
  result: AuthorizedSearchResult,
) {
  return evaluateDocumentAccess(principal, {
    documentId: result.documentId,
    documentTitle: result.documentTitle,
    docType: result.metadata.docType,
    allowedRoles: result.metadata.allowedRoles,
    minimumClearance: result.metadata.minimumClearance,
    branchId: result.metadata.branchId,
    clientId: result.metadata.clientId,
    dealId: result.metadata.dealId,
    classification: result.classification,
    chunkIndex: result.chunkIndex,
  });
}

async function evaluateCase(evaluationCase: EvaluationCase): Promise<CaseResult> {
  const principal = principalFor(evaluationCase);
  const retrievalStarted = performance.now();
  const retrieved = await searchAuthorizedDocuments({
    query: evaluationCase.query,
    user: principal,
    limit: RAG_LIMITS.vectorCandidateLimit,
  });
  const retrievalTotal = performance.now() - retrievalStarted;

  const rerankStarted = performance.now();
  const reranked = retrieved.results.length === 0
    ? []
    : await rerankAuthorizedCandidates(
        evaluationCase.query,
        retrieved.results,
        Math.min(RAG_LIMITS.rerankedContextLimit, retrieved.results.length),
      );
  const rerankingLatency = performance.now() - rerankStarted;
  const injected = withRetrievedDocumentInjection(evaluationCase, reranked);

  const generationStarted = performance.now();
  const generated = await generateAuthorizedAnswer({
    query: evaluationCase.query,
    context: injected.results,
    contextCharacterBudget: RAG_LIMITS.contextCharacterBudget,
  });
  const generationLatency = performance.now() - generationStarted;

  const contextIds = new Set(generated.sources.map((source) => source.chunkId));
  const finalContext = reranked.filter((result) => contextIds.has(result.chunkId));
  const unauthorizedContext = finalContext.filter(
    (result) => !documentAccess(principal, result).allowed,
  );
  const forbidden = new Set(evaluationCase.expectedForbiddenDocumentIds);
  const forbiddenQdrantDocumentIds = retrieved.results
    .map((result) => result.documentId)
    .filter((id) => forbidden.has(id));
  const vectorIds = retrieved.results.map((result) => result.documentId);
  const rerankedIds = reranked.map((result) => result.documentId);
  const vectorMetrics = calculateRankingMetrics(
    vectorIds,
    evaluationCase.expectedRelevantDocumentIds,
    RAG_LIMITS.rerankedContextLimit,
  );
  const rerankedMetrics = calculateRankingMetrics(
    rerankedIds,
    evaluationCase.expectedRelevantDocumentIds,
    RAG_LIMITS.rerankedContextLimit,
  );
  const refused = generated.model === null &&
    generated.sources.length === 0 &&
    generated.text === INSUFFICIENT_CONTEXT_RESPONSE;

  return {
    caseId: evaluationCase.id,
    category: evaluationCase.category,
    persona: evaluationCase.persona,
    query: evaluationCase.query,
    expectedAnswerable: evaluationCase.answerable,
    authorizationFilter: retrieved.debug.filter,
    qdrant: retrieved.results.map((result) => ({
      chunkId: result.chunkId,
      documentId: result.documentId,
      score: result.similarityScore,
    })),
    reranked: reranked.map((result) => ({
      chunkId: result.chunkId,
      documentId: result.documentId,
      score: result.rerankScore,
    })),
    finalContextIds: generated.sources.map((source) => source.chunkId),
    finalContextDocumentIds: generated.sources.map((source) => source.documentId),
    vectorMetrics,
    rerankedMetrics,
    rerankingMrrDelta:
      vectorMetrics.reciprocalRank === null ||
      rerankedMetrics.reciprocalRank === null
        ? null
        : rerankedMetrics.reciprocalRank - vectorMetrics.reciprocalRank,
    forbiddenQdrantDocumentIds,
    unauthorizedContextChunkIds: unauthorizedContext.map((result) => result.chunkId),
    refused,
    refusalCorrect: refusalCorrect(evaluationCase.answerable, refused),
    answerabilityCorrect: answerabilityCorrect(
      evaluationCase.answerable,
      generated.sources.length,
    ),
    adversarialFixtureApplied: injected.applied,
    outcome: refused ? "refused" : "answered",
    latencyMs: {
      retrievalTotal,
      qdrant: retrieved.debug.retrievalLatencyMs,
      reranking: rerankingLatency,
      generation: generationLatency,
    },
  };
}

function aggregate(results: CaseResult[]) {
  const qdrantOutputs = results.reduce((sum, result) => sum + result.qdrant.length, 0);
  const forbiddenRetrievals = results.reduce(
    (sum, result) => sum + result.forbiddenQdrantDocumentIds.length,
    0,
  );
  const contextOutputs = results.reduce(
    (sum, result) => sum + result.finalContextIds.length,
    0,
  );
  const violations = results.reduce(
    (sum, result) => sum + result.unauthorizedContextChunkIds.length,
    0,
  );

  return {
    vector: {
      meanRecallAtK: mean(results.map((result) => result.vectorMetrics.recallAtK)),
      meanPrecisionAtK: mean(results.map((result) => result.vectorMetrics.precisionAtK)),
      meanReciprocalRank: mean(results.map((result) => result.vectorMetrics.reciprocalRank)),
      meanHitRateAtK: mean(results.map((result) => result.vectorMetrics.hitRateAtK)),
    },
    reranked: {
      meanRecallAtK: mean(results.map((result) => result.rerankedMetrics.recallAtK)),
      meanPrecisionAtK: mean(results.map((result) => result.rerankedMetrics.precisionAtK)),
      meanReciprocalRank: mean(results.map((result) => result.rerankedMetrics.reciprocalRank)),
      meanHitRateAtK: mean(results.map((result) => result.rerankedMetrics.hitRateAtK)),
      meanMrrDelta: mean(results.map((result) => result.rerankingMrrDelta)),
    },
    security: {
      unauthorizedContextChunks: violations,
      evaluatedContextOutputs: contextOutputs,
      authorizationViolationRate: authorizationViolationRate(violations, contextOutputs),
      forbiddenRetrievals,
      evaluatedRetrievalOutputs: qdrantOutputs,
      forbiddenDocumentRetrievalRate: forbiddenDocumentRetrievalRate(
        forbiddenRetrievals,
        qdrantOutputs,
      ),
    },
    refusalCorrectness: mean(results.map((result) => Number(result.refusalCorrect))),
    answerabilityCorrectness: mean(
      results.map((result) => Number(result.answerabilityCorrect)),
    ),
  };
}

function categoryCounts(cases: EvaluationCase[]) {
  return cases.reduce<Partial<Record<EvalCategory, number>>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
}

function markdownReport(report: {
  generatedAt: string;
  caseCount: number;
  aggregate: ReturnType<typeof aggregate>;
}) {
  const metric = (value: number | null) => value === null ? "n/a" : value.toFixed(4);
  return `# VaultRAG live evaluation\n\nGenerated: ${report.generatedAt}\n\nCases: ${report.caseCount}\n\n## Retrieval and reranking\n\n| Metric | Qdrant | Qdrant + Cohere |\n| --- | ---: | ---: |\n| Recall@K | ${metric(report.aggregate.vector.meanRecallAtK)} | ${metric(report.aggregate.reranked.meanRecallAtK)} |\n| Precision@K | ${metric(report.aggregate.vector.meanPrecisionAtK)} | ${metric(report.aggregate.reranked.meanPrecisionAtK)} |\n| MRR | ${metric(report.aggregate.vector.meanReciprocalRank)} | ${metric(report.aggregate.reranked.meanReciprocalRank)} |\n| Hit Rate@K | ${metric(report.aggregate.vector.meanHitRateAtK)} | ${metric(report.aggregate.reranked.meanHitRateAtK)} |\n\nMean reranking MRR delta: ${metric(report.aggregate.reranked.meanMrrDelta)}\n\n## Security and answer behavior\n\n- Authorization violation rate: ${metric(report.aggregate.security.authorizationViolationRate)} (${report.aggregate.security.unauthorizedContextChunks}/${report.aggregate.security.evaluatedContextOutputs})\n- Forbidden-document retrieval rate: ${metric(report.aggregate.security.forbiddenDocumentRetrievalRate)} (${report.aggregate.security.forbiddenRetrievals}/${report.aggregate.security.evaluatedRetrievalOutputs})\n- Refusal correctness: ${metric(report.aggregate.refusalCorrectness)}\n- Answerability correctness: ${metric(report.aggregate.answerabilityCorrectness)}\n`;
}

async function main() {
  const cases = parseEvaluationSuite(evaluationCases);
  if (process.argv.includes("--validate-only")) {
    console.log(`Validated ${cases.length} evaluation cases.`);
    console.log(JSON.stringify(categoryCounts(cases), null, 2));
    return;
  }

  requireLiveEnvironment();
  const configuration = publicConfiguration();
  const results: CaseResult[] = [];
  for (const evaluationCase of cases) {
    console.log(`Evaluating ${evaluationCase.id} (${evaluationCase.persona})...`);
    results.push(await evaluateCase(evaluationCase));
  }

  const generatedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    generatedAt,
    caseCount: cases.length,
    categories: categoryCounts(cases),
    configuration,
    aggregate: aggregate(results),
    cases: results,
  };
  const resultsDirectory = new URL("../evals/results/", import.meta.url);
  await mkdir(resultsDirectory, { recursive: true });
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  await writeFile(
    new URL(`${timestamp}.json`, resultsDirectory),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    new URL("latest.md", resultsDirectory),
    markdownReport(report),
    "utf8",
  );
  console.log(`Completed ${cases.length} live evaluation cases.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Live evaluation failed");
    process.exitCode = 1;
  });
}

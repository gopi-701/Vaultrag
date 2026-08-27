import "server-only";

import type { Schemas } from "@qdrant/js-client-rest";

import type { ClearanceLevel, Role } from "@/lib/auth/claims";
import type { GuestPrincipal } from "@/lib/auth/personas";
import {
  generateAuthorizedAnswer,
  type AuthorizedGenerationResult,
} from "@/lib/llm/generator";
import { RAG_LIMITS } from "@/lib/rag/config";
import {
  searchAndRerankAuthorizedDocuments,
  type AuthorizedRerankingResponse,
} from "@/lib/reranking/pipeline";
import type { RetrievalPrincipal } from "@/lib/retrieval/search";

export interface AnswerAuthorizedQueryInput {
  query: string;
  principal: RetrievalPrincipal;
}

export interface AnswerQueryDependencies {
  retrieveAndRerank?: typeof searchAndRerankAuthorizedDocuments;
  generate?: typeof generateAuthorizedAnswer;
  now?: () => number;
}

export interface RagPrincipalDebug {
  mode: "employee" | "guest";
  personaId: Role | "guest";
  role: Role | null;
  clearanceLevel: ClearanceLevel;
  scopes: {
    branchIds: readonly string[];
    clientIds: readonly string[];
    dealIds: readonly string[];
  };
}

export interface RagDebug extends RagPrincipalDebug {
  authorizationPrefilterApplied: true;
  authorizationFilter: Schemas["Filter"];
  vectorCandidateLimit: number;
  rerankedContextLimit: number;
  authorizedCandidateCount: number;
  rerankedCount: number;
  contextSourceIds: string[];
  retrievalLatencyMs: number;
  retrievalAndRerankLatencyMs: number;
  generationLatencyMs: number;
}

export interface AnswerAuthorizedQueryResult {
  answer: string;
  sources: AuthorizedGenerationResult["sources"];
  citedSources: AuthorizedGenerationResult["citedSources"];
  model: string | null;
  usage?: AuthorizedGenerationResult["usage"];
  debug: RagDebug;
}

function describePrincipal(principal: RetrievalPrincipal): RagPrincipalDebug {
  const guest = principal as GuestPrincipal;
  const isGuest = principal.role === null;

  return {
    mode: isGuest ? "guest" : "employee",
    personaId: isGuest ? guest.personaId : principal.role,
    role: principal.role,
    clearanceLevel: principal.clearanceLevel,
    scopes: {
      branchIds: [...principal.branchIds],
      clientIds: [...principal.clientIds],
      dealIds: [...principal.dealIds],
    },
  };
}

export async function answerAuthorizedQuery(
  input: AnswerAuthorizedQueryInput,
  dependencies: AnswerQueryDependencies = {},
): Promise<AnswerAuthorizedQueryResult> {
  const now = dependencies.now ?? performance.now.bind(performance);
  const retrieveAndRerank =
    dependencies.retrieveAndRerank ?? searchAndRerankAuthorizedDocuments;
  const generate = dependencies.generate ?? generateAuthorizedAnswer;

  const retrievalStartedAt = now();
  const ranked: AuthorizedRerankingResponse = await retrieveAndRerank({
    query: input.query,
    user: input.principal,
    candidateLimit: RAG_LIMITS.vectorCandidateLimit,
    topK: RAG_LIMITS.rerankedContextLimit,
  });
  const retrievalFinishedAt = now();

  const generation: AuthorizedGenerationResult = await generate({
    query: input.query,
    context: ranked.results,
    contextCharacterBudget: RAG_LIMITS.contextCharacterBudget,
  });
  const generationFinishedAt = now();

  return {
    answer: generation.text,
    sources: generation.sources,
    citedSources: generation.citedSources,
    model: generation.model,
    ...(generation.usage ? { usage: generation.usage } : {}),
    debug: {
      ...describePrincipal(input.principal),
      authorizationPrefilterApplied:
        ranked.retrievalDebug.authorizationPrefilterApplied,
      authorizationFilter: ranked.retrievalDebug.filter,
      vectorCandidateLimit: RAG_LIMITS.vectorCandidateLimit,
      rerankedContextLimit: RAG_LIMITS.rerankedContextLimit,
      authorizedCandidateCount: ranked.candidateCount,
      rerankedCount: ranked.results.length,
      contextSourceIds: generation.sources.map((source) => source.citationId),
      retrievalLatencyMs: ranked.retrievalDebug.retrievalLatencyMs,
      retrievalAndRerankLatencyMs: Math.max(
        0,
        retrievalFinishedAt - retrievalStartedAt,
      ),
      generationLatencyMs: Math.max(
        0,
        generationFinishedAt - retrievalFinishedAt,
      ),
    },
  };
}

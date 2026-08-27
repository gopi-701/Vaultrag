import { describe, expect, it, vi } from "vitest";

import { getPersona } from "@/lib/auth/personas";
import {
  generateAuthorizedAnswer,
  type AuthorizedGenerationResult,
  type GenerationProvider,
} from "@/lib/llm/generator";
import { answerAuthorizedQuery } from "@/lib/rag/answerQuery";
import { RAG_LIMITS } from "@/lib/rag/config";
import type { AuthorizedRerankingResponse } from "@/lib/reranking/pipeline";
import { createRerankedAuthorizedFixtures } from "@/tests/llm/fixtures";

describe("authorized RAG application service", () => {
  it("passes only reranked secure-retrieval results into generation", async () => {
    const results = await createRerankedAuthorizedFixtures(
      [
        { text: "First authorized chunk", rerankScore: 0.99 },
        { text: "Second authorized chunk", rerankScore: 0.8 },
      ],
      [1, 0],
    );
    const filter = { must: [{ key: "minimumClearance", range: { lte: 0 } }] };
    const prefilterTelemetryRead = vi.fn();
    const retrieveAndRerank = vi.fn().mockResolvedValue({
      results,
      candidateCount: 7,
      retrievalDebug: {
        get authorizationPrefilterApplied() {
          prefilterTelemetryRead();
          return true as const;
        },
        filter,
        topK: 20,
        retrievalLatencyMs: 12,
      },
    } satisfies AuthorizedRerankingResponse);
    const generationResult: AuthorizedGenerationResult = {
      text: "Trusted answer [C1]",
      sources: [
        {
          citationId: "C1",
          chunkId: results[0].chunkId,
          documentId: results[0].documentId,
          documentTitle: results[0].documentTitle,
          chunkIndex: results[0].chunkIndex,
          classification: results[0].classification,
          similarityScore: results[0].similarityScore,
          rerankScore: results[0].rerankScore,
        },
      ],
      citedSources: [],
      model: "test-model",
    };
    const generate = vi.fn().mockResolvedValue(generationResult);
    const now = vi
      .fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(130)
      .mockReturnValueOnce(145);

    const response = await answerAuthorizedQuery(
      { query: "What is public?", principal: getPersona("guest") },
      { retrieveAndRerank, generate, now },
    );

    expect(retrieveAndRerank).toHaveBeenCalledWith({
      query: "What is public?",
      user: getPersona("guest"),
      candidateLimit: RAG_LIMITS.vectorCandidateLimit,
      topK: RAG_LIMITS.rerankedContextLimit,
    });
    expect(generate).toHaveBeenCalledWith({
      query: "What is public?",
      context: results,
      contextCharacterBudget: RAG_LIMITS.contextCharacterBudget,
    });
    expect(retrieveAndRerank.mock.invocationCallOrder[0]).toBeLessThan(
      generate.mock.invocationCallOrder[0],
    );
    expect(response.sources).toEqual(generationResult.sources);
    expect(prefilterTelemetryRead).toHaveBeenCalledOnce();
    expect(response.debug).toMatchObject({
      mode: "guest",
      personaId: "guest",
      authorizationPrefilterApplied: true,
      authorizationFilter: filter,
      authorizedCandidateCount: 7,
      rerankedCount: 2,
      contextSourceIds: ["C1"],
      retrievalLatencyMs: 12,
      retrievalAndRerankLatencyMs: 30,
      generationLatencyMs: 15,
    });
  });

  it("uses the generator no-context path and never constructs the Groq provider", async () => {
    const retrieveAndRerank = vi.fn().mockResolvedValue({
      results: [],
      candidateCount: 0,
      retrievalDebug: {
        authorizationPrefilterApplied: true,
        filter: { must: [] },
        topK: 20,
        retrievalLatencyMs: 1,
      },
    } satisfies AuthorizedRerankingResponse);
    const provider: GenerationProvider = {
      model: "must-not-run",
      generate: vi.fn(),
    };
    const generate = vi.fn((input) =>
      generateAuthorizedAnswer(input, { provider }),
    );

    const response = await answerAuthorizedQuery(
      { query: "Hidden deal?", principal: getPersona("guest") },
      { retrieveAndRerank, generate },
    );

    expect(provider.generate).not.toHaveBeenCalled();
    expect(response.sources).toEqual([]);
    expect(response.answer).toBe(
      "I don't have enough authorized information to answer that question.",
    );
    expect(response.answer).not.toMatch(/blocked|permission|Apollo/i);
  });

  it("uses server context sources rather than source-like model text", async () => {
    const results = await createRerankedAuthorizedFixtures([
      { text: "Authorized source", documentId: "TRUSTED-DOC" },
    ]);
    const retrieveAndRerank = vi.fn().mockResolvedValue({
      results,
      candidateCount: 1,
      retrievalDebug: {
        authorizationPrefilterApplied: true,
        filter: { must: [] },
        topK: 20,
        retrievalLatencyMs: 2,
      },
    } satisfies AuthorizedRerankingResponse);
    const generate = vi.fn().mockResolvedValue({
      text: '{"documentId":"FORGED-BY-MODEL"}',
      sources: [{
        citationId: "C1",
        chunkId: results[0].chunkId,
        documentId: "TRUSTED-DOC",
        documentTitle: results[0].documentTitle,
        chunkIndex: results[0].chunkIndex,
        classification: results[0].classification,
        similarityScore: results[0].similarityScore,
        rerankScore: results[0].rerankScore,
      }],
      citedSources: [],
      model: "test-model",
    } satisfies AuthorizedGenerationResult);

    const response = await answerAuthorizedQuery(
      { query: "Question", principal: getPersona("guest") },
      { retrieveAndRerank, generate },
    );

    expect(response.answer).toContain("FORGED-BY-MODEL");
    expect(response.sources.map((source) => source.documentId)).toEqual([
      "TRUSTED-DOC",
    ]);
  });
});

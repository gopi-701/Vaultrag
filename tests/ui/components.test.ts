import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "@/components/chat/chat-panel";
import { SourceList } from "@/components/chat/source-list";
import type { ChatResponse, SourceReference } from "@/components/chat/types";
import { PersonaSwitcher } from "@/components/persona-switcher/persona-switcher";
import { SecurityInspector } from "@/components/security-inspector/security-inspector";

const source: SourceReference = {
  citationId: "C1",
  chunkId: "chunk-1",
  documentId: "DOC-1",
  documentTitle: "Synthetic NYC Procedure",
  chunkIndex: 2,
  classification: "INTERNAL",
  similarityScore: 0.81234,
  rerankScore: 0.93456,
};

const response: ChatResponse = {
  answer: "The authorized procedure applies [C1].",
  sources: [source],
  citedSources: [source],
  model: "configured-groq-model",
  debug: {
    mode: "employee",
    personaId: "retail_banker",
    role: "retail_banker",
    clearanceLevel: 1,
    scopes: { branchIds: ["NYC-01"], clientIds: [], dealIds: [] },
    authorizationPrefilterApplied: true,
    authorizationFilter: {
      must: [{ key: "allowedRoles", match: { value: "<script>unsafe()</script>" } }],
    },
    vectorCandidateLimit: 20,
    rerankedContextLimit: 5,
    authorizedCandidateCount: 3,
    rerankedCount: 1,
    contextSourceIds: ["C1"],
    retrievalLatencyMs: 8.2,
    retrievalAndRerankLatencyMs: 20.4,
    generationLatencyMs: 32.1,
  },
};

describe("VaultRAG UI components", () => {
  it("renders every persona and identifies the active selection", () => {
    const html = renderToStaticMarkup(createElement(PersonaSwitcher, {
      activePersonaId: "investment_banker",
      pendingPersonaId: null,
      onSelect: vi.fn(),
    }));

    expect(html).toContain("Retail Banker");
    expect(html).toContain("Wealth Manager");
    expect(html).toContain("Credit Analyst");
    expect(html).toContain("Investment Banker");
    expect(html).toContain("Compliance Officer");
    expect(html).toContain("Guest");
    expect(html).toContain('data-active="true"');
  });

  it("renders trusted source metadata and both ranking scores", () => {
    const html = renderToStaticMarkup(createElement(SourceList, {
      sources: [source],
      cited: true,
    }));

    expect(html).toContain("Cited sources");
    expect(html).toContain("Synthetic NYC Procedure");
    expect(html).toContain("INTERNAL");
    expect(html).toContain("Chunk 3");
    expect(html).toContain("0.812");
    expect(html).toContain("0.935");
  });

  it("renders inspector identity, pre-filter flow, counts, scores, and model", () => {
    const html = renderToStaticMarkup(createElement(SecurityInspector, { response }));

    expect(html).toContain("Verified identity");
    expect(html).toContain("Retail Banker");
    expect(html).toContain("NYC-01");
    expect(html).toContain("Pre-filter applied");
    expect(html).toContain("Eligible records only");
    expect(html).toContain("Authorized hits returned");
    expect(html).toContain("Cohere");
    expect(html).toContain("configured-groq-model");
    expect(html).not.toMatch(/blocked/i);
  });

  it("escapes raw authorization filter content and displays no JWT field", () => {
    const html = renderToStaticMarkup(createElement(SecurityInspector, { response }));

    expect(html).toContain("&lt;script&gt;unsafe()&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe()</script>");
    expect(html).not.toMatch(/JWT|Authorization header|API key|secret/i);
  });

  it("renders loading and sanitized error states", () => {
    const baseProps = {
      personaId: "guest" as const,
      query: "question",
      response: null,
      sessionReady: true,
      onQueryChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    const loadingHtml = renderToStaticMarkup(createElement(ChatPanel, {
      ...baseProps,
      error: null,
      loading: true,
    }));
    const errorHtml = renderToStaticMarkup(createElement(ChatPanel, {
      ...baseProps,
      error: "Your employee session expired. Select the persona again or continue as Guest.",
      loading: false,
    }));

    expect(loadingHtml).toContain("Searching authorized records");
    expect(loadingHtml).toContain("disabled");
    expect(errorHtml).toContain("session expired");
  });

  it("renders model answers as escaped plain text", () => {
    const unsafeResponse = {
      ...response,
      answer: '<img src=x onerror="steal()">',
    };
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      personaId: "retail_banker",
      query: "question",
      response: unsafeResponse,
      error: null,
      loading: false,
      sessionReady: true,
      onQueryChange: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain("&lt;img src=x onerror=&quot;steal()&quot;&gt;");
    expect(html).not.toContain("<img src=x");
  });
});

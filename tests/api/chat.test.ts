import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatPostHandler } from "@/app/api/chat/route";
import { createClaimsForPersona } from "@/lib/auth/personas";
import { signToken } from "@/lib/auth/signToken";
import type {
  AnswerAuthorizedQueryInput,
  AnswerAuthorizedQueryResult,
} from "@/lib/rag/answerQuery";

const TEST_SECRET = "chat-route-test-secret-at-least-32-characters";

function request(body: unknown, token?: string): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function requestWithAuthorization(body: unknown, authorization: string): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization,
    },
    body: JSON.stringify(body),
  });
}

function result(): AnswerAuthorizedQueryResult {
  return {
    answer: "Authorized answer [C1]",
    sources: [],
    citedSources: [],
    model: "test-model",
    debug: {
      mode: "employee",
      personaId: "retail_banker",
      role: "retail_banker",
      clearanceLevel: 1,
      scopes: { branchIds: ["NYC-01"], clientIds: [], dealIds: [] },
      authorizationPrefilterApplied: true,
      authorizationFilter: { must: [] },
      vectorCandidateLimit: 20,
      rerankedContextLimit: 5,
      authorizedCandidateCount: 1,
      rerankedCount: 1,
      contextSourceIds: [],
      retrievalLatencyMs: 1,
      retrievalAndRerankLatencyMs: 2,
      generationLatencyMs: 3,
    },
  };
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.JWT_SECRET;
  });

  it.each([
    ["retail_banker", ["NYC-01"], [], []],
    ["wealth_manager", [], ["CUST-8832"], []],
    ["investment_banker", [], [], ["PROJECT_APOLLO"]],
    ["compliance_officer", ["ALL"], ["ALL"], ["ALL"]],
  ] as const)("verifies a valid %s JWT before orchestration", async (
    personaId,
    branchIds,
    clientIds,
    dealIds,
  ) => {
    const token = signToken(createClaimsForPersona(personaId));
    const answer = vi.fn().mockResolvedValue(result());
    const response = await createChatPostHandler({ answer })(
      request({ query: "Banking question" }, token),
    );
    const input = answer.mock.calls[0][0] as AnswerAuthorizedQueryInput;

    expect(response.status).toBe(200);
    expect(input.principal).toMatchObject({
      role: personaId,
      branchIds: [...branchIds],
      clientIds: [...clientIds],
      dealIds: [...dealIds],
    });
  });

  it("uses only the canonical guest for explicit guest requests", async () => {
    const answer = vi.fn().mockResolvedValue(result());
    const response = await createChatPostHandler({ answer })(
      request({ query: "Public products", personaId: "guest" }),
    );

    expect(response.status).toBe(200);
    expect(answer.mock.calls[0][0].principal).toEqual({
      personaId: "guest",
      role: null,
      branchIds: [],
      clientIds: [],
      dealIds: [],
      clearanceLevel: 0,
    });
  });

  it("returns 401 for an expired JWT before orchestration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signToken(createClaimsForPersona("retail_banker"));
    vi.setSystemTime(new Date("2026-01-01T00:16:00Z"));
    const answer = vi.fn();
    const response = await createChatPostHandler({ answer })(
      request({ query: "Question" }, token),
    );

    expect(response.status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
  });

  it.each(["tampered", "wrong-secret"])(
    "returns 401 for a %s JWT before orchestration",
    async (kind) => {
      let token = signToken(createClaimsForPersona("retail_banker"));
      if (kind === "tampered") {
        token = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
      } else {
        process.env.JWT_SECRET = "different-chat-secret-at-least-32-characters";
      }
      const answer = vi.fn();
      const response = await createChatPostHandler({ answer })(
        request({ query: "Question" }, token),
      );

      expect(response.status).toBe(401);
      expect(answer).not.toHaveBeenCalled();
    },
  );

  it("requires a JWT for employee requests", async () => {
    const answer = vi.fn();
    const response = await createChatPostHandler({ answer })(
      request({ query: "Employee question" }),
    );

    expect(response.status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
  });

  it.each(["Basic token", "Bearer", "Bearer ", "Bearer token extra"])(
    "rejects malformed Authorization syntax: %j",
    async (authorization) => {
      const answer = vi.fn();
      const response = await createChatPostHandler({ answer })(
        requestWithAuthorization({ query: "Employee question" }, authorization),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Authentication required",
      });
      expect(answer).not.toHaveBeenCalled();
    },
  );

  it("rejects client attempts to set authorization pre-filter telemetry", async () => {
    const answer = vi.fn();
    const token = signToken(createClaimsForPersona("retail_banker"));
    const response = await createChatPostHandler({ answer })(
      request({ query: "Question", authorizationPrefilterApplied: false }, token),
    );

    expect(response.status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });

  it("rejects body-supplied role, clearance, and scopes", async () => {
    const answer = vi.fn();
    const token = signToken(createClaimsForPersona("retail_banker"));
    const response = await createChatPostHandler({ answer })(request({
      query: "Escalate me",
      role: "compliance_officer",
      clearanceLevel: 4,
      branchIds: ["ALL"],
      clientIds: ["ALL"],
      dealIds: ["ALL"],
    }, token));

    expect(response.status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });

  it("does not let a JWT-bearing employee switch to guest in the body", async () => {
    const answer = vi.fn();
    const token = signToken(createClaimsForPersona("retail_banker"));
    const response = await createChatPostHandler({ answer })(
      request({ query: "Question", personaId: "guest" }, token),
    );

    expect(response.status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });

  it("sanitizes provider failures without logging or returning credentials", async () => {
    const secret = "cohere-or-groq-secret-value";
    const answer = vi.fn().mockRejectedValue(new Error(`Provider failed: ${secret}`));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = signToken(createClaimsForPersona("retail_banker"));
    const response = await createChatPostHandler({ answer })(
      request({ query: "Question" }, token),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe('{"error":"Unable to answer query"}');
    expect(body).not.toContain(secret);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("never echoes the bearer JWT into response or debug data", async () => {
    const token = signToken(createClaimsForPersona("retail_banker"));
    const answer = vi.fn().mockResolvedValue(result());
    const response = await createChatPostHandler({ answer })(
      request({ query: "Question" }, token),
    );
    const serialized = await response.text();

    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(TEST_SECRET);
    expect(serialized).not.toContain("Authorization");
  });

  it("rejects malformed JSON and overlong or unexpected request fields", async () => {
    const post = createChatPostHandler({ answer: vi.fn() });
    const malformed = await post(new Request("http://localhost/api/chat", {
      method: "POST",
      body: "{",
    }));
    const overlong = await post(request({ query: "x".repeat(2_001) }));

    expect(malformed.status).toBe(400);
    expect(overlong.status).toBe(400);
  });
});

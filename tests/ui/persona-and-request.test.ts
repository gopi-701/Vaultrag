import { describe, expect, it } from "vitest";

import { createChatRequest } from "@/components/chat/request";
import { chatFailureMessage } from "@/components/chat/request-coordinator";
import {
  GUEST_SESSION,
  createPersonaRequest,
  resolveEmployeeSession,
} from "@/components/persona-switcher/session";

function personaResponse(personaId: "retail_banker" | "wealth_manager", token: string) {
  return {
    token,
    persona: {
      personaId,
      role: personaId,
      branchIds: personaId === "retail_banker" ? ["NYC-01"] : [],
      clientIds: personaId === "wealth_manager" ? ["CUST-8832"] : [],
      dealIds: [],
      clearanceLevel: personaId === "retail_banker" ? 1 : 2,
    },
  };
}

describe("persona and chat request contracts", () => {
  it("requests an employee token using only the selected persona ID", () => {
    const request = createPersonaRequest("retail_banker");

    expect(request.url).toBe("/api/auth/persona");
    expect(JSON.parse(String(request.init.body))).toEqual({
      personaId: "retail_banker",
    });
  });

  it("replaces an employee token when a new persona is selected", () => {
    const first = resolveEmployeeSession(
      "retail_banker",
      personaResponse("retail_banker", "retail-token"),
    );
    const replacement = resolveEmployeeSession(
      "wealth_manager",
      personaResponse("wealth_manager", "wealth-token"),
    );

    expect(first.token).toBe("retail-token");
    expect(replacement).toEqual({
      personaId: "wealth_manager",
      token: "wealth-token",
    });
    expect(replacement.token).not.toBe(first.token);
  });

  it("uses a token-free canonical UI session for guest selection", () => {
    expect(GUEST_SESSION).toEqual({ personaId: "guest", token: null });
    expect(JSON.stringify(GUEST_SESSION)).not.toContain("retail-token");
  });

  it("sends the Bearer token for employees without body claims", () => {
    const request = createChatRequest("Show branch policy", {
      personaId: "retail_banker",
      token: "server-issued-token",
    });
    const headers = request.init.headers as Record<string, string>;

    expect(headers.authorization).toBe("Bearer server-issued-token");
    expect(JSON.parse(String(request.init.body))).toEqual({
      query: "Show branch policy",
    });
  });

  it("sends explicit guest mode without authorization or employee claims", () => {
    const request = createChatRequest("What accounts are public?", GUEST_SESSION);
    const headers = request.init.headers as Record<string, string>;
    const body = JSON.parse(String(request.init.body));

    expect(headers.authorization).toBeUndefined();
    expect(body).toEqual({
      query: "What accounts are public?",
      personaId: "guest",
    });
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("clearanceLevel");
    expect(body).not.toHaveProperty("branchIds");
  });

  it("rejects mismatched persona responses instead of accepting a wrong token", () => {
    expect(() =>
      resolveEmployeeSession(
        "retail_banker",
        personaResponse("wealth_manager", "wrong-token"),
      ),
    ).toThrow("invalid session");
  });

  it("provides a clean expired-session message", () => {
    expect(chatFailureMessage(401)).toContain("session expired");
    expect(chatFailureMessage(401)).not.toMatch(/JWT|token|secret/i);
  });
});

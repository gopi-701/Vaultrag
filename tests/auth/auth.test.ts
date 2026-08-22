import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/persona/route";
import { createClaimsForPersona } from "@/lib/auth/personas";
import { signToken } from "@/lib/auth/signToken";
import { verifyToken } from "@/lib/auth/verifyToken";

const TEST_SECRET = "test-secret-that-is-at-least-32-characters";

function personaRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/persona", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("JWT authentication", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.JWT_SECRET;
  });

  it("signs and verifies a valid token", () => {
    const token = signToken(createClaimsForPersona("investment_banker"));

    expect(verifyToken(token)).toMatchObject({
      role: "investment_banker",
      dealIds: ["PROJECT_APOLLO"],
      clearanceLevel: 3,
    });
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signToken(createClaimsForPersona("retail_banker"));
    vi.setSystemTime(new Date("2026-01-01T00:16:00Z"));

    expect(() => verifyToken(token)).toThrow(/expired/i);
  });

  it("rejects a token with a tampered payload", () => {
    const token = signToken(createClaimsForPersona("retail_banker"));
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      clearanceLevel: number;
    };
    decoded.clearanceLevel = 4;
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString(
      "base64url",
    );

    expect(() =>
      verifyToken(`${header}.${tamperedPayload}.${signature}`),
    ).toThrow(/signature/i);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signToken(createClaimsForPersona("retail_banker"));
    process.env.JWT_SECRET = "a-different-secret-that-is-long-enough";

    expect(() => verifyToken(token)).toThrow(/signature/i);
  });

  it("rejects malformed claims after signature verification", () => {
    const token = jwt.sign(
      {
        sub: "demo:retail_banker",
        role: "retail_banker",
        branchIds: "NYC-01",
        clientIds: [],
        dealIds: [],
        clearanceLevel: 1,
      },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: "15m" },
    );

    expect(() => verifyToken(token)).toThrow();
  });
});

describe("persona endpoint", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("rejects an invalid persona", async () => {
    const response = await POST(personaRequest({ personaId: "administrator" }));

    expect(response.status).toBe(400);
  });

  it("rejects client-supplied elevated claims", async () => {
    const response = await POST(
      personaRequest({
        personaId: "retail_banker",
        role: "compliance_officer",
        clearanceLevel: 4,
        branchIds: ["ALL"],
        clientIds: ["ALL"],
        dealIds: ["ALL"],
      }),
    );

    expect(response.status).toBe(400);
  });

  it("gives an investment banker only the PROJECT_APOLLO deal scope", async () => {
    const response = await POST(
      personaRequest({ personaId: "investment_banker" }),
    );
    const body = (await response.json()) as { token: string };
    const claims = verifyToken(body.token);

    expect(claims.dealIds).toEqual(["PROJECT_APOLLO"]);
    expect(claims.branchIds).toEqual([]);
    expect(claims.clientIds).toEqual([]);
  });

  it("gives a retail banker only the NYC-01 branch scope", async () => {
    const response = await POST(
      personaRequest({ personaId: "retail_banker" }),
    );
    const body = (await response.json()) as { token: string };
    const claims = verifyToken(body.token);

    expect(claims.branchIds).toEqual(["NYC-01"]);
    expect(claims.clientIds).toEqual([]);
    expect(claims.dealIds).toEqual([]);
  });

  it("returns no employee JWT for a guest", async () => {
    const response = await POST(personaRequest({ personaId: "guest" }));
    const body = (await response.json()) as { token: null };

    expect(response.status).toBe(200);
    expect(body.token).toBeNull();
  });
});

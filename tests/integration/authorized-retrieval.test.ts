import { describe, expect, it } from "vitest";

import { getPersona } from "@/lib/auth/personas";
import { searchAuthorizedDocuments } from "@/lib/retrieval/search";

const REQUIRED_ENVIRONMENT = [
  "QDRANT_URL",
  "QDRANT_COLLECTION",
  "JINA_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSION",
] as const;
const integrationEnabled =
  process.env.RUN_QDRANT_INTEGRATION === "true" &&
  REQUIRED_ENVIRONMENT.every((name) => Boolean(process.env[name]));

describe.skipIf(!integrationEnabled)("authorized Qdrant retrieval integration", () => {
  it("returns only public chunks for the canonical guest", async () => {
    const response = await searchAuthorizedDocuments({
      query: "digital banking and branch services",
      user: getPersona("guest"),
      limit: 5,
    });

    expect(response.results.length).toBeGreaterThan(0);
    expect(
      response.results.every(
        (result) =>
          result.classification === "PUBLIC" &&
          result.metadata.minimumClearance === 0,
      ),
    ).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";

import syntheticDocuments from "@/data/synthetic_docs.json";
import type { EmbeddingService } from "@/lib/retrieval/embeddings";
import {
  createEmbeddingInput,
  prepareDocuments,
} from "@/lib/retrieval/preparation";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

const documents = BankingDocumentCollectionSchema.parse(syntheticDocuments);

describe("prepared document pipeline", () => {
  it("produces one embedded Qdrant-ready point per chunk", async () => {
    const embeddingService: EmbeddingService = {
      embedTexts: vi.fn(async (texts: readonly string[]) =>
        texts.map((_, index) => [index, 0.5, 1]),
      ),
    };
    const points = await prepareDocuments(documents, embeddingService);

    expect(points).toHaveLength(46);
    expect(new Set(points.map((point) => point.id)).size).toBe(points.length);
    expect(points.every((point) => point.vector.length === 3)).toBe(true);
    expect(embeddingService.embedTexts).toHaveBeenCalledTimes(1);
  });

  it("maps the same chunks to stable IDs across repeated preparation", async () => {
    const embeddingService: EmbeddingService = {
      embedTexts: async (texts) => texts.map(() => [1, 2, 3]),
    };

    const first = await prepareDocuments(documents, embeddingService);
    const second = await prepareDocuments(documents, embeddingService);

    expect(first.map((point) => point.id)).toEqual(
      second.map((point) => point.id),
    );
  });

  it("builds embedding input from semantic content, not authorization fields", () => {
    const chunk = {
      documentId: "DOC-1",
      documentTitle: "Example title",
      docType: "EXAMPLE_TYPE",
      allowedRoles: ["compliance_officer"] as const,
      minimumClearance: 4 as const,
      classification: "AUDIT" as const,
      branchId: "ALL",
      clientId: "ALL",
      dealId: "ALL",
      chunkIndex: 0,
      text: "Example synthetic content.",
    };
    const input = createEmbeddingInput({
      ...chunk,
      allowedRoles: [...chunk.allowedRoles],
    });

    expect(input).toContain("Example title");
    expect(input).toContain("Example synthetic content.");
    expect(input).not.toContain("compliance_officer");
    expect(input).not.toContain("AUDIT");
  });
});

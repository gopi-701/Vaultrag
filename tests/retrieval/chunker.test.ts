import { describe, expect, it } from "vitest";

import syntheticDocuments from "@/data/synthetic_docs.json";
import {
  chunkDocument,
  type DocumentChunk,
} from "@/lib/retrieval/chunker";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

const [baseDocument] = BankingDocumentCollectionSchema.parse(syntheticDocuments);
const longDocument = {
  ...baseDocument,
  content:
    "SYNTHETIC DATA — " +
    Array.from(
      { length: 45 },
      (_, index) => `banking-policy-segment-${index}`,
    ).join(" "),
};

function securityMetadata(chunk: DocumentChunk) {
  return {
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    docType: chunk.docType,
    allowedRoles: chunk.allowedRoles,
    minimumClearance: chunk.minimumClearance,
    classification: chunk.classification,
    branchId: chunk.branchId,
    clientId: chunk.clientId,
    dealId: chunk.dealId,
  };
}

describe("document chunking", () => {
  it("preserves security metadata exactly on every chunk", () => {
    const chunks = chunkDocument(longDocument, {
      chunkSize: 180,
      overlap: 40,
    });
    const expected = {
      documentId: longDocument.id,
      documentTitle: longDocument.title,
      docType: longDocument.docType,
      allowedRoles: longDocument.allowedRoles,
      minimumClearance: longDocument.minimumClearance,
      classification: longDocument.classification,
      branchId: longDocument.branchId,
      clientId: longDocument.clientId,
      dealId: longDocument.dealId,
    };

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) =>
      JSON.stringify(securityMetadata(chunk)) === JSON.stringify(expected),
    )).toBe(true);
  });

  it("produces deterministic sequential indexes", () => {
    const options = { chunkSize: 180, overlap: 40 };
    const first = chunkDocument(longDocument, options);
    const second = chunkDocument(longDocument, options);

    expect(first).toEqual(second);
    expect(first.map((chunk) => chunk.chunkIndex)).toEqual(
      first.map((_, index) => index),
    );
  });

  it("never produces empty chunk text", () => {
    const chunks = chunkDocument(longDocument, {
      chunkSize: 180,
      overlap: 40,
    });

    expect(chunks.every((chunk) => chunk.text.trim().length > 0)).toBe(true);
  });
});

import type { BankingDocument } from "@/lib/schemas/bankingDocument";

export const DEFAULT_CHUNK_SIZE = 800;
export const DEFAULT_CHUNK_OVERLAP = 120;

export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
}

export interface DocumentChunk {
  documentId: string;
  documentTitle: string;
  docType: BankingDocument["docType"];
  allowedRoles: BankingDocument["allowedRoles"];
  minimumClearance: BankingDocument["minimumClearance"];
  classification: BankingDocument["classification"];
  branchId: BankingDocument["branchId"];
  clientId: BankingDocument["clientId"];
  dealId: BankingDocument["dealId"];
  chunkIndex: number;
  text: string;
}

function validateOptions(chunkSize: number, overlap: number) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("Chunk size must be a positive integer");
  }

  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new Error("Chunk overlap must be a non-negative integer below chunk size");
  }
}

function chooseEnd(text: string, start: number, chunkSize: number): number {
  const maximumEnd = Math.min(start + chunkSize, text.length);

  if (maximumEnd === text.length) return maximumEnd;

  const minimumEnd = start + Math.floor(chunkSize * 0.6);
  const whitespace = text.lastIndexOf(" ", maximumEnd);
  return whitespace >= minimumEnd ? whitespace : maximumEnd;
}

function chooseNextStart(text: string, end: number, overlap: number): number {
  const target = Math.max(0, end - overlap);
  const whitespace = text.indexOf(" ", target);

  return whitespace >= 0 && whitespace < end ? whitespace + 1 : target;
}

/**
 * Uses whitespace-aware 800-character chunks with 120-character overlap.
 * This keeps the pipeline deterministic without introducing a tokenizer while
 * retaining enough neighboring context for the short synthetic banking prose.
 */
export function chunkDocument(
  document: BankingDocument,
  options: ChunkingOptions = {},
): DocumentChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_CHUNK_OVERLAP;
  validateOptions(chunkSize, overlap);

  const content = document.content.replace(/\s+/g, " ").trim();
  if (!content) throw new Error(`Document ${document.id} has no chunkable content`);

  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < content.length) {
    const end = chooseEnd(content, start, chunkSize);
    const text = content.slice(start, end).trim();

    if (!text) throw new Error(`Document ${document.id} produced an empty chunk`);

    chunks.push({
      documentId: document.id,
      documentTitle: document.title,
      docType: document.docType,
      allowedRoles: [...document.allowedRoles],
      minimumClearance: document.minimumClearance,
      classification: document.classification,
      branchId: document.branchId,
      clientId: document.clientId,
      dealId: document.dealId,
      chunkIndex: chunks.length,
      text,
    });

    if (end === content.length) break;
    start = chooseNextStart(content, end, overlap);
  }

  return chunks;
}

export function chunkDocuments(
  documents: readonly BankingDocument[],
  options: ChunkingOptions = {},
): DocumentChunk[] {
  return documents.flatMap((document) => chunkDocument(document, options));
}

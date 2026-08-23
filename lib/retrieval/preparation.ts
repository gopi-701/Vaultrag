import { createHash } from "node:crypto";

import {
  chunkDocuments,
  type DocumentChunk,
} from "@/lib/retrieval/chunker";
import {
  embedTexts,
  type EmbeddingService,
} from "@/lib/retrieval/embeddings";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

export interface PreparedPoint {
  id: string;
  vector: number[];
  payload: PreparedPointPayload;
}

export interface PreparedPointPayload extends DocumentChunk {
  datasetId: string;
}

export const SYNTHETIC_DATASET_ID = "vaultrag_synthetic_banking_v1";

export function createEmbeddingInput(chunk: DocumentChunk): string {
  return `Title: ${chunk.documentTitle}\nType: ${chunk.docType}\nContent: ${chunk.text}`;
}

export function createPointId(chunk: DocumentChunk): string {
  const hash = createHash("sha256")
    .update(`${SYNTHETIC_DATASET_ID}:${chunk.documentId}:${chunk.chunkIndex}`)
    .digest("hex")
    .slice(0, 32);

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
}

export async function prepareDocuments(
  input: unknown,
  embeddingService: EmbeddingService = { embedTexts },
): Promise<PreparedPoint[]> {
  const documents = BankingDocumentCollectionSchema.parse(input);
  const chunks = chunkDocuments(documents);
  const vectors = await embeddingService.embedTexts(
    chunks.map(createEmbeddingInput),
  );

  if (vectors.length !== chunks.length) {
    throw new Error("Embedding service did not return one vector per chunk");
  }

  return chunks.map((chunk, index) => ({
    id: createPointId(chunk),
    vector: vectors[index],
    payload: {
      ...chunk,
      datasetId: SYNTHETIC_DATASET_ID,
    },
  }));
}

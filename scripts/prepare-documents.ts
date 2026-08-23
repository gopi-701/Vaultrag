import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import syntheticDocuments from "@/data/synthetic_docs.json";
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
  payload: DocumentChunk;
}

export function createEmbeddingInput(chunk: DocumentChunk): string {
  return `Title: ${chunk.documentTitle}\nType: ${chunk.docType}\nContent: ${chunk.text}`;
}

function createPointId(chunk: DocumentChunk): string {
  const hash = createHash("sha256")
    .update(`${chunk.documentId}:${chunk.chunkIndex}`)
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
    payload: chunk,
  }));
}

async function main() {
  const documents = BankingDocumentCollectionSchema.parse(syntheticDocuments);
  const chunks = chunkDocuments(documents);

  if (process.argv.includes("--validate-only")) {
    console.log(`Validated ${documents.length} documents into ${chunks.length} chunks.`);
    return;
  }

  const points = await prepareDocuments(documents);
  const outputUrl = new URL("../data/prepared_chunks.json", import.meta.url);
  await writeFile(outputUrl, `${JSON.stringify(points, null, 2)}\n`, "utf8");
  console.log(`Prepared ${points.length} embedded chunks for Qdrant upsert.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

import { pathToFileURL } from "node:url";

import syntheticDocuments from "@/data/synthetic_docs.json";
import { getEmbeddingConfig } from "@/lib/env/embeddings";
import { getQdrantConfig } from "@/lib/env/qdrant";
import { embedTexts } from "@/lib/retrieval/embeddings";
import { ingestDocuments } from "@/lib/retrieval/ingestion";
import { createQdrantClient } from "@/lib/retrieval/qdrant";

async function main() {
  const qdrant = getQdrantConfig();
  const embedding = getEmbeddingConfig();
  const client = createQdrantClient(qdrant);
  const result = await ingestDocuments(syntheticDocuments, {
    client,
    collectionName: qdrant.collection,
    vectorDimension: embedding.dimension,
    embeddingService: { embedTexts },
    upsertBatchSize: 64,
  });

  console.log(
    `Upserted ${result.pointsUpserted} chunks into "${qdrant.collection}" in ${result.batchesCompleted} batch(es).`,
  );
  console.log(
    `Removed ${result.stalePointsDeleted} stale synthetic dataset point(s).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Document ingestion failed");
    process.exitCode = 1;
  });
}

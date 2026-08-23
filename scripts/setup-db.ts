import { pathToFileURL } from "node:url";

import { getEmbeddingModelConfig } from "@/lib/env/embeddings";
import { getQdrantConfig } from "@/lib/env/qdrant";
import {
  createQdrantClient,
  ensureCollection,
} from "@/lib/retrieval/qdrant";

async function main() {
  const qdrant = getQdrantConfig();
  const embedding = getEmbeddingModelConfig();
  const client = createQdrantClient(qdrant);
  const result = await ensureCollection(
    client,
    qdrant.collection,
    embedding.dimension,
  );

  console.log(
    result.created
      ? `Created Qdrant collection "${qdrant.collection}" with ${embedding.dimension}-dimensional cosine vectors.`
      : `Qdrant collection "${qdrant.collection}" already exists with compatible vector settings.`,
  );
  console.log(
    result.indexesCreated.length
      ? `Created payload indexes: ${result.indexesCreated.join(", ")}.`
      : "All required payload indexes already exist.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Qdrant setup failed");
    process.exitCode = 1;
  });
}

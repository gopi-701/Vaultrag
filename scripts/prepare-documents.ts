import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import syntheticDocuments from "@/data/synthetic_docs.json";
import { chunkDocuments } from "@/lib/retrieval/chunker";
import { prepareDocuments } from "@/lib/retrieval/preparation";
import { BankingDocumentCollectionSchema } from "@/lib/schemas/bankingDocument";

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

import { describe, expect, it, vi } from "vitest";

import type { EmbeddingConfig } from "@/lib/env/embeddings";
import { createJinaTransport } from "@/lib/retrieval/providers/jina";

const config: EmbeddingConfig = {
  provider: "jina",
  model: "jina-embeddings-v3",
  dimension: 1024,
  batchSize: 32,
  apiKey: "synthetic-jina-test-key",
};

describe("Jina embedding transport", () => {
  it("maps indexed Jina response data into input order", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [4, 5, 6] },
            { index: 0, embedding: [1, 2, 3] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const transport = createJinaTransport(config, fetchMock);

    await expect(transport.embedBatch(["first", "second"])).resolves.toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [, request] = fetchMock.mock.calls[0];
    expect(request?.headers).toEqual({
      Authorization: "Bearer synthetic-jina-test-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      model: "jina-embeddings-v3",
      input: ["first", "second"],
      task: "retrieval.passage",
      dimensions: 1024,
    });
  });

  it("rejects malformed Jina response envelopes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [] }), { status: 200 }),
    );
    const transport = createJinaTransport(config, fetchMock);

    await expect(transport.embedBatch(["input"])).rejects.toThrow();
  });
});

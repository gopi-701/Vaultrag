import type { SourceReference } from "@/components/chat/types";

function score(value: number) {
  return value.toFixed(3);
}

export function SourceList({
  sources,
  cited,
}: {
  sources: readonly SourceReference[];
  cited: boolean;
}) {
  if (sources.length === 0) return null;

  return (
    <section className="sources" aria-labelledby="sources-heading">
      <div className="sources-heading-row">
        <h3 id="sources-heading">{cited ? "Cited sources" : "Authorized context"}</h3>
        <span>{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
      </div>
      <div className="source-list">
        {sources.map((source) => (
          <article className="source-card" key={`${source.citationId}-${source.chunkId}`}>
            <div className="source-card-top">
              <span className="citation-id">{source.citationId}</span>
              <span className={`classification classification-${source.classification.toLowerCase()}`}>
                {source.classification}
              </span>
            </div>
            <h4>{source.documentTitle}</h4>
            <p>Chunk {source.chunkIndex + 1}</p>
            <dl className="score-row">
              <div><dt>Vector</dt><dd>{score(source.similarityScore)}</dd></div>
              <div><dt>Rerank</dt><dd>{score(source.rerankScore)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

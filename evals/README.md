# VaultRAG evaluation suite

`cases.json` is the deterministic benchmark definition. It covers retrieval relevance, reranking, authorization isolation, deterministic no-context behavior, cross-scope attacks, and prompt injection. Queries deliberately avoid simple title lookup.

## Commands

- `npm test` runs schema and metric tests without network access.
- `npm run eval:validate` validates the suite and prints its category counts.
- `npm run eval:live` runs the full Jina → Qdrant → Cohere → Groq pipeline and writes timestamped JSON plus `results/latest.md`.

Live evaluation requires `JWT_SECRET`, `JINA_API_KEY`, `QDRANT_URL`, `COHERE_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSION`. `QDRANT_API_KEY` remains optional for a local unsecured Qdrant instance. Missing required configuration is a hard failure, never a skip.

## Metric conventions

Recall@K, Precision@K, reciprocal rank, and Hit Rate@K use document IDs. Ranked chunks are deduplicated by document ID while preserving first occurrence before metrics are calculated. Metrics are `null` for security-only cases with an empty relevant set, and Precision uses K as its denominator.

Retrieval authorization violation rate evaluates every Qdrant result against the production policy evaluator. Context authorization violation rate independently evaluates chunks actually supplied to generation. Forbidden-document retrieval rate remains a separate case-fixture metric and does not define policy authorization. Empty denominators produce zero.

Cases declare `expectedOutcome` as `answer` or `no_authorized_context`. The suite measures context availability and the deterministic no-context path. Model-level semantic refusal quality is deliberately unimplemented until a deterministic judge contract exists.

Live result files are environment-specific and ignored. No benchmark result is checked in until it has actually been executed against a documented corpus and provider configuration.

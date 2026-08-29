# VaultRAG evaluation suite

`cases.json` is the deterministic benchmark definition. It covers retrieval relevance, reranking, authorization isolation, refusals, cross-scope attacks, and prompt injection. Queries deliberately avoid simple title lookup.

## Commands

- `npm test` runs schema and metric tests without network access.
- `npm run eval:validate` validates the suite and prints its category counts.
- `npm run eval:live` runs the full Jina → Qdrant → Cohere → Groq pipeline and writes timestamped JSON plus `results/latest.md`.

Live evaluation requires `JWT_SECRET`, `JINA_API_KEY`, `QDRANT_URL`, `COHERE_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSION`. `QDRANT_API_KEY` remains optional for a local unsecured Qdrant instance. Missing required configuration is a hard failure, never a skip.

## Metric conventions

Recall@K, Precision@K, reciprocal rank, and Hit Rate@K use expected relevant document IDs. They are `null` for security-only cases with an empty relevant set. Precision uses K as its denominator. Authorization violation rate is unauthorized chunks reaching final LLM context divided by all final context chunks. Forbidden-document retrieval rate is explicitly forbidden Qdrant hits divided by all Qdrant outputs. Empty denominators produce zero rather than a fabricated failure.

Live result files are environment-specific and ignored. No benchmark result is checked in until it has actually been executed against a documented corpus and provider configuration.

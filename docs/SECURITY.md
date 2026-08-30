# VaultRAG security model

VaultRAG is a demonstration of authorization-aware RAG, not a production identity platform or a security certification. This document describes controls that exist in the repository and the boundaries they depend on.

## Authentication versus authorization

Authentication establishes which application principal is making a request. Authorization determines which document metadata that principal is allowed to match.

In VaultRAG:

- **Authentication** is JWT signature/algorithm/payload/expiry verification or selection of the canonical public guest.
- **Authorization** is the RBAC + ABAC policy compiled from that verified principal and applied by Qdrant before vector matching.

A valid employee JWT does not imply access to every document. Conversely, semantic relevance never grants access.

## Demo authentication

The Persona Switcher sends only a predefined `personaId` to `/api/auth/persona`. Canonical employee roles, scopes, and clearance values live in `lib/auth/personas.ts`. The server constructs claims and signs a short-lived HS256 JWT using `JWT_SECRET`.

`/api/chat` accepts either:

- An employee body containing only `query`, plus an exact `Authorization: Bearer <token>` header.
- An explicit guest body containing `query` and `personaId: "guest"`, with no Authorization header.

Both request variants use strict Zod schemas. Body-supplied roles, clearances, scopes, subject IDs, or debug controls are rejected. A missing employee token never falls back silently to guest.

## JWT verification

`verifyToken()`:

1. Requires server-side `JWT_SECRET`.
2. Calls `jsonwebtoken.verify()` with `algorithms: ["HS256"]`.
3. Strictly validates the decoded payload with `UserClaimsSchema`.
4. Performs an explicit expiry check.
5. Returns `VerifiedUserClaims` only after all checks pass.

Expired, tampered, malformed, and wrong-secret tokens fail before retrieval and produce sanitized HTTP 401 responses.

This demo does not implement issuer/audience validation, revocation, refresh tokens, key rotation, SSO, or employee lifecycle management. A production deployment should use an organizational identity provider and a complete token-validation policy.

## Opaque trusted types

`VerifiedUserClaims` includes a private TypeScript `unique symbol` brand. No public casting or branding helper exists; the trusted assertion is confined to `verifyToken()` after runtime verification.

`AuthorizedSearchResult` follows the same principle. Its private brand is applied only after the pre-filtered Qdrant query returns and strict payload validation succeeds. Authorized reranking accepts only this branded result type.

These brands are compile-time application architecture boundaries. They do not add a runtime cryptographic property and cannot defend against explicit unsafe casts or untyped consumers.

## Browser/server trust boundary

The browser is an interaction and visualization layer. It may request a persona, retain the returned demo JWT in React memory, submit a question, and display server results. It does not:

- Create or sign employee claims.
- Compile authorization filters.
- Decide which chunks are authorized.
- Reconstruct sources from model text.
- Receive provider keys or `JWT_SECRET`.

Persona changes clear the previous in-memory employee token and invalidate in-flight chat requests. No demo JWT is written to local storage, session storage, a client-created cookie, a URL, or rendered inspector data.

## RBAC and ABAC policy

The policy uses:

- Explicit `allowedRoles`.
- Clearance hierarchy from public (0) to audit (4).
- Branch scopes.
- Client scopes.
- Deal scopes.

Public documents require clearance zero and are available to guest. Employee documents require sufficient clearance and the employee role unless the document is public. Null scope fields are unconstrained for that dimension. `ALL` behavior is defined by the central policy clauses.

Compliance is not a hardcoded administrator bypass. Its access comes from broad canonical scopes, audit clearance, and explicit `compliance_officer` entries in document `allowedRoles`. Banker-only content can remain unavailable to compliance.

## Pre-retrieval Qdrant enforcement

`searchAuthorizedDocuments()`:

1. Accepts only `VerifiedUserClaims | GuestPrincipal`.
2. Compiles the authorization policy.
3. Combines it with the synthetic dataset namespace.
4. Embeds the query using Jina's query task.
5. Sends vector, authorization filter, namespace filter, and limit in one Qdrant request.

Unauthorized chunks are not intentionally retrieved and removed later. `evaluateDocumentAccess()` exists for tests, evaluation, and explanation—not as a post-retrieval fallback.

The Security Inspector accurately reports `authorizationPrefilterApplied` from the secure retrieval layer. It does not claim that some broader result set was retrieved and blocked.

## Fail-closed data validation

Source documents, chunks, embedding vectors, Qdrant collection configuration, payload indexes, search payloads, Cohere indexes/scores, chat requests, environment settings, and generated citations are validated.

Examples of fail-closed behavior:

- Malformed or dimensionally inconsistent embeddings stop ingestion/query processing.
- Incompatible Qdrant vector or index configuration fails without destructive recreation.
- Search payloads missing required authorization metadata cannot become branded results.
- Cohere duplicate/out-of-range indexes or non-finite scores are rejected.
- Unknown model citation IDs are removed and never produce source records.
- Provider exceptions are translated to sanitized errors.

## Provider data boundaries

- **Jina** receives document embedding inputs during ingestion and query text during retrieval.
- **Qdrant** stores vectors, chunk text, document metadata, authorization metadata, and a dataset namespace.
- **Cohere** receives the user query and text of already-authorized candidate chunks. It does not receive JWTs, principals, filters, or VaultRAG metadata.
- **Groq** receives system instructions, the user question, and bounded authorized context. It does not receive JWTs, authorization filters, or provider credentials.

Provider retention, training, residency, access controls, and availability are external deployment considerations and are not controlled by this repository.

## Secret handling

All credentials are read from server-side environment variables. No secret uses `NEXT_PUBLIC_`. `.env.local` and other `.env*` files are ignored, except for placeholder-only `.env.example`.

Code avoids logging API keys, raw Authorization headers, JWTs, and credential-bearing provider errors. API responses return fixed sanitized error messages. Deployment operators remain responsible for secret storage, rotation, least privilege, and incident response.

## Guest behavior

The canonical guest has:

- `role: null`
- Clearance 0
- Empty branch, client, and deal scopes

Guest retrieval is restricted to public clearance-zero content. Employee-style requests without a JWT return 401. Guest requests that also carry an Authorization header are rejected as ambiguous.

## Prompt injection

Authorization is not delegated to prompts or the LLM, so user or document instructions cannot expand the Qdrant policy. Retrieved content is serialized inside explicit untrusted-data delimiters, and the system prompt directs Groq to ignore instructions found inside documents.

This reduces the impact of prompt injection but does not prove that a generative model will always follow instructions or produce a correct answer. The context boundary, trusted source mapping, citation validation, and deterministic no-context path limit what data is supplied and what source metadata can be fabricated. Model-output quality still requires evaluation and operational monitoring.

## Data and deployment assumptions

- The checked-in corpus is synthetic and contains no intended real PII.
- The demo assumes Qdrant payload indexes and collection configuration pass setup validation.
- TLS, network isolation, provider account configuration, infrastructure IAM, rate limiting, WAF controls, and persistent audit logging are outside this repository.
- The application has not been represented as deployed to production.

For attack-by-attack analysis and residual risks, see [Threat Model](THREAT_MODEL.md).

import { z } from "zod";

import { ClearanceLevelSchema, PersonaIdSchema, RoleSchema } from "@/lib/auth/claims";

export const SourceReferenceSchema = z.object({
  citationId: z.string().min(1),
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  classification: z.enum([
    "PUBLIC",
    "INTERNAL",
    "CONFIDENTIAL",
    "RESTRICTED",
    "AUDIT",
  ]),
  similarityScore: z.number().finite(),
  rerankScore: z.number().finite(),
});

export const ChatResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(SourceReferenceSchema),
  citedSources: z.array(SourceReferenceSchema),
  model: z.string().nullable(),
  debug: z.object({
    mode: z.enum(["employee", "guest"]),
    personaId: PersonaIdSchema,
    role: RoleSchema.nullable(),
    clearanceLevel: ClearanceLevelSchema,
    scopes: z.object({
      branchIds: z.array(z.string()),
      clientIds: z.array(z.string()),
      dealIds: z.array(z.string()),
    }),
    authorizationPrefilterApplied: z.literal(true),
    authorizationFilter: z.unknown(),
    vectorCandidateLimit: z.number().int().positive(),
    rerankedContextLimit: z.number().int().positive(),
    authorizedCandidateCount: z.number().int().nonnegative(),
    rerankedCount: z.number().int().nonnegative(),
    contextSourceIds: z.array(z.string()),
    retrievalLatencyMs: z.number().nonnegative(),
    retrievalAndRerankLatencyMs: z.number().nonnegative(),
    generationLatencyMs: z.number().nonnegative(),
  }),
});

export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

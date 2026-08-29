import { z } from "zod";

import { PersonaIdSchema } from "@/lib/auth/claims";

export const EvalCategorySchema = z.enum([
  "public",
  "retail_branch",
  "wealth_client",
  "credit",
  "investment_banking_deal",
  "compliance",
  "cross_scope_adversarial",
  "prompt_injection",
  "insufficient_authorized_context",
]);

const UniqueStringArraySchema = z.array(z.string().trim().min(1)).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "IDs must be unique" });
    }
  },
);

export const EvaluationCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    query: z.string().trim().min(3).max(2_000),
    persona: PersonaIdSchema,
    expectedRelevantDocumentIds: UniqueStringArraySchema,
    expectedRelevantChunkIds: UniqueStringArraySchema.default([]),
    expectedForbiddenDocumentIds: UniqueStringArraySchema,
    answerable: z.boolean(),
    category: EvalCategorySchema,
    notes: z.string().trim().min(1),
    adversarialInput: z
      .object({
        location: z.enum(["user_query", "retrieved_document"]),
        payload: z.string().trim().min(1),
      })
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.answerable && value.expectedRelevantDocumentIds.length === 0 &&
      value.expectedRelevantChunkIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["expectedRelevantDocumentIds"],
        message: "Answerable cases require an expected relevant ID",
      });
    }

    const forbidden = new Set(value.expectedForbiddenDocumentIds);
    const overlap = value.expectedRelevantDocumentIds.find((id) => forbidden.has(id));
    if (overlap) {
      context.addIssue({
        code: "custom",
        path: ["expectedForbiddenDocumentIds"],
        message: `Document ${overlap} cannot be both relevant and forbidden`,
      });
    }
  });

export const EvaluationSuiteSchema = z
  .array(EvaluationCaseSchema)
  .min(1)
  .superRefine((cases, context) => {
    const seen = new Set<string>();
    for (const [index, evaluationCase] of cases.entries()) {
      if (seen.has(evaluationCase.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate evaluation case ID: ${evaluationCase.id}`,
        });
      }
      seen.add(evaluationCase.id);
    }
  });

export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;
export type EvalCategory = z.infer<typeof EvalCategorySchema>;

export function parseEvaluationSuite(input: unknown): EvaluationCase[] {
  return EvaluationSuiteSchema.parse(input);
}

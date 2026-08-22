import { z } from "zod";

import {
  ClearanceLevelSchema,
  RoleSchema,
  type ClearanceLevel,
} from "@/lib/auth/claims";

export const DocumentClassificationSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "AUDIT",
]);

export const CLASSIFICATION_CLEARANCE = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  AUDIT: 4,
} as const satisfies Record<
  z.infer<typeof DocumentClassificationSchema>,
  ClearanceLevel
>;

export const BankingDocumentSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    docType: z.string().min(1),
    classification: DocumentClassificationSchema,
    minimumClearance: ClearanceLevelSchema,
    allowedRoles: z.array(RoleSchema),
    branchId: z.string().min(1).nullable(),
    clientId: z.string().min(1).nullable(),
    dealId: z.string().min(1).nullable(),
    content: z.string().min(80).startsWith("SYNTHETIC DATA —"),
  })
  .strict()
  .superRefine((document, context) => {
    if (
      document.minimumClearance !==
      CLASSIFICATION_CLEARANCE[document.classification]
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumClearance"],
        message: "Minimum clearance must match the document classification",
      });
    }

    if (document.classification === "PUBLIC" && document.allowedRoles.length) {
      context.addIssue({
        code: "custom",
        path: ["allowedRoles"],
        message: "Public documents must not require an employee role",
      });
    }
  });

export const BankingDocumentCollectionSchema = z.array(BankingDocumentSchema);

export type DocumentClassification = z.infer<
  typeof DocumentClassificationSchema
>;
export type BankingDocument = z.infer<typeof BankingDocumentSchema>;

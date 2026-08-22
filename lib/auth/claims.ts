import { z } from "zod";

export const RoleSchema = z.enum([
  "retail_banker",
  "wealth_manager",
  "credit_analyst",
  "investment_banker",
  "compliance_officer",
]);

export const ClearanceLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const PersonaIdSchema = z.enum([...RoleSchema.options, "guest"]);

export const UserClaimsSchema = z
  .object({
    sub: z.string().min(1),
    role: RoleSchema,
    branchIds: z.array(z.string()),
    clientIds: z.array(z.string()),
    dealIds: z.array(z.string()),
    clearanceLevel: ClearanceLevelSchema,
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export const PersonaRequestSchema = z
  .object({
    personaId: PersonaIdSchema,
  })
  .strict();

export type Role = z.infer<typeof RoleSchema>;
export type ClearanceLevel = z.infer<typeof ClearanceLevelSchema>;
export type PersonaId = z.infer<typeof PersonaIdSchema>;
export type UserClaims = z.infer<typeof UserClaimsSchema>;
export type UnsignedUserClaims = Omit<UserClaims, "iat" | "exp">;

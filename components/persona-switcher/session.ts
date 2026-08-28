import { z } from "zod";

import { PersonaIdSchema, RoleSchema, type PersonaId } from "@/lib/auth/claims";

const PersonaResponseSchema = z.object({
  token: z.string().min(1).nullable(),
  persona: z.object({
    personaId: PersonaIdSchema,
    role: RoleSchema.nullable(),
    branchIds: z.array(z.string()),
    clientIds: z.array(z.string()),
    dealIds: z.array(z.string()),
    clearanceLevel: z.number().int().min(0).max(4),
  }),
});

export type PersonaSession =
  | { personaId: "guest"; token: null }
  | { personaId: Exclude<PersonaId, "guest">; token: string };

export const GUEST_SESSION: PersonaSession = {
  personaId: "guest",
  token: null,
};

export function createPersonaRequest(personaId: Exclude<PersonaId, "guest">) {
  return {
    url: "/api/auth/persona",
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId }),
    } satisfies RequestInit,
  };
}

export function resolveEmployeeSession(
  requestedPersonaId: Exclude<PersonaId, "guest">,
  response: unknown,
): PersonaSession {
  const parsed = PersonaResponseSchema.parse(response);

  if (
    parsed.persona.personaId !== requestedPersonaId ||
    parsed.persona.role !== requestedPersonaId ||
    !parsed.token
  ) {
    throw new Error("Persona service returned an invalid session");
  }

  return { personaId: requestedPersonaId, token: parsed.token };
}

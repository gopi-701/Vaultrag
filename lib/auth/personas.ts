import "server-only";

import type {
  ClearanceLevel,
  PersonaId,
  Role,
  UnsignedUserClaims,
} from "./claims";

export interface SafePersonaMetadata {
  personaId: PersonaId;
  role: Role | null;
  branchIds: readonly string[];
  clientIds: readonly string[];
  dealIds: readonly string[];
  clearanceLevel: ClearanceLevel;
}

const PERSONAS = {
  retail_banker: {
    personaId: "retail_banker",
    role: "retail_banker",
    branchIds: ["NYC-01"],
    clientIds: [],
    dealIds: [],
    clearanceLevel: 1,
  },
  wealth_manager: {
    personaId: "wealth_manager",
    role: "wealth_manager",
    branchIds: [],
    clientIds: ["CUST-8832"],
    dealIds: [],
    clearanceLevel: 2,
  },
  credit_analyst: {
    personaId: "credit_analyst",
    role: "credit_analyst",
    branchIds: ["ALL"],
    clientIds: [],
    dealIds: [],
    clearanceLevel: 2,
  },
  investment_banker: {
    personaId: "investment_banker",
    role: "investment_banker",
    branchIds: [],
    clientIds: [],
    dealIds: ["PROJECT_APOLLO"],
    clearanceLevel: 3,
  },
  compliance_officer: {
    personaId: "compliance_officer",
    role: "compliance_officer",
    branchIds: ["ALL"],
    clientIds: ["ALL"],
    dealIds: ["ALL"],
    clearanceLevel: 4,
  },
  guest: {
    personaId: "guest",
    role: null,
    branchIds: [],
    clientIds: [],
    dealIds: [],
    clearanceLevel: 0,
  },
} as const satisfies Record<PersonaId, SafePersonaMetadata>;

export function getPersona(personaId: PersonaId): SafePersonaMetadata {
  return PERSONAS[personaId];
}

export function createClaimsForPersona(
  personaId: Exclude<PersonaId, "guest">,
): UnsignedUserClaims {
  const persona = PERSONAS[personaId];

  return {
    sub: `demo:${personaId}`,
    role: persona.role,
    branchIds: [...persona.branchIds],
    clientIds: [...persona.clientIds],
    dealIds: [...persona.dealIds],
    clearanceLevel: persona.clearanceLevel,
  };
}

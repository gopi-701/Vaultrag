import type { PersonaSession } from "@/components/persona-switcher/session";

export function createChatRequest(query: string, session: PersonaSession) {
  const body = session.personaId === "guest"
    ? { query, personaId: "guest" as const }
    : { query };

  return {
    url: "/api/chat",
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session.token
          ? { authorization: `Bearer ${session.token}` }
          : {}),
      },
      body: JSON.stringify(body),
    } satisfies RequestInit,
  };
}

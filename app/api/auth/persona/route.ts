import { PersonaRequestSchema } from "@/lib/auth/claims";
import {
  createClaimsForPersona,
  getPersona,
} from "@/lib/auth/personas";
import { signToken } from "@/lib/auth/signToken";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const result = PersonaRequestSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: "Invalid persona request" }, { status: 400 });
  }

  const { personaId } = result.data;
  const persona = getPersona(personaId);

  if (personaId === "guest") {
    return Response.json({ token: null, persona });
  }

  const token = signToken(createClaimsForPersona(personaId));

  return Response.json({ token, persona });
}

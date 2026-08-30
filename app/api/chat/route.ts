import { z } from "zod";

import { getPersona } from "@/lib/auth/personas";
import { verifyToken } from "@/lib/auth/verifyToken";
import {
  answerAuthorizedQuery,
  type AnswerAuthorizedQueryInput,
} from "@/lib/rag/answerQuery";

export const runtime = "nodejs";

const QuerySchema = z.string().trim().min(1).max(2_000);
const EmployeeChatRequestSchema = z.object({ query: QuerySchema }).strict();
const GuestChatRequestSchema = z
  .object({ query: QuerySchema, personaId: z.literal("guest") })
  .strict();
const ChatRequestSchema = z.union([
  GuestChatRequestSchema,
  EmployeeChatRequestSchema,
]);

interface ChatRouteDependencies {
  verify?: typeof verifyToken;
  answer?: (input: AnswerAuthorizedQueryInput) => ReturnType<typeof answerAuthorizedQuery>;
}

const INVALID_REQUEST = { error: "Invalid request" };
const AUTHENTICATION_REQUIRED = { error: "Authentication required" };
const INVALID_AUTHENTICATION = { error: "Invalid or expired authentication" };
const SERVER_FAILURE = { error: "Unable to answer query" };

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

export function createChatPostHandler(dependencies: ChatRouteDependencies = {}) {
  const verify = dependencies.verify ?? verifyToken;
  const answer = dependencies.answer ?? answerAuthorizedQuery;

  return async function chatPost(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(INVALID_REQUEST, { status: 400 });
    }

    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(INVALID_REQUEST, { status: 400 });
    }

    const isGuest = "personaId" in parsed.data;
    const authorization = request.headers.get("authorization");
    let principal: AnswerAuthorizedQueryInput["principal"];

    if (isGuest) {
      if (authorization !== null) {
        return Response.json(INVALID_REQUEST, { status: 400 });
      }
      principal = getPersona("guest");
    } else {
      const token = bearerToken(request);
      if (!token) {
        return Response.json(AUTHENTICATION_REQUIRED, { status: 401 });
      }
      try {
        principal = verify(token);
      } catch {
        return Response.json(INVALID_AUTHENTICATION, { status: 401 });
      }
    }

    try {
      return Response.json(
        await answer({ query: parsed.data.query, principal }),
      );
    } catch {
      return Response.json(SERVER_FAILURE, { status: 500 });
    }
  };
}

export const POST = createChatPostHandler();

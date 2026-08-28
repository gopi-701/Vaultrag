"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { createChatRequest } from "@/components/chat/request";
import {
  ChatRequestCoordinator,
  executeChatRequest,
} from "@/components/chat/request-coordinator";
import { ChatResponseSchema, type ChatResponse } from "@/components/chat/types";
import {
  GUEST_SESSION,
  createPersonaRequest,
  resolveEmployeeSession,
  type PersonaSession,
} from "@/components/persona-switcher/session";
import {
  PersonaSwitcher,
  personaLabel,
} from "@/components/persona-switcher/persona-switcher";
import { SecurityInspector } from "@/components/security-inspector/security-inspector";
import type { PersonaId } from "@/lib/auth/claims";

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function VaultRagWorkspace() {
  const [session, setSession] = useState<PersonaSession>(GUEST_SESSION);
  const [pendingPersonaId, setPendingPersonaId] = useState<PersonaId | null>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const personaRequestSequence = useRef(0);
  const submissionInFlight = useRef(false);
  const [chatCoordinator] = useState(() => new ChatRequestCoordinator());

  useEffect(() => () => {
    personaRequestSequence.current += 1;
    chatCoordinator.invalidate();
    submissionInFlight.current = false;
  }, [chatCoordinator]);

  function clearConversation() {
    setResponse(null);
    setError(null);
    setQuery("");
  }

  async function selectPersona(personaId: PersonaId) {
    const sequence = ++personaRequestSequence.current;
    chatCoordinator.invalidate();
    submissionInFlight.current = false;
    setLoading(false);
    clearConversation();
    setSession(GUEST_SESSION);

    if (personaId === "guest") {
      setPendingPersonaId(null);
      return;
    }

    setPendingPersonaId(personaId);
    try {
      const request = createPersonaRequest(personaId);
      const personaResponse = await fetch(request.url, request.init);
      const payload = await readJson(personaResponse);
      if (!personaResponse.ok) throw new Error("Persona request failed");
      const nextSession = resolveEmployeeSession(personaId, payload);
      if (sequence === personaRequestSequence.current) setSession(nextSession);
    } catch {
      if (sequence === personaRequestSequence.current) {
        setError("Unable to start that persona session. Please try again.");
      }
    } finally {
      if (sequence === personaRequestSequence.current) setPendingPersonaId(null);
    }
  }

  async function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || loading || pendingPersonaId || submissionInFlight.current) return;

    const chatRequest = createChatRequest(trimmedQuery, session);
    await executeChatRequest({
      coordinator: chatCoordinator,
      url: chatRequest.url,
      init: chatRequest.init,
      parse: (payload) => ChatResponseSchema.parse(payload),
      onStarted: () => {
        submissionInFlight.current = true;
        setLoading(true);
        setError(null);
        setResponse(null);
      },
      onSuccess: setResponse,
      onUnauthorized: () => setSession(GUEST_SESSION),
      onError: setError,
      onFinished: () => {
        submissionInFlight.current = false;
        setLoading(false);
      },
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">V</span>
          <div><strong>VaultRAG</strong><small>Secure banking intelligence</small></div>
        </div>
        <div className="active-persona">
          <span>Active persona</span>
          <strong>{pendingPersonaId ? `Verifying ${personaLabel(pendingPersonaId)}…` : personaLabel(session.personaId)}</strong>
        </div>
      </header>

      <div className="workspace-grid">
        <PersonaSwitcher
          activePersonaId={session.personaId}
          pendingPersonaId={pendingPersonaId}
          onSelect={selectPersona}
        />
        <ChatPanel
          personaId={session.personaId}
          query={query}
          response={response}
          error={error}
          loading={loading}
          sessionReady={pendingPersonaId === null}
          onQueryChange={setQuery}
          onSubmit={submitQuery}
        />
        <SecurityInspector response={response} />
      </div>
    </div>
  );
}

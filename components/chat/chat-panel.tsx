import type { FormEvent } from "react";

import { SourceList } from "@/components/chat/source-list";
import type { ChatResponse } from "@/components/chat/types";
import type { PersonaId } from "@/lib/auth/claims";
import { personaLabel } from "@/components/persona-switcher/persona-switcher";

interface ChatPanelProps {
  personaId: PersonaId;
  query: string;
  response: ChatResponse | null;
  error: string | null;
  loading: boolean;
  sessionReady: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ChatPanel({
  personaId,
  query,
  response,
  error,
  loading,
  sessionReady,
  onQueryChange,
  onSubmit,
}: ChatPanelProps) {
  const displayedSources = response?.citedSources.length
    ? response.citedSources
    : response?.sources ?? [];

  return (
    <main className="chat-panel">
      <div className="chat-heading">
        <div>
          <p className="eyebrow">Secure assistant</p>
          <h1>Ask VaultRAG</h1>
        </div>
        <div className="identity-pill">
          <span className="status-dot" aria-hidden="true" />
          {personaLabel(personaId)}
        </div>
      </div>

      <div className="conversation" aria-live="polite">
        {!response && !loading && !error ? (
          <div className="empty-chat">
            <div className="vault-symbol" aria-hidden="true">V</div>
            <h2>Ask across your authorized knowledge</h2>
            <p>
              Results are filtered using your verified access before documents are retrieved.
            </p>
            <div className="prompt-examples">
              <span>Try a product policy, portfolio review, deal memo, or audit procedure.</span>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="loading-answer" role="status">
            <span className="loading-bar" />
            <span className="loading-bar short" />
            <p>Searching authorized records and preparing an answer…</p>
          </div>
        ) : null}

        {error ? <div className="error-message" role="alert">{error}</div> : null}

        {response ? (
          <div className="answer-block">
            <div className="answer-label">VaultRAG response</div>
            <p className="answer-text">{response.answer}</p>
            <SourceList
              sources={displayedSources}
              cited={response.citedSources.length > 0}
            />
          </div>
        ) : null}
      </div>

      <form className="query-form" onSubmit={onSubmit}>
        <label htmlFor="vault-query">Your question</label>
        <div className="query-box">
          <textarea
            id="vault-query"
            maxLength={2_000}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Ask about an authorized banking document…"
            rows={3}
            value={query}
          />
          <button
            className="send-button"
            disabled={loading || !query.trim() || !sessionReady}
            type="submit"
          >
            {loading ? "Working…" : "Send"}
          </button>
        </div>
        <div className="query-help">
          <span>Answers use only retrieved context available to this persona.</span>
          <span>{query.length}/2000</span>
        </div>
      </form>
    </main>
  );
}

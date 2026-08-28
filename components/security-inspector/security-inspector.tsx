import type { ChatResponse } from "@/components/chat/types";
import { personaLabel } from "@/components/persona-switcher/persona-switcher";

function ScopeList({ values }: { values: readonly string[] }) {
  return values.length ? (
    <div className="scope-list">{values.map((value) => <span key={value}>{value}</span>)}</div>
  ) : <span className="muted-value">None</span>;
}

function milliseconds(value: number) {
  return `${value.toFixed(1)} ms`;
}

export function SecurityInspector({ response }: { response: ChatResponse | null }) {
  const debug = response?.debug;

  return (
    <aside className="inspector" aria-labelledby="inspector-heading">
      <div className="panel-heading inspector-heading">
        <p className="eyebrow">Request trace</p>
        <h2 id="inspector-heading">Security Inspector</h2>
        <p>Server-reported authorization and retrieval telemetry.</p>
      </div>

      {!debug ? (
        <div className="inspector-empty">
          <span className="inspector-lock" aria-hidden="true">V</span>
          <p>Send a query to inspect how access controls shape retrieval.</p>
        </div>
      ) : (
        <div className="inspector-content">
          <section className="inspector-section">
            <div className="section-title"><span>01</span><h3>Verified identity</h3></div>
            <dl className="identity-grid">
              <div><dt>Persona</dt><dd>{personaLabel(debug.personaId)}</dd></div>
              <div><dt>Role</dt><dd>{debug.role ?? "Public guest"}</dd></div>
              <div><dt>Clearance</dt><dd>Level {debug.clearanceLevel}</dd></div>
            </dl>
            <div className="scope-row"><span>Branches</span><ScopeList values={debug.scopes.branchIds} /></div>
            <div className="scope-row"><span>Clients</span><ScopeList values={debug.scopes.clientIds} /></div>
            <div className="scope-row"><span>Deals</span><ScopeList values={debug.scopes.dealIds} /></div>
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>02</span><h3>Authorization</h3></div>
            <div className="verified-banner">
              <span className="verified-mark" aria-hidden="true">✓</span>
              <div><strong>Pre-filter applied</strong><small>Before vector matching</small></div>
            </div>
            <div className="security-flow" aria-label="Authorization flow">
              <span>Policy filter</span><b>↓</b><span>Eligible records only</span><b>↓</b><span>Vector search</span>
            </div>
            <details className="filter-details">
              <summary>View Qdrant filter</summary>
              <pre>{JSON.stringify(debug.authorizationFilter, null, 2)}</pre>
            </details>
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>03</span><h3>Retrieval</h3></div>
            <dl className="metric-list">
              <div><dt>Requested candidates</dt><dd>{debug.vectorCandidateLimit}</dd></div>
              <div><dt>Authorized hits returned</dt><dd>{debug.authorizedCandidateCount}</dd></div>
              <div><dt>Qdrant latency</dt><dd>{milliseconds(debug.retrievalLatencyMs)}</dd></div>
            </dl>
            {response.sources.length ? (
              <div className="mini-scores">
                {response.sources.map((source) => (
                  <div key={source.chunkId}><span>{source.citationId}</span><meter min="0" max="1" value={Math.max(0, Math.min(1, source.similarityScore))} /><b>{source.similarityScore.toFixed(3)}</b></div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>04</span><h3>Reranking</h3></div>
            <dl className="metric-list">
              <div><dt>Reranker</dt><dd>Cohere</dd></div>
              <div><dt>Input candidates</dt><dd>{debug.authorizedCandidateCount}</dd></div>
              <div><dt>Selected</dt><dd>{debug.rerankedCount} / {debug.rerankedContextLimit}</dd></div>
              <div><dt>Retrieval + rerank</dt><dd>{milliseconds(debug.retrievalAndRerankLatencyMs)}</dd></div>
            </dl>
            {response.sources.length ? (
              <div className="mini-scores rerank-scores">
                {response.sources.map((source) => (
                  <div key={source.chunkId}><span>{source.citationId}</span><meter min="0" max="1" value={Math.max(0, Math.min(1, source.rerankScore))} /><b>{source.rerankScore.toFixed(3)}</b></div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>05</span><h3>Generation</h3></div>
            <dl className="metric-list">
              <div><dt>Context sources</dt><dd>{debug.contextSourceIds.join(", ") || "None"}</dd></div>
              <div><dt>Model</dt><dd>{response.model ?? "Not called"}</dd></div>
              <div><dt>Generation latency</dt><dd>{milliseconds(debug.generationLatencyMs)}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </aside>
  );
}

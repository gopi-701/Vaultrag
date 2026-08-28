import type { PersonaId } from "@/lib/auth/claims";

const PERSONA_OPTIONS: ReadonlyArray<{
  id: PersonaId;
  label: string;
  summary: string;
  initials: string;
}> = [
  { id: "retail_banker", label: "Retail Banker", summary: "Branch operations", initials: "RB" },
  { id: "wealth_manager", label: "Wealth Manager", summary: "Client portfolios", initials: "WM" },
  { id: "credit_analyst", label: "Credit Analyst", summary: "Credit review", initials: "CA" },
  { id: "investment_banker", label: "Investment Banker", summary: "Deal materials", initials: "IB" },
  { id: "compliance_officer", label: "Compliance Officer", summary: "Audit oversight", initials: "CO" },
  { id: "guest", label: "Guest", summary: "Public information", initials: "GU" },
];

export function personaLabel(personaId: PersonaId) {
  return PERSONA_OPTIONS.find((persona) => persona.id === personaId)?.label ?? personaId;
}

interface PersonaSwitcherProps {
  activePersonaId: PersonaId;
  pendingPersonaId: PersonaId | null;
  onSelect: (personaId: PersonaId) => void;
}

export function PersonaSwitcher({
  activePersonaId,
  pendingPersonaId,
  onSelect,
}: PersonaSwitcherProps) {
  return (
    <section className="persona-panel" aria-labelledby="persona-heading">
      <div className="panel-heading">
        <p className="eyebrow">Demo access</p>
        <h2 id="persona-heading">Persona</h2>
        <p>Switch roles to see server-enforced retrieval boundaries.</p>
      </div>
      <div className="persona-list" role="list">
        {PERSONA_OPTIONS.map((persona) => {
          const active = activePersonaId === persona.id;
          const pending = pendingPersonaId === persona.id;
          return (
            <button
              className="persona-option"
              data-active={active}
              disabled={pendingPersonaId !== null}
              key={persona.id}
              onClick={() => onSelect(persona.id)}
              type="button"
              aria-pressed={active}
            >
              <span className="persona-mark" aria-hidden="true">{persona.initials}</span>
              <span className="persona-copy">
                <strong>{pending ? "Verifying…" : persona.label}</strong>
                <small>{persona.summary}</small>
              </span>
              <span className="persona-check" aria-hidden="true">{active ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <p className="persona-note">
        Employee access is issued by the server and kept only for this page session.
      </p>
    </section>
  );
}

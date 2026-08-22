import { describe, expect, it } from "vitest";

import syntheticDocuments from "@/data/synthetic_docs.json";
import { getPersona } from "@/lib/auth/personas";
import {
  evaluateDocumentAccess,
  type DocumentMetadata,
} from "@/lib/authorization";
import {
  BankingDocumentCollectionSchema,
  DocumentClassificationSchema,
  type BankingDocument,
} from "@/lib/schemas/bankingDocument";

const documents = BankingDocumentCollectionSchema.parse(syntheticDocuments);

function findDocument(id: string): BankingDocument {
  const result = documents.find((document) => document.id === id);

  if (!result) throw new Error(`Missing synthetic document ${id}`);
  return result;
}

function authorizationMetadata(document: BankingDocument): DocumentMetadata {
  return {
    documentId: document.id,
    documentTitle: document.title,
    docType: document.docType,
    allowedRoles: document.allowedRoles,
    minimumClearance: document.minimumClearance,
    branchId: document.branchId,
    clientId: document.clientId,
    dealId: document.dealId,
    classification: document.classification,
    chunkIndex: 0,
  };
}

describe("synthetic banking knowledge base", () => {
  it("validates every generated document through the collection schema", () => {
    expect(documents).toHaveLength(46);
    expect(documents.every((document) => document.content.startsWith("SYNTHETIC DATA —"))).toBe(true);
  });

  it("contains only unique document IDs", () => {
    const ids = documents.map((document) => document.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains examples of every classification", () => {
    const classifications = new Set(
      documents.map((document) => document.classification),
    );

    expect(classifications).toEqual(
      new Set(DocumentClassificationSchema.options),
    );
  });

  it("keeps every public document at clearance zero and role-free", () => {
    const publicDocuments = documents.filter(
      (document) => document.classification === "PUBLIC",
    );

    expect(publicDocuments.length).toBeGreaterThan(0);
    expect(
      publicDocuments.every(
        (document) =>
          document.minimumClearance === 0 &&
          document.allowedRoles.length === 0,
      ),
    ).toBe(true);
  });

  it("restricts Project Apollo business documents appropriately", () => {
    const apolloBusinessDocuments = documents.filter(
      (document) =>
        document.dealId === "PROJECT_APOLLO" &&
        document.docType.startsWith("INVESTMENT_BANKING_"),
    );

    expect(apolloBusinessDocuments).toHaveLength(4);
    expect(
      apolloBusinessDocuments.every(
        (document) =>
          document.classification === "RESTRICTED" &&
          document.minimumClearance === 3 &&
          document.allowedRoles.includes("investment_banker"),
      ),
    ).toBe(true);
    expect(
      apolloBusinessDocuments.some(
        (document) => !document.allowedRoles.includes("compliance_officer"),
      ),
    ).toBe(true);
    expect(
      apolloBusinessDocuments.some((document) =>
        document.allowedRoles.includes("compliance_officer"),
      ),
    ).toBe(true);
  });

  it("contains three meaningful audit-classified compliance documents", () => {
    const auditDocuments = documents.filter(
      (document) => document.classification === "AUDIT",
    );

    expect(auditDocuments).toHaveLength(3);
    expect(
      auditDocuments.every(
        (document) =>
          document.minimumClearance === 4 &&
          document.allowedRoles.includes("compliance_officer"),
      ),
    ).toBe(true);
  });

  it("grants Apollo access only to explicitly listed roles", () => {
    const businessDocument = findDocument("IB-APL-002");
    const auditableDocument = findDocument("IB-APL-003");
    const investmentBanker = getPersona("investment_banker");
    const complianceOfficer = getPersona("compliance_officer");

    expect(
      evaluateDocumentAccess(
        investmentBanker,
        authorizationMetadata(businessDocument),
      ).allowed,
    ).toBe(true);
    expect(auditableDocument.allowedRoles).toContain("compliance_officer");
    expect(
      evaluateDocumentAccess(
        complianceOfficer,
        authorizationMetadata(auditableDocument),
      ).allowed,
    ).toBe(true);

    for (const personaId of [
      "retail_banker",
      "wealth_manager",
      "credit_analyst",
    ] as const) {
      expect(
        evaluateDocumentAccess(
          getPersona(personaId),
          authorizationMetadata(auditableDocument),
        ).allowed,
      ).toBe(false);
    }

    const withoutComplianceRole = {
      ...authorizationMetadata(auditableDocument),
      allowedRoles: ["investment_banker"] as const,
    };
    expect(
      evaluateDocumentAccess(complianceOfficer, {
        ...withoutComplianceRole,
        allowedRoles: [...withoutComplianceRole.allowedRoles],
      }).allowed,
    ).toBe(false);
  });

  it("contains adversarial same-role documents isolated by client scope", () => {
    const client8832 = findDocument("WLT-8832-002");
    const client9911 = findDocument("WLT-9911-002");
    const wealthManager = getPersona("wealth_manager");

    expect(client8832.title).toContain("Portfolio Review");
    expect(client9911.title).toContain("Portfolio Review");
    expect(
      evaluateDocumentAccess(
        wealthManager,
        authorizationMetadata(client8832),
      ).allowed,
    ).toBe(true);
    expect(
      evaluateDocumentAccess(
        wealthManager,
        authorizationMetadata(client9911),
      ).allowed,
    ).toBe(false);
  });

  it("contains adversarial same-role documents isolated by deal scope", () => {
    const apollo = findDocument("IB-APL-002");
    const atlas = findDocument("IB-ATL-002");
    const investmentBanker = getPersona("investment_banker");

    expect(apollo.title).toContain("Valuation Memo");
    expect(atlas.title).toContain("Valuation Memo");
    expect(
      evaluateDocumentAccess(
        investmentBanker,
        authorizationMetadata(apollo),
      ).allowed,
    ).toBe(true);
    expect(
      evaluateDocumentAccess(
        investmentBanker,
        authorizationMetadata(atlas),
      ).allowed,
    ).toBe(false);
  });

  it("contains adversarial credit policy documents isolated by branch", () => {
    const nycPolicy = findDocument("CRD-NYC-001");
    const londonPolicy = findDocument("CRD-LON-001");
    const retailBanker = getPersona("retail_banker");

    expect(
      evaluateDocumentAccess(
        retailBanker,
        authorizationMetadata(nycPolicy),
      ).allowed,
    ).toBe(true);
    expect(
      evaluateDocumentAccess(
        retailBanker,
        authorizationMetadata(londonPolicy),
      ).allowed,
    ).toBe(false);
  });

  it("includes all required adversarial scopes and branch examples", () => {
    expect(documents.some((document) => document.branchId === "NYC-01")).toBe(true);
    expect(documents.some((document) => document.branchId === "LON-02")).toBe(true);
    expect(documents.some((document) => document.branchId === "SFO-03")).toBe(true);
    expect(documents.some((document) => document.clientId === "CUST-8832")).toBe(true);
    expect(documents.some((document) => document.clientId === "CUST-9911")).toBe(true);
    expect(documents.some((document) => document.dealId === "PROJECT_APOLLO")).toBe(true);
    expect(documents.some((document) => document.dealId === "PROJECT_ATLAS")).toBe(true);
  });
});

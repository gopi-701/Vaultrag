import { writeFile } from "node:fs/promises";

import type { Role } from "@/lib/auth/claims";
import {
  BankingDocumentCollectionSchema,
  CLASSIFICATION_CLEARANCE,
  type BankingDocument,
  type DocumentClassification,
} from "@/lib/schemas/bankingDocument";

interface DocumentOptions {
  roles?: Role[];
  branchId?: string | null;
  clientId?: string | null;
  dealId?: string | null;
}

function document(
  id: string,
  title: string,
  docType: string,
  classification: DocumentClassification,
  content: string,
  options: DocumentOptions = {},
): BankingDocument {
  return {
    id,
    title,
    docType,
    classification,
    minimumClearance: CLASSIFICATION_CLEARANCE[classification],
    allowedRoles: options.roles ?? [],
    branchId: options.branchId ?? null,
    clientId: options.clientId ?? null,
    dealId: options.dealId ?? null,
    content: `SYNTHETIC DATA — ${content}`,
  };
}

function detailedContent(
  subject: string,
  scope: string,
  context: string,
  analysis: string,
  controls: string,
  findings: string,
  actions: string,
): string {
  return `${subject} Purpose and context: ${context} This record is wholly fictional and uses invented organizations, identifiers, balances, and scenarios solely for secure retrieval testing.

Scope and assumptions: ${scope} The analysis deliberately uses terminology shared with neighboring records so that authorization metadata, rather than semantic similarity alone, determines which chunks may be retrieved.

Detailed analysis: ${analysis} Reviewers should read the assumptions together with the relevant scope because similarly named projects, clients, branches, and Meridian entities have materially different access boundaries.

Controls and evidence: ${controls} Evidence references are synthetic placeholders. They illustrate how a reviewer would connect conclusions to source schedules without representing a real person, customer, company, or transaction.

Findings and sensitivities: ${findings} The conclusions are scenario-dependent and should not be treated as actual financial advice, credit approval, regulatory reporting, or transaction guidance.

Required actions and ownership: ${actions} Owners must retain the stated classification, role list, and branch, client, or deal scope when this document is divided into chunks or moved into a vector store. Relevant facts are intentionally distributed across sections, and similarly worded unauthorized records may rank highly for the same query.`;
}

const documents = BankingDocumentCollectionSchema.parse([
  document(
    "PUB-FAQ-001",
    "Everyday Checking FAQ",
    "PUBLIC_FAQ",
    "PUBLIC",
    "Customers can review fictional checking account opening, monthly statement, debit card, and transfer questions. This public guide contains no customer records.",
  ),
  document(
    "PUB-FAQ-002",
    "Digital Banking Security FAQ",
    "PUBLIC_FAQ",
    "PUBLIC",
    "Public guidance explains demo password hygiene, multifactor authentication, suspicious message reporting, and safe online banking sessions without exposing internal controls.",
  ),
  document(
    "PUB-FAQ-003",
    "International Transfer FAQ",
    "PUBLIC_FAQ",
    "PUBLIC",
    "General answers cover fictional wire timing, exchange-rate disclosures, beneficiary details, and transfer status. Restricted operations and customer-specific activity are excluded.",
  ),
  document(
    "PUB-PROD-001",
    "Harbor Everyday Savings",
    "PUBLIC_PRODUCT",
    "PUBLIC",
    "A fictional savings product description covering variable interest, public eligibility, deposit access, and standard withdrawal information for prospective customers.",
  ),
  document(
    "PUB-PROD-002",
    "Harbor Premier Portfolio Service",
    "PUBLIC_PRODUCT",
    "PUBLIC",
    "A public overview of a fictional advisory service discussing diversified portfolios, periodic reviews, investment risk, and advisor meetings without client recommendations.",
  ),
  document(
    "PUB-PROD-003",
    "Harbor Business Credit Overview",
    "PUBLIC_PRODUCT",
    "PUBLIC",
    "A general description of fictional revolving credit and term lending products, including public application stages, covenant concepts, and credit review expectations.",
  ),
  document(
    "PUB-BRANCH-001",
    "NYC-01 Public Branch Information",
    "PUBLIC_BRANCH",
    "PUBLIC",
    "Public location information for the fictional NYC-01 branch describes lobby services, accessible appointments, general opening hours, and consumer banking support.",
  ),
  document(
    "PUB-BRANCH-002",
    "LON-02 and SFO-03 Public Branch Information",
    "PUBLIC_BRANCH",
    "PUBLIC",
    "Public location information compares fictional LON-02 and SFO-03 branch services, appointment channels, general hours, and available business banking consultations.",
  ),

  document(
    "RTL-NYC-001",
    "NYC-01 Opening and Closing Procedure",
    "RETAIL_PROCEDURE",
    "INTERNAL",
    "NYC-01 staff follow dual-control opening, cash-area inspection, terminal readiness, and end-of-day reconciliation steps. Exceptions are recorded in the branch operations log.",
    { roles: ["retail_banker"], branchId: "NYC-01" },
  ),
  document(
    "RTL-LON-001",
    "LON-02 Opening and Closing Procedure",
    "RETAIL_PROCEDURE",
    "INTERNAL",
    "LON-02 staff follow dual-control opening, cash-area inspection, terminal readiness, and end-of-day reconciliation steps. Local exception routing differs from NYC-01.",
    { roles: ["retail_banker"], branchId: "LON-02" },
  ),
  document(
    "RTL-SFO-001",
    "SFO-03 Weekend Branch Procedure",
    "RETAIL_PROCEDURE",
    "INTERNAL",
    "SFO-03 weekend staff use reduced lobby coverage, dual-control vault access, appointment verification, and a dedicated reconciliation checklist for Saturday operations.",
    { roles: ["retail_banker"], branchId: "SFO-03" },
  ),
  document(
    "RTL-NYC-002",
    "NYC-01 Teller Cash Difference Operations",
    "RETAIL_OPERATIONS",
    "INTERNAL",
    "NYC-01 tellers recount the drawer, compare transaction journals, notify the operations lead, and document fictional cash differences before final balancing.",
    { roles: ["retail_banker"], branchId: "NYC-01" },
  ),
  document(
    "RTL-LON-002",
    "LON-02 Teller Cash Difference Operations",
    "RETAIL_OPERATIONS",
    "INTERNAL",
    "LON-02 tellers recount the drawer, compare transaction journals, notify the duty manager, and document fictional cash differences under the regional escalation timetable.",
    { roles: ["retail_banker"], branchId: "LON-02" },
  ),
  document(
    "RTL-POL-001",
    "Consumer Overdraft Review Policy",
    "RETAIL_POLICY",
    "INTERNAL",
    "Retail bankers review fictional overdraft patterns, customer notices, affordability indicators, and fee corrections using consistent consumer treatment standards across branches.",
    { roles: ["retail_banker"], branchId: "ALL" },
  ),
  document(
    "RTL-NYC-003",
    "NYC-01 Holiday Staffing Memo",
    "RETAIL_POLICY",
    "INTERNAL",
    "The NYC-01 memo assigns fictional lobby, teller, and appointment coverage for a holiday period and reiterates dual-control requirements during reduced staffing.",
    { roles: ["retail_banker"], branchId: "NYC-01" },
  ),
  document(
    "RTL-SFO-002",
    "SFO-03 Consumer Account Exception Memo",
    "RETAIL_POLICY",
    "CONFIDENTIAL",
    "The SFO-03 memo analyzes fictional account-opening exceptions, enhanced document review, escalation patterns, and corrective coaching for branch operations staff.",
    { roles: ["retail_banker"], branchId: "SFO-03" },
  ),

  document(
    "WLT-8832-001",
    "CUST-8832 Investment Profile",
    "WEALTH_PROFILE",
    "CONFIDENTIAL",
    "The fictional CUST-8832 profile records balanced risk tolerance, a seven-year horizon, liquidity reserves, tax-aware investing preferences, and limits on concentrated technology exposure.",
    { roles: ["wealth_manager"], clientId: "CUST-8832" },
  ),
  document(
    "WLT-9911-001",
    "CUST-9911 Investment Profile",
    "WEALTH_PROFILE",
    "CONFIDENTIAL",
    "The fictional CUST-9911 profile records balanced risk tolerance, an eight-year horizon, liquidity reserves, tax-aware investing preferences, and limits on concentrated healthcare exposure.",
    { roles: ["wealth_manager"], clientId: "CUST-9911" },
  ),
  document(
    "WLT-8832-002",
    "CUST-8832 Portfolio Review",
    "WEALTH_PORTFOLIO",
    "CONFIDENTIAL",
    detailedContent(
      "CUST-8832 Portfolio Review.",
      "The review covers a balanced seven-year mandate, a twelve-month liquidity reserve, tax-aware rebalancing, and a fictional reporting quarter ending in June.",
      "The invented household entered the quarter near its strategic allocation, but a rally in large technology issuers lifted equity exposure above the agreed range. Cash remains sufficient for planned commitments, so no forced sale is assumed.",
      "The synthetic portfolio is assessed for equity concentration, bond duration, credit quality, currency exposure, realized gains, and projected withdrawals. A staged rebalance trims broad technology exposure while retaining diversified growth assets and shortening part of the bond sleeve.",
      "Recommendations require suitability review, documented client consent, pre-trade concentration checks, and confirmation that tax lots match the fictional planning schedule. Orders must not be inferred from meeting notes alone.",
      "Base-case liquidity remains adequate and downside testing shows the reserve can fund planned spending. The principal sensitivity is a simultaneous technology drawdown and rate increase, not the healthcare exposure described in CUST-9911 materials.",
      "The wealth manager should review the staged trades, confirm the charitable allocation timetable, and record whether CUST-8832 accepts the revised duration range before implementation.",
    ),
    { roles: ["wealth_manager"], clientId: "CUST-8832" },
  ),
  document(
    "WLT-9911-002",
    "CUST-9911 Portfolio Review",
    "WEALTH_PORTFOLIO",
    "CONFIDENTIAL",
    detailedContent(
      "CUST-9911 Portfolio Review.",
      "The review covers a balanced eight-year mandate, planned family-trust distributions, tax-aware rebalancing, and the same fictional June reporting quarter used in the neighboring CUST-8832 review.",
      "Healthcare holdings appreciated after an invented sector rally and now exceed the client-specific concentration range. Cash is reserved for trust distributions, making the timing of sales and settlement different from the technology-focused CUST-8832 case.",
      "The synthetic portfolio is assessed for healthcare concentration, bond duration, credit quality, currency exposure, unrealized gains, and forecast distributions. The proposed sequence reduces specialist healthcare funds and adds diversified equities without consuming protected trust cash.",
      "Recommendations require suitability review, documented client consent, pre-trade concentration checks, and confirmation of the fictional trust calendar. Similar language in another client review must never be used to fill missing facts.",
      "Downside testing identifies a healthcare correction combined with higher distribution needs as the key risk. Bond holdings provide partial stability, although longer duration creates mark-to-market sensitivity if rates rise quickly.",
      "The wealth manager should validate distribution dates, discuss the proposed sector reduction, and document whether CUST-9911 approves the revised allocation before any synthetic order is recorded.",
    ),
    { roles: ["wealth_manager"], clientId: "CUST-9911" },
  ),
  document(
    "WLT-8832-003",
    "CUST-8832 Investment Recommendation",
    "WEALTH_RECOMMENDATION",
    "CONFIDENTIAL",
    "The fictional recommendation proposes gradual bond-duration reduction, diversified equity exposure, and a liquidity buffer while avoiding additional concentrated technology positions.",
    { roles: ["wealth_manager"], clientId: "CUST-8832" },
  ),
  document(
    "WLT-9911-003",
    "CUST-9911 Investment Recommendation",
    "WEALTH_RECOMMENDATION",
    "CONFIDENTIAL",
    "The fictional recommendation proposes gradual bond-duration reduction, diversified equity exposure, and a liquidity buffer while avoiding additional concentrated healthcare positions.",
    { roles: ["wealth_manager"], clientId: "CUST-9911" },
  ),
  document(
    "WLT-8832-004",
    "CUST-8832 Client Meeting Notes",
    "WEALTH_MEETING_NOTES",
    "CONFIDENTIAL",
    "Fictional meeting notes capture questions about volatility, retirement timing, charitable allocations, portfolio rebalancing, and follow-up analysis requested by CUST-8832.",
    { roles: ["wealth_manager"], clientId: "CUST-8832" },
  ),
  document(
    "WLT-9911-004",
    "CUST-9911 Client Meeting Notes",
    "WEALTH_MEETING_NOTES",
    "CONFIDENTIAL",
    "Fictional meeting notes capture questions about volatility, retirement timing, family trust allocations, portfolio rebalancing, and follow-up analysis requested by CUST-9911.",
    { roles: ["wealth_manager"], clientId: "CUST-9911" },
  ),

  document(
    "CRD-NYC-001",
    "NYC-01 Credit Policy",
    "CREDIT_POLICY",
    "INTERNAL",
    detailedContent(
      "NYC-01 Credit Policy.",
      "This branch policy governs fictional middle-market borrower intake, financial statement collection, risk grading, covenant design, and approval routing for NYC-01 submissions.",
      "NYC-01 bankers obtain two fiscal years of statements, current management accounts, beneficial-ownership attestations, and a documented borrowing purpose. Missing items are logged before the request reaches a credit analyst.",
      "Analysis covers normalized cash flow, leverage, fixed-charge coverage, liquidity, collateral, sponsor support, and downside resilience. A Meridian-named borrower is not presumed related to Meridian records maintained by LON-02 or SFO-03.",
      "The branch uses dual review for risk-grade overrides, records covenant calculations in the approved template, and routes policy exceptions to the NYC credit authority. Retail staff may assist intake but cannot approve confidential committee materials.",
      "A recurring-revenue borrower may justify tailored metrics, but covenant headroom must still survive the documented downside. Weak reporting quality, unexplained transfers, or stale valuations require escalation rather than optimistic assumptions.",
      "The NYC-01 owner should resolve checklist gaps, attach analyst rationale, and record the final branch decision. The similar LON-02 policy has different regional escalation timing and is outside a NYC-only retail scope.",
    ),
    { roles: ["retail_banker", "credit_analyst"], branchId: "NYC-01" },
  ),
  document(
    "CRD-LON-001",
    "LON-02 Credit Policy",
    "CREDIT_POLICY",
    "INTERNAL",
    detailedContent(
      "LON-02 Credit Policy.",
      "This regional policy governs fictional middle-market borrower intake, financial statement collection, risk grading, covenant design, and approval routing for LON-02 submissions.",
      "LON-02 bankers obtain audited statements where available, current management accounts, ownership attestations, currency exposures, and a documented borrowing purpose. Cross-border assumptions are recorded before analyst review.",
      "Analysis covers normalized cash flow, leverage, interest coverage, liquidity, collateral, currency sensitivity, and downside resilience. Meridian Logistics must remain distinct from similarly named Meridian Manufacturing records held for SFO-03.",
      "The branch uses independent review for grade overrides, records covenant calculations in the regional template, and escalates exceptions under the LON timetable. Local retail access does not extend to another branch merely because policy wording overlaps.",
      "Recurring-revenue or logistics borrowers may use tailored metrics, but headroom must survive currency and volume stresses. Unreconciled statements, unexplained payment routes, or stale asset values trigger enhanced review.",
      "The LON-02 owner should resolve checklist gaps, attach analyst rationale, and record the regional decision. The NYC-01 version uses similar concepts but a distinct branch scope and escalation path.",
    ),
    { roles: ["retail_banker", "credit_analyst"], branchId: "LON-02" },
  ),
  document(
    "CRD-SFO-001",
    "SFO-03 Meridian Manufacturing Credit Memo",
    "CREDIT_MEMO",
    "CONFIDENTIAL",
    "A fictional credit memo reviews Meridian Manufacturing revenue pressure, leverage, liquidity, collateral coverage, and proposed covenant protection for an SFO-03 lending request.",
    { roles: ["credit_analyst"], branchId: "SFO-03" },
  ),
  document(
    "CRD-LON-002",
    "LON-02 Meridian Logistics Credit Memo",
    "CREDIT_MEMO",
    "CONFIDENTIAL",
    "A fictional credit memo reviews Meridian Logistics revenue pressure, leverage, liquidity, collateral coverage, and proposed covenant protection for a LON-02 lending request.",
    { roles: ["credit_analyst"], branchId: "LON-02" },
  ),
  document(
    "CRD-NYC-002",
    "Northstar Holdings Covenant Review",
    "CREDIT_COVENANT",
    "CONFIDENTIAL",
    "The fictional review tests Northstar Holdings leverage and interest coverage, discusses a near-threshold quarter, and proposes monitoring without changing the loan structure.",
    { roles: ["credit_analyst"], branchId: "NYC-01" },
  ),
  document(
    "CRD-SFO-002",
    "Northstar Components Covenant Review",
    "CREDIT_COVENANT",
    "CONFIDENTIAL",
    "The fictional review tests Northstar Components leverage and interest coverage, discusses a near-threshold quarter, and proposes enhanced monitoring for the SFO-03 exposure.",
    { roles: ["credit_analyst"], branchId: "SFO-03" },
  ),
  document(
    "CRD-COM-001",
    "Meridian Loan Committee Materials",
    "CREDIT_COMMITTEE",
    "RESTRICTED",
    detailedContent(
      "Meridian Loan Committee Materials.",
      "The committee package compares two invented and unrelated borrowers: Meridian Manufacturing in SFO-03 and Meridian Logistics in LON-02. It supports a cross-branch credit decision without merging their obligations.",
      "Manufacturing faces margin pressure from input costs, while Logistics faces shipment volatility and currency exposure. Both requests use leverage, liquidity, collateral, and covenant language that creates deliberate semantic overlap.",
      "The downside case applies lower revenue, delayed collections, higher rates, and reduced collateral values. Manufacturing retains stronger hard-asset coverage; Logistics shows better recurring contracts but less protection under the severe volume case.",
      "Analysts must preserve separate borrower files, validate source schedules, document grade overrides, and limit committee distribution to listed roles. Compliance visibility arises from the explicit role metadata on this restricted record.",
      "The proposed conditions include quarterly reporting, minimum liquidity, leverage limits, and notification of material contract losses. Approval for one Meridian entity does not establish precedent or authority for the other.",
      "Committee owners should record votes, resolve the open collateral review, and issue distinct approval conditions by branch. Any later chunk must retain the ALL branch scope and full restricted-role metadata.",
    ),
    {
      roles: ["credit_analyst", "compliance_officer"],
      branchId: "ALL",
    },
  ),
  document(
    "CRD-RISK-001",
    "Northstar Borrower Risk Report",
    "CREDIT_RISK_REPORT",
    "CONFIDENTIAL",
    "A fictional cross-branch risk report compares Northstar entities, sector demand, liquidity, leverage, covenant performance, and early-warning indicators for credit monitoring.",
    { roles: ["credit_analyst"], branchId: "ALL" },
  ),
  document(
    "CRD-RISK-002",
    "Apollo Industrial Borrower Risk Report",
    "CREDIT_RISK_REPORT",
    "RESTRICTED",
    "A fictional borrower report evaluates Apollo Industrial cash flow, refinancing risk, covenant headroom, and collateral. It is unrelated to the investment-banking Project Apollo deal.",
    { roles: ["credit_analyst"], branchId: "LON-02" },
  ),

  document(
    "IB-APL-001",
    "Project Apollo Teaser",
    "INVESTMENT_BANKING_TEASER",
    "RESTRICTED",
    "The fictional Project Apollo teaser describes a cloud payments company, recurring revenue, customer retention, growth opportunities, and an illustrative transaction process.",
    { roles: ["investment_banker"], dealId: "PROJECT_APOLLO" },
  ),
  document(
    "IB-ATL-001",
    "Project Atlas Teaser",
    "INVESTMENT_BANKING_TEASER",
    "RESTRICTED",
    "The fictional Project Atlas teaser describes a cloud logistics company, recurring revenue, customer retention, growth opportunities, and an illustrative transaction process.",
    { roles: ["investment_banker"], dealId: "PROJECT_ATLAS" },
  ),
  document(
    "IB-APL-002",
    "Project Apollo Valuation Memo",
    "INVESTMENT_BANKING_VALUATION",
    "RESTRICTED",
    detailedContent(
      "Project Apollo Valuation Memo.",
      "The memo values an invented cloud-payments company for PROJECT_APOLLO using recurring-revenue multiples and discounted cash flow. It is a business record restricted to the Apollo deal team.",
      "The fictional company processes subscription payment workflows and reports strong gross retention, moderate customer concentration, and investment in new compliance tooling. No fact belongs to Project Atlas or Apollo Industrial.",
      "The analysis triangulates public-comparable multiples, an illustrative precedent range, and a five-year cash-flow forecast. Base assumptions use twelve percent revenue growth, stable gross margin, and gradual operating leverage; downside assumptions reduce retention and payment volume.",
      "Bankers reconcile forecast revenue to cohort schedules, separate recurring platform fees from lower-quality services, and document adjustments to EBITDA. Access is controlled by PROJECT_APOLLO metadata, not by recognizing the project name in text.",
      "The valuation range is most sensitive to net retention, the terminal growth rate, discount rate, and timing of compliance investment. A two-point retention decline has more effect than the modeled short-term margin variance.",
      "The Apollo team should resolve cohort discrepancies, refresh the comparable set, and obtain committee approval before sharing any range. Atlas assumptions must never substitute for missing Apollo evidence despite nearly identical valuation terminology.",
    ),
    { roles: ["investment_banker"], dealId: "PROJECT_APOLLO" },
  ),
  document(
    "IB-ATL-002",
    "Project Atlas Valuation Memo",
    "INVESTMENT_BANKING_VALUATION",
    "RESTRICTED",
    detailedContent(
      "Project Atlas Valuation Memo.",
      "The memo values an invented cloud-logistics company for PROJECT_ATLAS using recurring-revenue multiples and discounted cash flow. It is restricted to the Atlas deal scope, not the Apollo team.",
      "The fictional platform coordinates warehouse and shipment workflows and reports stable gross retention, carrier concentration, and investment in route optimization. These facts do not describe Project Apollo or Meridian Logistics.",
      "The analysis triangulates comparable software multiples, an illustrative precedent range, and a five-year cash-flow forecast. Base assumptions use eleven percent revenue growth, improving gross margin, and measured operating leverage; downside assumptions reduce shipment volume and renewal rates.",
      "Bankers reconcile forecast revenue to customer schedules, separate recurring platform fees from implementation services, and document EBITDA adjustments. PROJECT_ATLAS metadata must remain attached to every chunk even when the prose resembles Apollo analysis.",
      "The valuation range is most sensitive to renewal rates, carrier concentration, the discount rate, and delayed margin improvement. A severe shipment downturn changes the range more than the modeled implementation-service mix.",
      "The Atlas team should validate carrier cohorts, refresh comparables, and obtain committee review before sharing any range. Apollo retention evidence is unauthorized and cannot repair an Atlas diligence gap.",
    ),
    { roles: ["investment_banker"], dealId: "PROJECT_ATLAS" },
  ),
  document(
    "IB-APL-003",
    "Project Apollo Diligence Notes",
    "INVESTMENT_BANKING_DILIGENCE",
    "RESTRICTED",
    detailedContent(
      "Project Apollo Diligence Notes.",
      "These notes document fictional commercial, financial, technology, and regulatory diligence for the PROJECT_APOLLO cloud-payments transaction. Compliance is explicitly listed because selected control evidence is auditable.",
      "Management presented customer cohorts, payment volume, recurring platform fees, implementation revenue, and a five-year forecast. Reviewers identified inconsistent cohort labels and requested a bridge from processed volume to recognized revenue.",
      "Commercial work tests retention by customer size, concentration, pricing changes, and pipeline conversion. Financial work reconciles deferred revenue, capitalized development, adjusted EBITDA, and cash conversion under both base and downside cases.",
      "Technology review covers privileged access, incident response, encryption, vendor dependencies, and evidence retention. The compliance reviewer may inspect these notes because allowedRoles explicitly includes compliance_officer, not because of an administrator bypass.",
      "Open findings include two cohort reconciliation gaps, incomplete evidence for a legacy access review, and forecast sensitivity to one fictional enterprise renewal. None of these findings applies to Project Atlas.",
      "Owners should complete the revenue bridge, obtain the legacy control evidence, document disposition of each exception, and update the Apollo committee. Every extracted chunk must retain PROJECT_APOLLO and restricted-role metadata.",
    ),
    {
      roles: ["investment_banker", "compliance_officer"],
      dealId: "PROJECT_APOLLO",
    },
  ),
  document(
    "IB-APL-004",
    "Project Apollo Committee Notes",
    "INVESTMENT_BANKING_COMMITTEE",
    "RESTRICTED",
    "Fictional committee notes discuss Apollo valuation ranges, buyer feedback, diligence gaps, retention sensitivity, transaction timing, and approval conditions.",
    { roles: ["investment_banker"], dealId: "PROJECT_APOLLO" },
  ),

  document(
    "CMP-AML-001",
    "Enterprise AML Escalation Procedure",
    "COMPLIANCE_AML",
    "INTERNAL",
    detailedContent(
      "Enterprise AML Escalation Procedure.",
      "This synthetic enterprise procedure describes alert triage, evidence preservation, escalation ownership, confidentiality, and review checkpoints across fictional banking teams.",
      "An analyst first confirms the alert source, relevant time window, customer-risk context, and whether linked activity has already been reviewed. Automated similarity is a lead for investigation, never a substitute for evidence.",
      "Review steps compare expected activity with transaction velocity, counterparties, geography, product use, and prior dispositions. Similar Meridian names or Apollo references must not cause unrelated branch, client, credit, or deal records to be combined.",
      "Case access follows need-to-know roles, documented assignment, immutable event logging, and periodic supervisory review. Evidence exports retain classification and scope; secrets, credentials, and unrelated customer material are excluded.",
      "Escalation is warranted when activity lacks a credible explanation, screening results remain unresolved, linked alerts reveal a broader pattern, or evidence quality prevents a supported closure. This procedure does not state that any real suspicious activity occurred.",
      "The case owner records the rationale, preserves reviewed evidence, requests quality approval, and follows the fictional reporting timetable. Retrieval systems must surface only policy chunks authorized for the requesting persona.",
    ),
    { roles: ["compliance_officer"] },
  ),
  document(
    "CMP-AML-002",
    "Cross-Border Payment AML Procedure",
    "COMPLIANCE_AML",
    "CONFIDENTIAL",
    "The fictional procedure covers cross-border alert context, customer risk factors, payment patterns, sanctions screening handoffs, and documented compliance review.",
    { roles: ["compliance_officer"] },
  ),
  document(
    "CMP-POL-001",
    "Internal Compliance Case Handling Policy",
    "COMPLIANCE_POLICY",
    "INTERNAL",
    detailedContent(
      "Internal Compliance Case Handling Policy.",
      "This fictional policy sets case ownership, need-to-know handling, evidence standards, quality review, retention expectations, and independent escalation across banking teams.",
      "Each case receives an invented identifier, assigned owner, reviewer, classification, and documented scope. Case scope is narrower than enterprise visibility and does not authorize access to every branch, client, or transaction record.",
      "The owner records source reliability, relevant chronology, alternative explanations, unresolved gaps, and the rationale for disposition. Conclusions distinguish observed synthetic facts from assumptions and automated model suggestions.",
      "Access changes require approval and are logged; exported evidence retains metadata; review notes are separated from underlying business records. Quality reviewers verify that no unauthorized Apollo, Atlas, wealth, or credit material entered the file.",
      "Material gaps, conflicts of interest, repeated control failures, and unsupported closure rationales trigger independent escalation. Retention periods and legal holds are represented only as fictional workflow examples.",
      "The owner resolves review comments, records final approval, and ensures downstream copies preserve classification. Vector ingestion must never strip role or scope fields from a case-handling policy chunk.",
    ),
    { roles: ["compliance_officer"] },
  ),
  document(
    "CMP-SAR-001",
    "Suspicious Activity Review: Meridian Pattern",
    "COMPLIANCE_SAR",
    "RESTRICTED",
    "A wholly fictional review analyzes repeated Meridian-named payment counterparties, transaction velocity, stated purpose, alert disposition, and documented escalation rationale.",
    { roles: ["compliance_officer"], clientId: "ALL" },
  ),
  document(
    "CMP-AUD-001",
    "2026 Synthetic Access-Control Audit",
    "COMPLIANCE_AUDIT",
    "AUDIT",
    detailedContent(
      "2026 Synthetic Access-Control Audit.",
      "The audit evaluates invented role assignments, branch and client scoping, deal segregation, clearance enforcement, access logs, exceptions, and remediation evidence across VaultRAG scenarios.",
      "The sample includes NYC-01, LON-02, SFO-03, CUST-8832, CUST-9911, PROJECT_APOLLO, and PROJECT_ATLAS. Sampling tests deliberately similar records to determine whether metadata filters are applied before semantic retrieval.",
      "Auditors compare canonical persona claims with document roles, minimum clearance, and branch, client, or deal scope. Public records are tested separately, while employee tokens are checked for expiry, signature integrity, and server-side claim ownership.",
      "Evidence includes synthetic access decisions, denied attempts, payload-index definitions, deterministic chunk identifiers, and proof that every chunk retained its source metadata. Audit visibility follows explicit AUDIT classification and role metadata.",
      "The fictional sample identifies heightened risk when similarly worded Apollo and Atlas records rank together, when client reviews omit identifiers, or when stale chunks survive re-ingestion. No production system or real employee was examined.",
      "Owners should retain pre-retrieval filtering, reconcile namespaced stale points, test index types, and document remediation. Any audit chunk remains restricted by its explicit ALL scopes and compliance role.",
    ),
    {
      roles: ["compliance_officer"],
      branchId: "ALL",
      clientId: "ALL",
      dealId: "ALL",
    },
  ),
  document(
    "CMP-AUD-002",
    "Project Apollo Deal Room Access Audit",
    "COMPLIANCE_AUDIT",
    "AUDIT",
    detailedContent(
      "Project Apollo Deal Room Access Audit.",
      "This fictional audit reviews PROJECT_APOLLO deal-room membership, diligence downloads, restricted valuation access, approval evidence, access removals, and exception remediation.",
      "The sample traces invented joiner, mover, and leaver events for deal-team roles and compares access dates with committee milestones. PROJECT_ATLAS users and similarly named Apollo Industrial credit analysts remain outside scope.",
      "Testing reconciles membership approvals, download logs, privileged actions, retention evidence, and removal timestamps. It also confirms that compliance access exists only on documents whose allowedRoles metadata explicitly names compliance_officer.",
      "Evidence is stored under audit classification with PROJECT_APOLLO scope. Reviewers test whether valuation, diligence, and committee chunks retain deal metadata and whether a semantic search could otherwise confuse Atlas language.",
      "The synthetic audit notes one delayed access removal and one incomplete explanation for a bulk diligence download; both are invented control scenarios. The business valuation memo remains investment-banker-specific despite this audit visibility.",
      "The deal-room owner should document the exceptions, verify closure evidence, and repeat access certification. Audit extracts must preserve compliance role, clearance four, and the Apollo deal identifier.",
    ),
    { roles: ["compliance_officer"], dealId: "PROJECT_APOLLO" },
  ),
  document(
    "CMP-AUD-003",
    "Synthetic Wealth Advice Suitability Audit",
    "COMPLIANCE_AUDIT",
    "AUDIT",
    "The fictional audit samples CUST-8832 and CUST-9911 portfolio reviews, risk profiles, recommendations, meeting notes, suitability evidence, and supervisory approvals.",
    { roles: ["compliance_officer"], clientId: "ALL" },
  ),
]);

async function main() {
  const outputUrl = new URL("../data/synthetic_docs.json", import.meta.url);
  await writeFile(outputUrl, `${JSON.stringify(documents, null, 2)}\n`, "utf8");

  console.log(`Generated ${documents.length} synthetic banking documents.`);
}

void main();

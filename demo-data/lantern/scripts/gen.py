"""Generate the Lantern demo fixtures to design v3.2 (docs/research/30-design-v3.md).

Full fixture (demo-data/lantern/): profile-us-bank.json, profile-eu.json, snapshots.json, ledger.json,
expected-findings.json, agent-trace.json.
Live slice (demo-data/lantern/live-slice/): profile-live.json, snapshots.json, ledger.json,
expected-findings.json, agent-trace.json, plus copies of the source documents.

Rules implemented in code (not in the mock judge):
- machine assessment from clause support: all supported -> evidence_found, some -> evidence_weakened, none -> evidence_absent;
  an unreadable evidence file -> not_evaluated.
- change classification from prior and new evidence binding: none | unchanged | moved | weakened | removed.
- staleness keyed to the evidence binding with profile materiality by tier (verification_holds events).
- displayed status (projection enum codes) from the ordered rules in design section 4.
- prior-quote diff hints from each clause's hint_terms in the profile.
Every quote is located and checked against its pinned version. Hashes are real.
Run: python3 -I scripts/gen.py demo-data/lantern
"""
import sys, json, hashlib, re, copy, shutil, os
from datetime import datetime, timedelta

D = sys.argv[1]
SL = os.path.join(D, "live-slice")
P = lambda n: os.path.join(D, n)
def txt(path): return open(path).read()
def sha(s, n=64): return "sha256:" + hashlib.sha256(s.encode()).hexdigest()[:n]
def norm(s):
    s = s.replace("`", "").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("‐", "-").replace("‑", "-").replace("–", "-").replace("—", "-")
    return " ".join(s.split()).strip().lower()
def has_term(text, term): return re.search(r"(?<![a-z0-9])" + re.escape(norm(term)), norm(text)) is not None
NORMALIZATION = "whitespace, quotes, hyphens, case"
MODEL_ID = "anthropic.claude-sonnet-4-6"
INFERENCE_PROFILE = "us.anthropic.claude-sonnet-4-6"
PROMPT_VERSION = "v3"
PROMPT_HASH = sha("keel/evaluate-snapshot/prompt/v3", 16)
MRM_MODEL_ID = "MRM-AI-0271"
PROFILE_VERSION = "2026.3"
FOLDER_ID = "318840021"
ATTESTATION = "I attest the cited evidence meets the requirement."
PROJECT = {"project": "Project Lantern: Customer Support AI Assistant", "application_id": "APM-20417", "application_tier": "Tier 1",
           "regulatory_scope": "NPI (GLBA)", "arb_decision": {"id": "ARB-2026-0338", "outcome": "approved with conditions", "date": "2026-10-07", "chair": "R. Alvarez"}}
BANNED = ("satisfied", "regressed", "confidence", "haiku", "accept risk", "risk_accepted", "proposed_satisfied")
def tick(ts, s):
    if ts == "LIVE": return "LIVE"
    return (datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ") + timedelta(seconds=s)).strftime("%Y-%m-%dT%H:%M:%SZ")
def deep_link(file_id=None, version_id=None):
    return f"https://app.box.com/file/{file_id}?version={version_id}" if file_id else f"https://app.box.com/folder/{FOLDER_ID}"
RECORD_URL = "https://keel.local/record/" + FOLDER_ID

# ============================================================ documents and versions
F = {"arch": ("1650233401", "architecture.md"), "dfc": ("1650233402", "data-flow-and-classification.md"),
     "run": ("1650233403", "runbook.md"), "ven": ("1650233404", "vendor-contract-summary.md"),
     "ase": ("1650233405", "approved-services-and-exceptions.md")}
FILE_KEY = {v[0]: k for k, v in F.items()}
class Versions:
    def __init__(self): self.v = {}
    def add(self, key, f, vid, label, ts, by, path, **extra):
        t = txt(path)
        self.v[key] = {"fileId": F[f][0], "fileName": F[f][1], "versionId": vid, "versionLabel": label, "uploadedAt": ts,
                       "uploadedBy": by, "contentHash": sha(t), "bytes": len(t.encode()), "path": path, **extra}
    def __getitem__(self, k): return self.v[k]
    def by_vid(self, vid): return [k for k in self.v if self.v[k]["versionId"] == vid][0]
    def text(self, k): return txt(self.v[k]["path"])
    def present(self, k, q): return norm(q) in norm(self.text(k))
    def locate(self, k, q):
        nq = norm(q); heading = "(front matter)"; para = 0; buf = []; pos = 0; found = None
        for ln in self.text(k).split("\n") + [""]:
            if ln.startswith("#"):
                heading = ln.lstrip("#").strip(); para = 0; buf = []
            elif ln.strip() == "":
                if buf:
                    para += 1
                    if found is None and nq in norm(" ".join(buf)): found = (heading, para, pos)
                buf = []
            else:
                buf.append(ln)
            pos += len(ln) + 1
        assert found, ("quote not found", k, q[:80])
        heading, para, pos = found
        m = re.match(r"^(\d+(\.\d+)?)\.?\s", heading)
        return {"section": ("§" + m.group(1) + " " + heading[m.end():]) if m else heading, "paragraph": para, "page": 1 + pos // 3000}
    def ev(self, k, q):
        loc = self.locate(k, q); v = self.v[k]
        return {"fileId": v["fileId"], "fileName": v["fileName"], "versionId": v["versionId"], "versionLabel": v["versionLabel"], "section": loc["section"],
                "paragraph": loc["paragraph"], "page": loc["page"], "quote": q, "box_deep_link": deep_link(v["fileId"], v["versionId"])}

FULL = Versions()
FULL.add("arch-v1", "arch", "1801102231", "v1", "2026-10-03T14:52:10Z", "Kevin Lindqvist", P("architecture-v1.md"))
FULL.add("dfc-v1", "dfc", "1801102241", "v1", "2026-10-03T14:53:02Z", "Kevin Lindqvist", P("data-flow-and-classification.md"))
FULL.add("run-v1", "run", "1801102251", "v1", "2026-10-03T14:53:40Z", "Kevin Lindqvist", P("runbook-v1.md"))
FULL.add("ven-v1", "ven", "1801102261", "v1", "2026-10-03T14:54:15Z", "Owen Pryce", P("vendor-contract-summary.md"))
FULL.add("ase-v1", "ase", "1801102271", "v1", "2026-10-03T14:54:58Z", "Kevin Lindqvist", P("approved-services-and-exceptions.md"))
FULL.add("arch-v2", "arch", "1801102232", "v2", "2026-10-07T12:58:31Z", "Kevin Lindqvist", P("architecture-v2.md"))
FULL.add("run-v2", "run", "1801102252", "v2", "2026-10-12T14:18:07Z", "Kevin Lindqvist", P("runbook.md"))
V3_META = {"versionComment": "Section 4 rewrite for clarity", "confluenceEditor": "J. Park (Eng)", "jira": "LAN-2291"}
FULL.add("arch-v3", "arch", "1801102233", "v3", "2026-10-17T15:30:00Z", "svc-confluence-export", P("architecture-v3.md"), **V3_META)

# ============================================================ quotes
Q = {
 "01": "This list names every AWS service and third-party component in the Project Lantern design and records whether it is on the Approved Cloud Services Catalog or is used under an approved exception.",
 "01x": "Amazon OpenSearch Serverless is the one service used under an exception (EXC-2026-0117).",
 "02": "The snapshot bucket, the session table and the vector index are classified Confidential / NPI (GLBA), and Lantern is outside PCI DSS scope because full PANs are masked before ingestion.",
 "02dfc": "This document classifies every data store and data flow in Project Lantern under the Meridian Data Classification Standard (IS-STD-003) and records the regulatory scope of each.",
 "04": "All human access to Lantern, for agents and engineers, authenticates through the Meridian enterprise IdP with phishing-resistant MFA; Lantern has no local user accounts.",
 "05": "Privileged access to the Lantern production accounts is brokered through the enterprise PAM vault; there is no shared administrator account, and the named break-glass role is LanternBreakGlass, which requires two-person approval and expires after 4 hours.",
 "05roles": "| `LanternApiRole` | `lantern-api` | Invoke `lantern-orchestrator`; read the session table. |",
 "07": "All customer data at rest is encrypted using AWS KMS customer-managed keys, rotated annually; key custodians are the Card Servicing Platform leads.",
 "07aes": "Each data store has its own AES-256 key: `lantern-s3-snapshots`, `lantern-ddb-state`, `lantern-aoss-index` and `lantern-logs`.",
 "07w": "All customer data is protected with industry-standard encryption, with keys managed through AWS's native key management capabilities.",
 "07v1": "Data at rest is encrypted in all Lantern data stores.",
 "17": "Security events from CloudTrail, VPC Flow Logs, Bedrock model invocation logs and Lantern application audit logs are forwarded to the enterprise SIEM (Splunk) and retained per IS-STD-021; the alert owner is the Security Operations Center, with Card Servicing Platform on-call as secondary.",
 "20": "Third parties are Corvid Systems (ticketing software, self-hosted), TPRM-2026-0412, inherent risk Tier 2, assessment current to 2027-03, and Amazon Web Services (cloud provider), TPRM-2025-0007, inherent risk Tier 1, assessment current to 2026-12.",
 "22": "Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1.",
 "22b": "AWS Backup copies the table and bucket daily to the backup vault in account `mtb-backup-prod`, same Region, with 35-day retention and Vault Lock in compliance mode, so backups cannot be deleted or shortened by anyone in the Lantern accounts.",
 "22arch_b": "Backups are copied daily to a vault-locked AWS Backup vault in the separate account `mtb-backup-prod`.",
}
a2, a3, rb = FULL.text("arch-v2"), FULL.text("arch-v3"), FULL.text("run-v2")
assert a2.count(Q["07"]) == 1 and a3.count(Q["07"]) == 0
assert a2.count(Q["22"]) == 1 and a3.count(Q["22"]) == 0 and rb.count(Q["22"]) == 1 and FULL.text("run-v1").count(Q["22"]) == 1
assert "TLS 1.2" in a2 and "TLS 1.2" in a3
sec44 = lambda t: t[t.index("### 4.4"):t.index("### 4.5")]
assert sec44(a2) == sec44(a3), "TLS paragraph must be identical in v2 and v3"
OTHERS = ["dfc-v1", "run-v2", "ven-v1", "ase-v1"]
for k in OTHERS: assert not has_term(FULL.text(k), "customer-managed keys"), k
assert [k for k in OTHERS if has_term(FULL.text(k), "RTO")] == ["run-v2"] and not has_term(a3, "RTO")
assert norm("Lantern uses no third-party processors outside Meridian's AWS accounts.") in norm(a3)
assert norm("to Halcyon Support Services, Austin TX") in norm(txt(P("fixtures/vendor-contract-summary-contradiction.md")))
assert "halcyon" not in norm(FULL.text("ven-v1"))

# ============================================================ profiles
ILL = "illustrative; not reviewed by a compliance owner"
MATERIALITY = {"Critical": "acknowledge_on_evidencing_file_change", "High": "hold_if_unchanged", "Medium": "hold_if_unchanged"}
FIELDS = ["id", "title", "requirement", "required_clauses", "standard", "applicability", "evidence", "tier", "framework_map", "reviewer_role"]
def RC(cid, *items): return [{"clause_id": f"{cid}.{i+1}", "clause": c, "hint_terms": t} for i, (c, t) in enumerate(items)]
us_controls = [
 {"id": "SEC-ARCH-01", "title": "Approved services only",
  "requirement": "Every cloud service and third-party component named in the design must be on the Approved Cloud Services Catalog, or the package must reference an approved exception by id. The package must contain a list of services and components with their catalog status. A component named in the design but missing from the list is a finding.",
  "required_clauses": RC("SEC-ARCH-01", ("every cloud service and component is listed", ["Approved Cloud Services Catalog"]), ("catalog status or exception id is given for each item", ["EXC-"])),
  "standard": "IS-STD-009 Approved Technology v3.1 §4.2",
  "applicability": "Applies to every new application and material change. Not applicable only to documentation-only changes with no deployed component.",
  "evidence": ["approved-services-and-exceptions.md (service list and exception table)", "Architecture document §3.1"], "tier": "Medium",
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["12.5.1"], "nist_csf_2_0": ["ID.AM-01", "ID.AM-02"], "ffiec_is_booklet": ["II.C.5 Inventory and classification of assets"], "iso_27001_2022_annex_a": ["A.5.9", "A.5.23"], "glba_occ": ["OCC Bulletin 2023-17"]},
  "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk"},
 {"id": "SEC-ARCH-02", "title": "Data classification and regulatory scope per data store",
  "requirement": "Every data store must carry a classification label under IS-STD-003: Public, Internal, Confidential or Restricted. Stores holding nonpublic personal information must be flagged NPI (GLBA). If payment card data could be present, the design must state the PCI DSS scope boundary.",
  "required_clauses": RC("SEC-ARCH-02", ("classification label given per data store", ["IS-STD-003", "Confidential"]), ("NPI (GLBA) stores flagged", ["NPI (GLBA)"]), ("PCI DSS scope boundary stated", ["PCI DSS"])),
  "standard": "IS-STD-003 Data Classification v5.0 §3",
  "applicability": "Applies whenever the application stores or processes data. Not applicable only to stateless components that hold no data at rest.",
  "evidence": ["data-flow-and-classification.md §3", "Architecture document §3.2"], "tier": "High",
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["12.5.2"], "nist_csf_2_0": ["ID.AM-07", "PR.DS-01"], "ffiec_is_booklet": ["II.C.5 Inventory and classification of assets"], "iso_27001_2022_annex_a": ["A.5.12", "A.5.13"], "glba_occ": ["Interagency Guidelines Establishing Information Security Standards (12 CFR 30, App. B)"]},
  "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk"},
 {"id": "SEC-ARCH-04", "title": "Authentication and MFA via enterprise IdP",
  "requirement": "All human access, for users and administrators, must authenticate through the enterprise IdP. Multi-factor authentication is required, and it must be phishing-resistant for privileged and remote access. The application must not keep local user accounts.",
  "required_clauses": RC("SEC-ARCH-04", ("authentication through the enterprise IdP", ["enterprise IdP"]), ("phishing-resistant MFA required", ["MFA"]), ("no local user accounts", ["local user accounts"])),
  "standard": "IS-STD-011 Identity and Authentication v4.0 §2.3",
  "applicability": "Applies to every component with a human access path. Not applicable to components reached only by workload identities.",
  "evidence": ["Architecture document, authentication section"], "tier": "Medium",
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["8.3.1", "8.4.2"], "nist_csf_2_0": ["PR.AA-01", "PR.AA-03"], "ffiec_is_booklet": ["II.C.15 Access management"], "iso_27001_2022_annex_a": ["A.5.17", "A.8.5"], "glba_occ": ["FFIEC Authentication and Access to Financial Institution Services and Systems (2021)"]},
  "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk"},
 {"id": "SEC-ARCH-05", "title": "Least privilege, PAM, no shared admin, break-glass named",
  "requirement": "Access must use named roles scoped to specific resources. Privileged access must be brokered through the enterprise PAM vault, and there must be no shared administrator account. A break-glass path must be named, require two-person approval, and expire.",
  "required_clauses": RC("SEC-ARCH-05", ("named roles scoped to resources", ["LanternApiRole"]), ("privileged access brokered through PAM", ["PAM"]), ("no shared administrator account", ["shared administrator"]), ("break-glass named with two-person approval and expiry", ["LanternBreakGlass", "break-glass"])),
  "standard": "IS-STD-012 Privileged Access v2.4 §3.1",
  "applicability": "Applies to every application with production accounts or administrative interfaces.",
  "evidence": ["Architecture document, privileged access section and role table"], "tier": "High",
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["7.2.1", "7.2.2", "8.2.2", "8.6.1"], "nist_csf_2_0": ["PR.AA-05"], "ffiec_is_booklet": ["II.C.15 Access management"], "iso_27001_2022_annex_a": ["A.5.15", "A.5.18", "A.8.2"], "glba_occ": ["12 CFR 30, App. B, III.C.1(a)"]},
  "reviewer_role": "ARB reviewer, Technology Resilience and Operations"},
 {"id": "SEC-ARCH-07", "title": "Encryption at rest and key management",
  "requirement": "All customer data at rest must be encrypted with AES-256. Keys must be AWS KMS customer-managed keys or held in CipherTrust Manager; provider-managed or default keys do not meet this requirement. Keys must rotate at least annually, and the key custodians must be named.",
  "required_clauses": RC("SEC-ARCH-07", ("encryption at rest stated", ["encrypt"]), ("AES-256 stated", ["AES-256"]), ("key management model stated (AWS KMS customer-managed keys or CipherTrust)", ["customer-managed", "CipherTrust"]),
                         ("rotation period stated (at least annually)", ["rotated", "rotation period"]), ("key custodians named", ["custodian"])),
  "standard": "IS-STD-014 Cryptography v4.2 §5.1",
  "applicability": "Applies to every data store holding Confidential or Restricted data. Not applicable only if the classification document shows no such data at rest.",
  "evidence": ["Architecture document, encryption at rest and key management section"], "tier": "Critical",
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["3.5.1", "3.6.1", "3.7.4"], "nist_csf_2_0": ["PR.DS-01"], "ffiec_is_booklet": ["II.C.19 Encryption"], "iso_27001_2022_annex_a": ["A.8.24"], "glba_occ": ["12 CFR 30, App. B, III.C.1(c)"]},
  "reviewer_role": "ARB reviewer, Security Architecture"},
 {"id": "SEC-ARCH-17", "title": "Security events to enterprise SIEM (Splunk)",
  "requirement": "Security events from control plane, network flow, application audit and model invocation sources must be forwarded to the enterprise SIEM (Splunk). Retention must follow IS-STD-021. A named team must own the alerts raised on these events.",
  "required_clauses": RC("SEC-ARCH-17", ("security event sources forwarded to Splunk", ["Splunk"]), ("retention per IS-STD-021", ["IS-STD-021"]), ("alert owner named", ["alert owner"])),
  "standard": "IS-STD-021 Security Logging and Monitoring v3.0 §4",
  "applicability": "Applies to every production application.",
  "evidence": ["Architecture document, logging and monitoring section", "Runbook, monitoring and alerting"], "tier": "High",
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["10.2.1", "10.4.1", "10.5.1"], "nist_csf_2_0": ["DE.CM-01", "DE.AE-02"], "ffiec_is_booklet": ["II.C.22 Log management"], "iso_27001_2022_annex_a": ["A.8.15", "A.8.16"], "glba_occ": ["12 CFR 30, App. B, III.C.1(f)"]},
  "reviewer_role": "ARB reviewer, Technology Resilience and Operations"},
 {"id": "SEC-ARCH-20", "title": "Third parties named with TPRM assessment id and inherent risk tier",
  "requirement": "Every third party or sub-processor in the design must be named and must carry a TPRM assessment id and an inherent risk tier. Each assessment must be current on the date of review.",
  "required_clauses": RC("SEC-ARCH-20", ("each third party named", ["Corvid Systems"]), ("TPRM assessment id given", ["TPRM-"]), ("inherent risk tier given", ["inherent risk Tier"]), ("assessment current", ["assessment current"])),
  "standard": "IS-STD-019 Third-Party Risk Management v2.0 §3.4",
  "applicability": "Applies whenever the design uses a third party or sub-processor. Not applicable only if the design states that no third party is used and no document in the package names one.",
  "evidence": ["Architecture document, third-party dependencies section", "vendor-contract-summary.md"], "tier": "Medium",
  "framework_map": {"status": ILL, "glba_occ": ["OCC Bulletin 2023-17 (third-party relationships)"], "ffiec_is_booklet": ["FFIEC Outsourcing Technology Services Booklet"], "iso_27001_2022_annex_a": ["A.5.19", "A.5.20"], "nist_csf_2_0": ["GV.SC-04", "GV.SC-07"]},
  "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk"},
 {"id": "SEC-ARCH-22", "title": "Recovery targets and rollback path documented",
  "requirement": "The package must state RTO and RPO and describe a rollback path for deployments. Backups must be immutable, for example held in a vault-locked backup vault. Evidence may be in the architecture document or the runbook. Consistency of RTO and RPO with the BIA tier is pilot scope.",
  "required_clauses": RC("SEC-ARCH-22", ("RTO and RPO stated", ["RTO", "RPO"]), ("rollback path described", ["roll back"]), ("backups immutable", ["Vault Lock", "vault-locked"])),
  "standard": "IS-STD-030 Resilience and Recovery v2.2 §3",
  "applicability": "Applies to every production application with a BIA tier.",
  "evidence": ["Architecture document, resilience section", "runbook.md §2 to §4"], "tier": "High",
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["12.10.1"], "nist_csf_2_0": ["PR.DS-11", "RC.RP-01"], "ffiec_is_booklet": ["FFIEC Business Continuity Management Booklet"], "iso_27001_2022_annex_a": ["A.5.30", "A.8.13"], "glba_occ": ["Interagency Paper on Sound Practices to Strengthen Operational Resilience (2020)"]},
  "reviewer_role": "ARB reviewer, Technology Resilience and Operations"},
]
for c in us_controls: assert list(c) == FIELDS, c["id"]
TIERS = {"SEC-ARCH-07": "Critical", "SEC-ARCH-02": "High", "SEC-ARCH-05": "High", "SEC-ARCH-17": "High", "SEC-ARCH-22": "High",
         "SEC-ARCH-01": "Medium", "SEC-ARCH-04": "Medium", "SEC-ARCH-20": "Medium"}
for c in us_controls: assert c["tier"] == TIERS[c["id"]]
profile_us = {"profile_id": "profile-us-bank", "profile_version": PROFILE_VERSION, "default": True, "name": "Meridian Trust Bank ARB design review, US",
  "fields": FIELDS, "handed_to_model": ["requirement", "required_clauses", "applicability", "evidence"], "materiality": MATERIALITY,
  "attestation_phrase": ATTESTATION, "default_remediation_window_business_days": 5, "severity_rule": "control tier x application tier",
  "assessment_rule": "all required clauses supported: evidence_found; some: evidence_weakened; none: evidence_absent (applied by code)",
  "out_of_profile": ["diagram currency", "contract matching", "bare retention numbers", "TLS version nagging"], "controls": us_controls}
CTL = {c["id"]: c for c in us_controls}
CIDS = [c["id"] for c in us_controls]

eu_rows = [
 ("EU-C1", "Encryption at rest and key management", "Critical", "All customer data at rest must be encrypted, and the design must state the key model: customer-managed or provider-managed keys, where they are held, and the rotation period. Vague statements such as 'industry-standard encryption' do not meet this requirement.", "MTB-EU-STD-07 Cryptography §3", {"gdpr": ["Art. 32(1)(a)"], "dora": ["Art. 9(2)", "RTS 2024/1774 Art. 6-7"], "iso_27001_2022_annex_a": ["A.8.24"], "nist_800_53": ["SC-28", "SC-12"]}, "Security Architecture", [("encryption at rest stated", ["encrypt"]), ("key model stated", ["customer-managed", "provider-managed"]), ("rotation period stated", ["rotated", "rotation period"])]),
 ("EU-C2", "Encryption in transit", "High", "All network connections carrying customer data must be encrypted, with the minimum TLS version stated as a number.", "MTB-EU-STD-07 Cryptography §4", {"gdpr": ["Art. 32(1)(a)"], "dora": ["Art. 9(4)(d)"], "iso_27001_2022_annex_a": ["A.8.20", "A.8.24"], "nist_800_53": ["SC-8"]}, "Security Architecture", [("all connections encrypted", ["TLS"]), ("minimum TLS version stated", ["TLS 1."])]),
 ("EU-C3", "Data residency and processing region", "Critical", "The processing and storage region must be stated for every data store and processor. The design must state whether any personal data is transferred outside the EEA, and the transfer mechanism if so.", "MTB-EU-STD-02 Data Location §2", {"gdpr": ["Art. 44", "Art. 46"], "dora": ["Art. 28(3)", "Art. 28(9)"], "iso_27001_2022_annex_a": ["A.5.34"]}, "Privacy Office", [("region per data store", ["Region"]), ("region per processor", ["processor"]), ("transfer statement", ["transfer"])]),
 ("EU-C4", "Personal data inventory", "High", "Personal data must be inventoried by category, the data subjects must be named, and the document must state whether special category data is processed.", "MTB-EU-STD-03 Records of Processing §1", {"gdpr": ["Art. 30(1)(c)", "Art. 35(7)(a)", "Art. 9"], "iso_27001_2022_annex_a": ["A.5.34"]}, "Privacy Office", [("data categories listed", ["category"]), ("data subjects named", ["data subjects"]), ("special category flag stated", ["special category"])]),
 ("EU-C5", "Retention and deletion", "High", "A retention period must be stated as a number with a unit, and a deletion mechanism such as a job, lifecycle rule or TTL must be described.", "MTB-EU-STD-04 Retention §2", {"gdpr": ["Art. 5(1)(e)", "Art. 17"], "iso_27001_2022_annex_a": ["A.8.10"]}, "Privacy Office", [("numeric retention period", ["months", "years", "days"]), ("deletion mechanism named", ["deletion", "TTL", "lifecycle"])]),
 ("EU-C6", "Processors and sub-processors", "Critical", "Every processor and sub-processor that can access personal data must be listed in the design, and the list must match the processing agreements in the package.", "MTB-EU-STD-05 Third Parties §3", {"gdpr": ["Art. 28(2)", "Art. 28(4)"], "dora": ["Art. 28(3)", "Art. 30"], "iso_27001_2022_annex_a": ["A.5.19", "A.5.20", "A.5.21"]}, "Privacy Office", [("processors listed or none stated", ["processor"]), ("list matches agreements in the package", ["sub-processor"])]),
 ("EU-C7", "Network segmentation and trust boundaries", "High", "Network segmentation must be described, trust boundaries shown, and every inbound path and the internet egress posture stated.", "MTB-EU-STD-08 Network §2", {"dora": ["Art. 9(4)(b)"], "iso_27001_2022_annex_a": ["A.8.20", "A.8.22"], "nist_800_53": ["SC-7"]}, "Security Architecture", [("segmentation described", ["VPC", "subnet"]), ("inbound paths stated", ["inbound"]), ("egress posture stated", ["internet gateway", "NAT"])]),
 ("EU-C8", "Least-privilege access", "Critical", "Access must use named roles scoped to specific resources. There must be no shared administrator account, and human access to production data must not be standing.", "MTB-EU-STD-09 Access §2", {"dora": ["Art. 9(4)(c)"], "iso_27001_2022_annex_a": ["A.5.15", "A.5.18", "A.8.2"], "nist_800_53": ["AC-6"]}, "Security Architecture", [("named scoped roles", ["Role"]), ("no shared admin", ["shared administrator"]), ("no standing human data access", ["break-glass", "standing"])]),
 ("EU-C9", "Security logging and monitoring", "High", "Security events must be logged to a protected location, with a numeric retention period and a description of alerting and its routing.", "MTB-EU-STD-10 Logging §3", {"dora": ["Art. 10"], "iso_27001_2022_annex_a": ["A.8.15", "A.8.16"], "nist_800_53": ["AU-2", "AU-11"]}, "Technology Resilience", [("security event sources logged", ["CloudTrail"]), ("numeric retention", ["days", "months"]), ("alert routing", ["alert"])]),
 ("EU-C10", "Rollback and recovery", "Medium", "A rollback plan for deployments must exist, and RTO and RPO must be stated as numbers.", "MTB-EU-STD-11 Continuity §2", {"dora": ["Art. 11", "Art. 12"], "iso_27001_2022_annex_a": ["A.5.30", "A.8.13"], "nist_800_53": ["CP-2", "CP-10"]}, "Technology Resilience", [("rollback plan described", ["roll back"]), ("RTO stated", ["RTO"]), ("RPO stated", ["RPO"])]),
]
profile_eu = {"profile_id": "profile-eu", "profile_version": "2026.1-eu", "default": False, "name": "Meridian group EU design review (GDPR, DORA), alternate",
  "fields": FIELDS, "handed_to_model": profile_us["handed_to_model"], "materiality": MATERIALITY, "attestation_phrase": ATTESTATION,
  "assessment_rule": profile_us["assessment_rule"],
  "controls": [{"id": i, "title": t, "requirement": r, "required_clauses": RC(i, *rc), "standard": s,
                "applicability": "Applies when the application processes personal data of EU or EEA data subjects or supports an EU entity's ICT services.",
                "evidence": ["Architecture document", "Data flow document", "Processing agreements in the package"] if i in ("EU-C3", "EU-C4", "EU-C5", "EU-C6") else ["Architecture document", "Runbook"],
                "tier": tier, "framework_map": {"status": ILL, **fm}, "reviewer_role": "ARB reviewer, " + role}
               for i, t, tier, r, s, fm, role, rc in eu_rows]}
for c in profile_eu["controls"]: assert list(c) == FIELDS

# ============================================================ people
PRIYA = {"type": "human", "name": "Priya Natarajan", "role": "Principal Security Architect, ARB reviewer", "box_user_id": "30118802", "box_login": "priya.natarajan@meridiantrust.example"}
MARCUS = {"type": "human", "name": "Marcus Hale", "role": "Data Governance and Third-Party Risk Lead, ARB reviewer", "box_user_id": "30118803", "box_login": "marcus.hale@meridiantrust.example"}
DANA = {"type": "human", "name": "Dana Okafor", "role": "ARB reviewer, Technology Resilience", "box_user_id": "30118804", "box_login": "dana.okafor@meridiantrust.example"}
ALVAREZ = {"type": "human", "name": "R. Alvarez", "role": "ARB chair", "box_user_id": "30118801"}
JPARK = {"name": "J. Park (Eng)", "box_user_id": "30118811", "box_login": "j.park@meridiantrust.example"}
AGENT = {"type": "agent", "name": "keel-evaluator", "role": "machine assessment", "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE}
APP = {"type": "app", "name": "keel", "role": "snapshot, validation, staleness and projection"}
def human(p): return {k: p[k] for k in ("type", "name", "role", "box_user_id")}
def box_identity(p): return {"assigned_to": {"id": p["box_user_id"], "login": p["box_login"], "name": p["name"]}, "source": "identity as returned by Box (task assignment assigned_to)"}

# ============================================================ engine
class Ledger:
    def __init__(self): self.events = []; self.prev = "0" * 64
    def add(self, ts, phase, snap, etype, actor, **kw):
        e = {"event_id": f"EVT-{len(self.events)+1:04d}", "ts": ts, "phase": phase, "snapshot_id": snap, "control_id": kw.pop("control_id", None),
             "event_type": etype, "machine_assessment": kw.pop("machine_assessment", None), "prior_machine_assessment": kw.pop("prior_machine_assessment", None),
             "change_classification": kw.pop("change_classification", None), "human_disposition": kw.pop("human_disposition", None), "actor": actor,
             "fileId": kw.pop("fileId", None), "fileName": kw.pop("fileName", None), "versionId": kw.pop("versionId", None), "contentHash": kw.pop("contentHash", None),
             "quote": kw.pop("quote", None), "basis": kw.pop("basis", None), "clause_support": kw.pop("clause_support", None), "prompt_hash": kw.pop("prompt_hash", None),
             "projection": kw.pop("projection", {"box_metadata": "n/a"}), "mrm_model_id": MRM_MODEL_ID, "normalization": NORMALIZATION}
        e["box_deep_link"] = deep_link(e["fileId"], e["versionId"])
        e.update(kw)
        e["chain_hash"] = hashlib.sha256((self.prev + json.dumps(e, sort_keys=True)).encode()).hexdigest()
        self.prev = e["chain_hash"]; self.events.append(e); return e
    def verify(self):
        pc = "0" * 64
        for e in self.events:
            body = {k: v for k, v in e.items() if k != "chain_hash"}
            assert hashlib.sha256((pc + json.dumps(body, sort_keys=True)).encode()).hexdigest() == e["chain_hash"]; pc = e["chain_hash"]
        dated = [e["ts"] for e in self.events if e["ts"] != "LIVE"]
        assert dated == sorted(dated), "ledger out of time order"
        live = [e["ts"] == "LIVE" for e in self.events]
        assert live == sorted(live), "dated event after LIVE"
    def population(self):
        t = [e["event_type"] for e in self.events]
        names = ["file_version_observed", "snapshot_captured", "evaluation_attempt", "evaluation_completed", "control_evaluated", "evaluation_error", "verification_holds",
                 "binding_changed", "box_metadata_written", "box_task_created", "box_task_response_ingested", "human_disposition_recorded"]
        return {n: t.count(n) for n in names}

class Scenario:
    """Holds state for one package. judge(snap, cid) returns {clause_id: (version_key, quote_key)} for supported clauses."""
    def __init__(self, vers, ctl_ids, ctl, snap_keys, snap_ts, snap_era, judge, profile_version):
        self.V, self.ids, self.ctl, self.keys, self.judge = vers, ctl_ids, ctl, snap_keys, judge
        self.L = Ledger(); self.pv = profile_version
        self.snapshots = {}
        for s in snap_keys:
            files = [{x: vers[k][x] for x in ("fileId", "fileName", "versionId", "contentHash")} for k in snap_keys[s]]
            body = {"snapshot_id": s, "captured_at": snap_ts[s], "control_profile_version": profile_version, "files": files}
            self.snapshots[s] = {**body, "era": snap_era[s], "manifest_hash": sha(json.dumps(body, sort_keys=True))}
        self.current = None
        self.state = {c: {"assessment": None, "classification": None, "binding": None, "evidence": [], "clauses": None, "eval_state": "pending"} for c in ctl_ids}
        self.disp = {c: {"value": "unreviewed"} for c in ctl_ids}   # current disposition (bound to snapshot + binding)
        self.prior_ver = {c: None for c in ctl_ids}                  # most recent verification, historical record
        self.holds = {c: False for c in ctl_ids}
        self.last_review = None
    def vk(self, snap, fid): return [k for k in self.keys[snap] if self.V[k]["fileId"] == fid][0]
    def clause_support(self, snap, cid, readable):
        sup = self.judge(snap, cid); out = []
        for rc in self.ctl[cid]["required_clauses"]:
            ref = sup.get(rc["clause_id"])
            if ref:
                k, q = ref; assert k in self.keys[snap] and k in readable, (cid, k, snap)
                out.append({"clause_id": rc["clause_id"], "clause": rc["clause"], "support": "supported", "quote": self.V.ev(k, Q[q])})
            else:
                out.append({"clause_id": rc["clause_id"], "clause": rc["clause"], "support": "unsupported", "quote": None})
        return out
    @staticmethod
    def assessment_from(cs):
        n = sum(1 for c in cs if c["support"] == "supported")
        return "evidence_found" if n == len(cs) else ("evidence_absent" if n == 0 else "evidence_weakened")
    @staticmethod
    def binding_from(cs):
        quotes = {}
        for c in cs:
            if c["quote"]: quotes.setdefault((c["quote"]["versionId"], c["quote"]["quote"]), [c["quote"], 0])[1] += 1
        if not quotes: return None, []
        ranked = sorted(quotes.values(), key=lambda z: -z[1])
        return ranked[0][0], [z[0] for z in ranked]
    def classify(self, cid, new_assess, new_binding):
        prior = self.state[cid]["binding"]
        if prior is None: return "none"
        if new_assess == "evidence_absent": return "removed"
        if new_assess == "evidence_weakened": return "weakened"
        if new_binding and new_binding["fileId"] == prior["fileId"] and norm(new_binding["quote"]) == norm(prior["quote"]): return "unchanged"
        if new_binding and norm(new_binding["quote"]) != norm(prior["quote"]) and self.state[cid]["assessment"] != "evidence_found": return "none"
        return "moved"
    def display(self, cid):
        st, d, pv = self.state[cid], self.disp[cid], self.prior_ver[cid]
        unsup = [c["clause"] for c in (st["clauses"] or []) if c["support"] == "unsupported"]
        if st["eval_state"] == "pending": return "PENDING", "Re-check pending"
        if st["eval_state"] == "error" or st["assessment"] == "not_evaluated": return "NOT_EVALUATED", "Not evaluated"
        on_current = d.get("snapshot_id") == self.current and st["binding"] and d.get("binding_vid") == st["binding"]["versionId"]
        if d["value"] == "returned_to_author" and d.get("snapshot_id") == self.current: return "RETURNED_TO_AUTHOR", "Returned to author, open"
        if d["value"] == "verified" and on_current: return "VERIFIED", "Verified"
        if pv and self.holds[cid]: return "VERIFIED_HOLDS", "Verified, holds"
        if pv and st["classification"] == "unchanged" and self.ctl[cid]["tier"] == "Critical": return "ACKNOWLEDGE", "Acknowledge: evidencing file changed"
        if st["assessment"] == "evidence_found" and st["classification"] == "moved": return "NEEDS_REVIEW_BINDING", "Needs review: evidence binding changed"
        if st["assessment"] == "evidence_weakened":
            label = "key-management evidence" if cid == "SEC-ARCH-07" else (unsup[0] if unsup else "clause")
            return "NEEDS_REVIEW_WEAKENED", f"Needs review: {label} missing"
        if st["assessment"] == "evidence_absent": return "NEEDS_REVIEW_ABSENT", "Needs review: evidence lost"
        if st["assessment"] == "evidence_contradicted": return "NEEDS_REVIEW_CONFLICT", "Needs review: conflicting evidence"
        return "PENDING", "Pending review"
    # ---------------- ledger writers
    def observe(self, phase, snap, keys):
        for k in keys:
            v = self.V[k]
            self.L.add(v["uploadedAt"], phase, snap, "file_version_observed", {"type": "human" if " " in v["uploadedBy"] else "service", "name": v["uploadedBy"], "role": "uploader"},
                       fileId=v["fileId"], fileName=v["fileName"], versionId=v["versionId"], contentHash=v["contentHash"],
                       **({"version_comment": v["versionComment"], "confluence_editor": v["confluenceEditor"], "jira": v["jira"]} if "versionComment" in v else {}))
        s = self.snapshots[snap]
        self.L.add(s["captured_at"], phase, snap, "snapshot_captured", APP, manifest_hash=s["manifest_hash"], control_profile_version=self.pv,
                   files=[{"fileName": f["fileName"], "versionId": f["versionId"], "contentHash": f["contentHash"]} for f in s["files"]])
        self.current = snap
        for c in self.ids: self.state[c]["eval_state"] = "pending"
    def evaluate(self, phase, snap, ts, attempt=1, unreadable=(), only=None, basis_for=None, extra_for=None):
        readable = [k for k in self.keys[snap] if k not in unreadable]
        ev_id = f"EVAL-{snap}"
        coverage = {"readable": len(readable), "total": len(self.keys[snap])}
        self.L.add(ts, phase, snap, "evaluation_attempt", AGENT, evaluation_id=ev_id, attempt=attempt, coverage=coverage, prompt_hash=PROMPT_HASH,
                   model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION)
        results = {}
        for i, cid in enumerate(only or self.ids):
            t = tick(ts, i + 1)
            if any(self.V[k]["fileName"].split(".")[0] in " ".join(self.ctl[cid]["evidence"]) for k in unreadable):
                k = unreadable[0]; v = self.V[k]
                self.L.add(t, phase, snap, "evaluation_error", APP, control_id=cid, machine_assessment="not_evaluated", prior_machine_assessment=self.state[cid]["assessment"],
                           human_disposition=self.disp[cid]["value"], fileId=v["fileId"], fileName=v["fileName"], versionId=v["versionId"], contentHash=v["contentHash"],
                           evaluation_id=ev_id, attempt=attempt, coverage=coverage,
                           error={"code": "TEXT_REPRESENTATION_NOT_READY", "message": "Box text representation still processing after upload (HTTP 202). File temporarily unreadable."},
                           basis=["Downgrade example: an evidence location for this control could not be read, so the finding is not_evaluated rather than a quote-less positive.", "Retry scheduled as attempt 2."],
                           projection={"box_metadata": "deferred"})
                self.state[cid].update(assessment="not_evaluated", eval_state="error"); results[cid] = None; continue
            cs = self.clause_support(snap, cid, readable)
            ma = self.assessment_from(cs); binding, evid = self.binding_from(cs)
            cc = self.classify(cid, ma, binding)
            prior_a = self.state[cid]["assessment"]
            basis = (basis_for or {}).get(cid) or self.default_basis(cid, cs, cc)
            self.L.add(t, phase, snap, "control_evaluated", AGENT, control_id=cid, machine_assessment=ma, prior_machine_assessment=prior_a, change_classification=cc,
                       human_disposition=self.disp[cid]["value"], fileId=binding and binding["fileId"], fileName=binding and binding["fileName"],
                       versionId=binding and binding["versionId"], contentHash=binding and self.V[self.V.by_vid(binding["versionId"])]["contentHash"],
                       quote=binding and binding["quote"], basis=basis, clause_support=cs, evidence=evid, evaluation_id=ev_id, attempt=attempt, coverage=coverage,
                       prompt_hash=PROMPT_HASH, model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION,
                       **((extra_for or {}).get(cid, {})), projection={"box_metadata": "pending"})
            results[cid] = {"cs": cs, "ma": ma, "binding": binding, "evidence": evid, "cc": cc, "prior_binding": self.state[cid]["binding"], "basis": basis}
            self.state[cid].update(assessment=ma, classification=cc, binding=binding, evidence=evid, clauses=cs, eval_state="complete")
        return results
    def default_basis(self, cid, cs, cc):
        n = sum(1 for c in cs if c["support"] == "supported")
        b = [f"{n} of {len(cs)} required clauses supported by validated quotes."]
        if cc == "unchanged": b.append("Prior binding quote matched after normalization.")
        if cc == "none": b.append("No prior evidence to compare.")
        if n < len(cs): b.append("Unsupported: " + "; ".join(c["clause"] for c in cs if c["support"] == "unsupported") + ".")
        return b
    def staleness(self, phase, snap, ts, results):
        """Design v3.2 section 3 step 7. Writes verification_holds / binding_changed events."""
        for cid in self.ids:
            pv = self.prior_ver[cid]; r = results.get(cid)
            if not pv or not r: self.holds[cid] = False; continue
            file_changed = r["binding"] and r["binding"]["versionId"] != pv["binding"]["versionId"]
            same_file = r["binding"] and r["binding"]["fileId"] == pv["binding"]["fileId"]
            tier = self.ctl[cid]["tier"]
            if r["cc"] == "unchanged" and same_file:
                if file_changed and MATERIALITY[tier] == "acknowledge_on_evidencing_file_change":
                    self.holds[cid] = False; continue
                self.holds[cid] = True
                note = (f"evidencing file version changed ({pv['binding']['fileName']} {pv['binding']['versionLabel']} to {r['binding']['versionLabel']}); cited quote unchanged; tier {tier} holds without acknowledgment"
                        if file_changed else
                        f"evidencing file version unchanged; another file in the package changed; tier {tier} holds without acknowledgment")
                b = r["binding"]
                self.L.add(ts, phase, snap, "verification_holds", APP, control_id=cid, machine_assessment=r["ma"], change_classification="unchanged", human_disposition="verified",
                           prior_verification={k: pv[k] for k in ("by", "role", "at", "snapshot_id")}, fileId=b["fileId"], fileName=b["fileName"], versionId=b["versionId"],
                           contentHash=self.V[self.V.by_vid(b["versionId"])]["contentHash"], quote=b["quote"], note=note, materiality=MATERIALITY[tier])
            else:
                self.holds[cid] = False
                if r["cc"] == "moved":
                    b = r["binding"]
                    self.L.add(ts, phase, snap, "binding_changed", APP, control_id=cid, machine_assessment=r["ma"], change_classification="moved", human_disposition="verified",
                               prior_verification={k: pv[k] for k in ("by", "role", "at", "snapshot_id")}, previous_binding=pv["binding"],
                               fileId=b["fileId"], fileName=b["fileName"], versionId=b["versionId"], contentHash=self.V[self.V.by_vid(b["versionId"])]["contentHash"], quote=b["quote"],
                               acknowledgment={"required": True, "severity": "Low"}, note=self.moved_note(cid, pv, b))
    def moved_note(self, cid, pv, b):
        existed = any(self.V.present(k, b["quote"]) for k in self.V.v if self.V[k]["fileId"] == b["fileId"] and k != self.V.by_vid(b["versionId"]))
        return (f"selected binding moved from {pv['binding']['fileName']} {pv['binding']['versionLabel']} to {b['fileName']} {b['versionLabel']}; "
                + ("the quote already existed in that file, so the binding moved and the support did not" if existed else "the quote is new in that file"))
    def completed(self, phase, snap, ts, attempts, **extra):
        out = [{"control_id": c, "machine_assessment": self.state[c]["assessment"], "change_classification": self.state[c]["classification"]} for c in self.ids]
        self.L.add(ts, phase, snap, "evaluation_completed", AGENT, evaluation_id=f"EVAL-{snap}", evaluation_state="complete", attempts=attempts,
                   coverage={"readable": len(self.keys[snap]), "total": len(self.keys[snap])}, controls_evaluated=len(self.ids), outcomes=out,
                   prompt_hash=PROMPT_HASH, model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION, **extra)
    def project(self, phase, snap, ts):
        fields = {"keel_snapshot_id": snap}
        for c in self.ids: fields["keel_status_" + c.replace("-", "_")] = self.display(c)[0]
        fields["keel_last_human_review"] = self.last_review
        fields["keel_record_url"] = RECORD_URL + f"?snapshot={snap}"
        self.L.add(ts, phase, snap, "box_metadata_written", APP, target={"type": "folder", "id": FOLDER_ID, "template": "keelReview", "instance": "folder-level"},
                   pointer_check={"current_snapshot_id": self.current, "matches": self.current == snap}, fields_written=fields,
                   projection={"box_metadata": "ok"}, last_projected_snapshot=snap)
        return fields
    def record_disposition(self, ts, phase, snap, cid, who, value, comment, via, **extra):
        st = self.state[cid]
        if value == "verified":
            assert all(c["support"] == "supported" for c in st["clauses"]) and st["assessment"] != "evidence_contradicted"
        b = st["binding"]
        self.disp[cid] = {"value": value, "snapshot_id": snap, "binding_vid": b["versionId"] if b else None, "by": who["name"], "role": who["role"], "at": ts}
        if value == "verified":
            self.prior_ver[cid] = {"by": who["name"], "role": who["role"], "at": ts, "snapshot_id": snap, "binding": b}
        if ts != "LIVE": self.last_review = f"{who['name']}|{who['role']}|{cid}|{snap}|{ts}"
        else: self.last_review = f"{who['name']}|{who['role']}|{cid}|{snap}|LIVE"
        return self.L.add(ts, phase, snap, "human_disposition_recorded", human(who), control_id=cid, machine_assessment=st["assessment"], change_classification=st["classification"],
                          human_disposition=value, fileId=b and b["fileId"], fileName=b and b["fileName"], versionId=b and b["versionId"],
                          contentHash=b and self.V[self.V.by_vid(b["versionId"])]["contentHash"], quote=b and b["quote"], clause_support=st["clauses"],
                          comment=comment, via=via, reviewer_identity=box_identity(who),
                          checks={"reviewer_on_configured_list": True, "reviewer_is_not_author": True, "binding_current": True,
                                  "all_clauses_supported": all(c["support"] == "supported" for c in st["clauses"]) if value == "verified" else None},
                          freshness_check={"decision_snapshot_id": snap, "current_snapshot_id": self.current, "result": "pass" if snap == self.current else "rejected"},
                          projection={"box_metadata": "pending"}, **extra)
    def diff_hints(self, snap_old, snap_new):
        rows = []
        for cid in self.ids:
            pv = self.prior_ver[cid]
            if not pv: continue
            b = pv["binding"]; k_new = self.vk(snap_new, b["fileId"])
            if self.V.present(k_new, b["quote"]):
                rows.append({"control_id": cid, "file": b["fileName"], "status": "present"}); continue
            terms = [(rc["clause_id"], t) for rc in self.ctl[cid]["required_clauses"] for t in rc["hint_terms"] if has_term(b["quote"], t)]
            kept = [(c, t) for c, t in terms if has_term(self.V.text(k_new), t)]
            rows.append({"control_id": cid, "file": b["fileName"], "quote": b["quote"], "status": "weakened" if kept else "removed",
                         "hint_terms_in_prior_quote": [t for _, t in terms], "hint_terms_still_in_file": [t for _, t in kept],
                         "note": "hint for the evaluator, not a verdict"})
        return rows

def tasks_message_07(fid, find_id, snap):
    return (f"{find_id} (snapshot {snap}): SEC-ARCH-07 Encryption at rest needs review. Encryption is still stated in architecture.md v3 §4.3, "
            "but the key model, rotation period, custodians and AES-256 have no support. Priya Natarajan verified the v2 sentence on 2026-10-08.")

# ============================================================ FULL FIXTURE
SNAP_KEYS = {"S1": ["arch-v1", "dfc-v1", "run-v1", "ven-v1", "ase-v1"], "S2": ["arch-v2", "dfc-v1", "run-v1", "ven-v1", "ase-v1"],
             "S3": ["arch-v2", "dfc-v1", "run-v2", "ven-v1", "ase-v1"], "S4": ["arch-v3", "dfc-v1", "run-v2", "ven-v1", "ase-v1"]}
SNAP_TS = {"S1": "2026-10-03T15:00:12Z", "S2": "2026-10-07T13:00:05Z", "S3": "2026-10-12T14:20:44Z", "S4": "2026-10-17T15:30:04Z"}
SNAP_ERA = {"S1": "baseline v1", "S2": "verified package v2", "S3": "runbook minor edit", "S4": "v3 upload"}
def judge_full(snap, cid):
    """Mock judge: which quote supports which clause. Assessment and classification are derived by code."""
    a = [k for k in SNAP_KEYS[snap] if k.startswith("arch")][0]; r = [k for k in SNAP_KEYS[snap] if k.startswith("run")][0]
    c = lambda n: f"{cid}.{n}"
    if cid == "SEC-ARCH-01": return {c(1): ("ase-v1", "01"), c(2): (a, "01x")}
    if cid == "SEC-ARCH-02": return {c(1): ("dfc-v1", "02dfc"), c(2): (a, "02"), c(3): (a, "02")}
    if cid == "SEC-ARCH-04": return {} if snap == "S1" else {c(1): (a, "04"), c(2): (a, "04"), c(3): (a, "04")}
    if cid == "SEC-ARCH-05": return {} if snap == "S1" else {c(1): (a, "05roles"), c(2): (a, "05"), c(3): (a, "05"), c(4): (a, "05")}
    if cid == "SEC-ARCH-07":
        if snap == "S1": return {c(1): (a, "07v1")}
        if snap == "S4": return {c(1): (a, "07w")}
        return {c(1): (a, "07"), c(2): (a, "07aes"), c(3): (a, "07"), c(4): (a, "07"), c(5): (a, "07")}
    if cid == "SEC-ARCH-17": return {} if snap == "S1" else {c(1): (a, "17"), c(2): (a, "17"), c(3): (a, "17")}
    if cid == "SEC-ARCH-20": return {c(n): (a, "20") for n in (1, 2, 3, 4)}
    if cid == "SEC-ARCH-22":
        if snap in ("S2", "S3"): return {c(1): (a, "22"), c(2): (a, "22"), c(3): (a, "22arch_b")}
        return {c(1): (r, "22"), c(2): (r, "22"), c(3): (r, "22b")}
FS = Scenario(FULL, CIDS, CTL, SNAP_KEYS, SNAP_TS, SNAP_ERA, judge_full, PROFILE_VERSION)
L = FS.L

# S1: attempt 1 with one unreadable file (downgrade example), attempt 2 succeeds
FS.observe("seed", "S1", SNAP_KEYS["S1"])
FS.evaluate("seed", "S1", "2026-10-03T15:00:40Z", attempt=1, unreadable=("ase-v1",))
FS.evaluate("seed", "S1", "2026-10-03T15:04:40Z", attempt=2, only=["SEC-ARCH-01"])
FS.completed("seed", "S1", "2026-10-03T15:04:50Z", attempts=2)
FS.project("seed", "S1", "2026-10-03T15:04:51Z")
# S2: verified package
FS.observe("seed", "S2", ["arch-v2"])
FS.evaluate("seed", "S2", "2026-10-07T13:00:31Z", basis_for={"SEC-ARCH-07": ["5 of 5 required clauses supported by validated quotes.", "The v1 statement is replaced at §4.3 ¶1 by customer-managed KMS keys, annual rotation and named custodians.", "No prior verification; change classification none."]})
FS.completed("seed", "S2", "2026-10-07T13:00:45Z", attempts=1)
FS.project("seed", "S2", "2026-10-07T13:00:46Z")
L.add("2026-10-07T15:00:00Z", "seed", "S2", "arb_decision_recorded", human(ALVAREZ), decision=PROJECT["arb_decision"],
      conditions=["Confirm the two approved Bedrock model ids with Model Risk Management by 20 Oct 2026.", "Load test at 2x expected peak by 23 Oct 2026."])
VERIFY = [("SEC-ARCH-05", DANA, "2026-10-07T15:40:12Z"), ("SEC-ARCH-17", DANA, "2026-10-07T15:46:31Z"), ("SEC-ARCH-22", DANA, "2026-10-07T15:52:08Z"),
          ("SEC-ARCH-01", MARCUS, "2026-10-08T09:05:44Z"), ("SEC-ARCH-02", MARCUS, "2026-10-08T09:11:20Z"), ("SEC-ARCH-04", MARCUS, "2026-10-08T09:16:02Z"),
          ("SEC-ARCH-20", MARCUS, "2026-10-08T09:22:47Z"), ("SEC-ARCH-07", PRIYA, "2026-10-08T10:32:00Z")]
for i, (cid, who, vts) in enumerate(VERIFY):
    FS.record_disposition(vts, "seed", "S2", cid, who, "verified", ATTESTATION,
                          {"channel": "Box task", "task_id": f"box-task-7711{i:04d}", "assignment_id": f"box-asgn-8811{i:04d}", "resolution_state": "approved",
                           "completed_at": vts, "ingested_at": tick(vts, 21), "note": "seed: review task creation events elided"})
FS.project("seed", "S2", "2026-10-08T10:32:30Z")
# S3: runbook minor edit; nothing changes; verifications hold
FS.observe("seed", "S3", ["run-v2"])
r3 = FS.evaluate("seed", "S3", "2026-10-12T14:21:09Z")
FS.staleness("seed", "S3", "2026-10-12T14:21:18Z", r3)
assert all(FS.holds.values()), FS.holds
FS.completed("seed", "S3", "2026-10-12T14:21:19Z", attempts=1)
FS.project("seed", "S3", "2026-10-12T14:21:20Z")
# S4: v3 upload (live)
prior_snapshot_quotes = {c: copy.deepcopy(FS.prior_ver[c]) for c in CIDS}
FS.observe("live_v3", "S4", ["arch-v3"])
hints = FS.diff_hints("S3", "S4")
FIND = {c: f"KEEL-2026-04{i+1:02d}" for i, c in enumerate(CIDS)}
w7 = FULL.locate("arch-v3", Q["07w"]); p7 = FULL.locate("arch-v2", Q["07"]); p22 = FULL.locate("arch-v2", Q["22"])
CHANGED_43 = [("Each data store has its own AES-256 key: `lantern-s3-snapshots`, `lantern-ddb-state`, `lantern-aoss-index` and `lantern-logs`.", "Each store is logically isolated with its own encryption context."),
              ("Key policies grant `kms:Decrypt` only to the service roles in 4.2.", "The ability to decrypt is restricted to the service roles described in 4.2."),
              ("Key administration is held by CRYPTO-OPS and is separated from key usage. Scheduling a key for deletion requires a 30-day waiting period and a change ticket approved by CRYPTO-OPS.", "Key lifecycle operations are governed by CRYPTO-OPS in line with Meridian's cryptographic standard.")]
for old, new in CHANGED_43:
    assert FULL.present("arch-v2", old) and not FULL.present("arch-v3", old) and FULL.present("arch-v3", new) and FULL.locate("arch-v3", new)["section"].startswith("§4.3")
BASIS_S4 = {
 "SEC-ARCH-07": [f"Verified quote from architecture.md v2 {p7['section']} ¶{p7['paragraph']} not found in v3 after normalization ({NORMALIZATION}).",
                 f"Encryption is still stated at {w7['section'].split(' ')[0]} ¶{w7['paragraph']}; 1 of 5 required clauses supported. AES-256, the key model, the rotation period and the custodians are unsupported.",
                 "4 other files searched for customer-managed keys, CipherTrust, rotation and key custodians: 0 candidates.",
                 f"{len(CHANGED_43)} other assertions changed in {w7['section'].split(' ')[0]}."],
 "SEC-ARCH-22": [f"Verified quote from architecture.md v2 {p22['section']} ¶{p22['paragraph']} not found in v3 after normalization.",
                 "The same statement matched verbatim in runbook.md v2 §3 Deployment and rollback; 3 of 3 required clauses supported.",
                 "The runbook quote already existed before v3 (runbook.md v1 and v2), so the binding moved and the support did not."],
}
r4 = FS.evaluate("live_v3", "S4", "2026-10-17T15:30:16Z", basis_for=BASIS_S4,
                 extra_for={c: {"finding_id": FIND[c]} for c in CIDS})
assert {c: (r4[c]["ma"], r4[c]["cc"]) for c in CIDS} == {**{c: ("evidence_found", "unchanged") for c in CIDS}, "SEC-ARCH-07": ("evidence_weakened", "weakened"), "SEC-ARCH-22": ("evidence_found", "moved")}
FS.staleness("live_v3", "S4", "2026-10-17T15:30:25Z", r4)
assert [c for c in CIDS if FS.holds[c]] == ["SEC-ARCH-01", "SEC-ARCH-02", "SEC-ARCH-04", "SEC-ARCH-05", "SEC-ARCH-17", "SEC-ARCH-20"]
FS.completed("live_v3", "S4", "2026-10-17T15:30:26Z", attempts=1, quotes_validated="8 of 8")
display_before = {c: FS.display(c) for c in CIDS}
S4_META = FS.project("live_v3", "S4", "2026-10-17T15:30:27Z")
# review tasks: one per finding that needs review
TASK_A = {"task_id": "box-task-77120931", "assignment_id": "box-asgn-88120931", "action": "review", "fileId": F["arch"][0], "assignee": DANA["name"], "assignee_box_user_id": DANA["box_user_id"],
          "finding_id": FIND["SEC-ARCH-07"], "control_id": "SEC-ARCH-07", "snapshot_id": "S4", "message": tasks_message_07(F["arch"][0], FIND["SEC-ARCH-07"], "S4")}
TASK_C = {"task_id": "box-task-77120932", "assignment_id": "box-asgn-88120932", "action": "review", "fileId": F["run"][0], "assignee": DANA["name"], "assignee_box_user_id": DANA["box_user_id"],
          "finding_id": FIND["SEC-ARCH-22"], "control_id": "SEC-ARCH-22", "snapshot_id": "S4",
          "message": f"{FIND['SEC-ARCH-22']} (snapshot S4): SEC-ARCH-22 evidence binding changed (Low). The recovery sentence left architecture.md v3; the same sentence is in runbook.md v2 §3. Confirm the new binding."}
for tk, t in ((TASK_A, "2026-10-17T15:30:28Z"), (TASK_C, "2026-10-17T15:30:29Z")):
    L.add(t, "live_v3", "S4", "box_task_created", APP, control_id=tk["control_id"], finding_id=tk["finding_id"], task=tk,
          server_mapping={"task_id": tk["task_id"], "assignment_id": tk["assignment_id"], "finding_id": tk["finding_id"], "control_id": tk["control_id"], "snapshot_id": "S4", "immutable": True})
DANA_REASON = "Encrypted is stated; the key model and rotation are not. IS-STD-014 §5.1 requires the KMS CMK statement restored."
L.add("2026-10-17T15:33:52Z", "live_v3", "S4", "box_task_response_ingested", APP, control_id="SEC-ARCH-07", finding_id=FIND["SEC-ARCH-07"],
      response={"task_id": TASK_A["task_id"], "assignment_id": TASK_A["assignment_id"], "resolution_state": "rejected", "message": DANA_REASON,
                "completed_at": "2026-10-17T15:33:40Z", "ingested_at": "2026-10-17T15:33:52Z", "dedup_key": TASK_A["assignment_id"] + "|2026-10-17T15:33:40Z"},
      reviewer_identity=box_identity(DANA), mapped_action="returned_to_author")
TASK_B = {"task_id": "box-task-77120944", "assignment_id": "box-asgn-88120944", "action": "review", "kind": "author_remediation", "fileId": F["arch"][0],
          "assignee": JPARK["name"], "assignee_box_user_id": JPARK["box_user_id"], "finding_id": FIND["SEC-ARCH-07"], "control_id": "SEC-ARCH-07", "snapshot_id": "S4",
          "due_at": "2026-10-23T17:00:00Z", "due_rule": "5 business days (profile default remediation window)", "jira": "LAN-2291",
          "message": f"Returned by Dana Okafor (ARB reviewer): \"{DANA_REASON}\" Lost from architecture.md §4.3 in v3: \"{Q['07']}\" and \"{Q['07aes']}\" Restore them or cite where the key model is now documented."}
L.add("2026-10-17T15:33:53Z", "live_v3", "S4", "box_task_created", APP, control_id="SEC-ARCH-07", finding_id=FIND["SEC-ARCH-07"], task=TASK_B,
      lost_clauses=[c["clause"] for c in FS.state["SEC-ARCH-07"]["clauses"] if c["support"] == "unsupported"],
      server_mapping={"task_id": TASK_B["task_id"], "assignment_id": TASK_B["assignment_id"], "finding_id": FIND["SEC-ARCH-07"], "control_id": "SEC-ARCH-07", "snapshot_id": "S4", "immutable": True})
FS.record_disposition("2026-10-17T15:33:54Z", "live_v3", "S4", "SEC-ARCH-07", DANA, "returned_to_author", DANA_REASON,
                      {"channel": "Box task", "task_id": TASK_A["task_id"], "assignment_id": TASK_A["assignment_id"], "resolution_state": "rejected"},
                      finding_id=FIND["SEC-ARCH-07"], due_at=TASK_B["due_at"], author_task_id=TASK_B["task_id"], jira="LAN-2291",
                      recorded_after="author task created successfully")
DANA_22 = "Recovery targets present in runbook §3; binding updated. " + ATTESTATION
L.add("2026-10-17T15:34:22Z", "live_v3", "S4", "box_task_response_ingested", APP, control_id="SEC-ARCH-22", finding_id=FIND["SEC-ARCH-22"],
      response={"task_id": TASK_C["task_id"], "assignment_id": TASK_C["assignment_id"], "resolution_state": "approved", "message": DANA_22,
                "completed_at": "2026-10-17T15:34:10Z", "ingested_at": "2026-10-17T15:34:22Z", "dedup_key": TASK_C["assignment_id"] + "|2026-10-17T15:34:10Z", "attestation_present": True},
      reviewer_identity=box_identity(DANA), mapped_action="verified", acknowledgment_duration_s=30)
FS.record_disposition("2026-10-17T15:34:23Z", "live_v3", "S4", "SEC-ARCH-22", DANA, "verified", DANA_22,
                      {"channel": "Box task", "task_id": TASK_C["task_id"], "assignment_id": TASK_C["assignment_id"], "resolution_state": "approved"},
                      finding_id=FIND["SEC-ARCH-22"], rebinding="re-verified on runbook.md v2")
display_after = {c: FS.display(c) for c in CIDS}
FS.project("live_v3", "S4", "2026-10-17T15:34:24Z")
L.verify()
assert [display_before[c][0] for c in CIDS].count("VERIFIED_HOLDS") == 6
assert display_before["SEC-ARCH-07"][0] == "NEEDS_REVIEW_WEAKENED" and display_before["SEC-ARCH-22"][0] == "NEEDS_REVIEW_BINDING"
assert [display_after[c][0] for c in CIDS].count("VERIFIED_HOLDS") == 6 and display_after["SEC-ARCH-07"][0] == "RETURNED_TO_AUTHOR" and display_after["SEC-ARCH-22"][0] == "VERIFIED"

def make_findings(S, results, fids, prior, snap, before, after, actions):
    out = []
    for cid in S.ids:
        r = results[cid]; pv = prior[cid]
        out.append({"finding_id": fids[cid], "control_id": cid, "control_title": S.ctl[cid]["title"], "tier": S.ctl[cid]["tier"], "materiality": MATERIALITY[S.ctl[cid]["tier"]],
                    "snapshot_id": snap, "machine_assessment": r["ma"], "change_classification": r["cc"], "basis": r["basis"], "evidence": r["evidence"], "clause_support": r["cs"],
                    "prior_evidence": [{**pv["binding"], "verified_by": pv["by"], "verified_role": pv["role"], "verified_at": pv["at"], "verified_snapshot_id": pv["snapshot_id"]}],
                    "verification_holds": S.holds[cid] if before[cid][0] != "VERIFIED" else None,
                    "expected_display": before[cid][1], "expected_projection_code": before[cid][0],
                    "expected_display_after_human_action": after[cid][1], "expected_projection_code_after_human_action": after[cid][0],
                    "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE, "prompt_version": PROMPT_VERSION, "prompt_hash": PROMPT_HASH,
                    "mrm_model_id": MRM_MODEL_ID, "normalization": NORMALIZATION, "box_deep_link": f"https://app.box.com/folder/{FOLDER_ID}?keel_finding={fids[cid]}",
                    "suggested_action": actions[cid]})
    return out
ACTIONS = {c: "None. The prior verification holds." for c in CIDS}
ACTIONS["SEC-ARCH-07"] = "Return to author: restore the AWS KMS customer-managed key, annual rotation, custodian and AES-256 statements in §4.3 (IS-STD-014 §5.1). Verify stays unavailable until every required clause has a supporting quote."
ACTIONS["SEC-ARCH-22"] = "Acknowledge the new binding (Low): confirm runbook.md v2 §3 as the evidence of record."
findings = make_findings(FS, r4, FIND, prior_snapshot_quotes, "S4", display_before, display_after, ACTIONS)
q_checked = []
for fd in findings:
    for x in fd["evidence"]:
        k = FULL.by_vid(x["versionId"]); assert k in SNAP_KEYS["S4"] and FULL.present(k, x["quote"]); q_checked.append(fd["control_id"])
    for c in fd["clause_support"]:
        if c["quote"]: assert FULL.present(FULL.by_vid(c["quote"]["versionId"]), c["quote"]["quote"])
q_primary = [fd["evidence"][0] for fd in findings]
assert len(q_primary) == 8
def counts(disp): 
    out = {}
    for c, (_, label) in disp.items(): out[label] = out.get(label, 0) + 1
    return out
ledger = {"folderId": FOLDER_ID, "folderName": "Project Lantern - ARB package", **PROJECT, "control_profile": "profile-us-bank", "control_profile_version": PROFILE_VERSION,
          "append_only": True, "scope": "All observed revisions and outcomes, including evaluations that changed nothing and evaluations that failed.",
          "staleness_rule": "Keyed to the evidence binding, not the snapshot; profile materiality by tier (design v3.2 section 3 step 7).",
          "chain": {"algorithm": "sha256(previous chain_hash + canonical JSON of event without chain_hash)", "genesis": "0" * 64, "head": L.events[-1]["chain_hash"]},
          "population": L.population(), "phases": {"seed": "Before the demo: S1 to S3, the ARB decision and the verifications.", "live_v3": "Produced on stage by the v3 upload (S4) and the reviewer's responses."},
          "events": L.events}
expected = {**PROJECT, "snapshot_id": "S4", "prior_snapshot_id": "S3", "manifest_hash": FS.snapshots["S4"]["manifest_hash"], "control_profile_version": PROFILE_VERSION,
  "trigger": {"fileId": F["arch"][0], "fileName": F["arch"][1], "fromVersionId": FULL["arch-v2"]["versionId"], "toVersionId": FULL["arch-v3"]["versionId"], "uploadedBy": "svc-confluence-export", **V3_META},
  "summary": {"controls_evaluated": 8, "evidence_found": 7, "evidence_weakened": 1, "evidence_absent": 0, "evidence_contradicted": 0, "not_evaluated": 0,
              "change_classification": {"unchanged": 6, "weakened": 1, "moved": 1}, "verification_holds": 6, "binding_changed": 1,
              "top_line_before_human_action": "8 controls on snapshot S4: 6 Verified holds, 1 Needs review (Low), 1 Needs review (Critical).",
              "top_line_after_human_action": "6 Verified holds, 1 Verified, 1 Returned to author.",
              "displayed_counts_before": counts(display_before), "displayed_counts_after": counts(display_after)},
  "prior_quote_diff_hints": hints, "removed_from_v2": [Q["07"], Q["07aes"], Q["22"]],
  "box_tasks": {"A_review_SEC_ARCH_07": TASK_A["task_id"], "B_author_remediation": TASK_B["task_id"], "C_review_SEC_ARCH_22": TASK_C["task_id"]},
  "human_actions_expected": [{"control_id": "SEC-ARCH-07", "actor": "Dana Okafor", "task": TASK_A["task_id"], "resolution": "rejected", "disposition": "returned_to_author", "message": DANA_REASON, "author_task": TASK_B["task_id"], "due_at": TASK_B["due_at"]},
                             {"control_id": "SEC-ARCH-22", "actor": "Dana Okafor", "task": TASK_C["task_id"], "resolution": "approved", "disposition": "verified", "binding": "runbook.md v2", "message": DANA_22}],
  "findings": findings}

# ============================================================ traces
class Trace:
    def __init__(self): self.steps = []; self.t = 0
    def step(self, source, kind, label, ms, **kw):
        self.steps.append({"seq": len(self.steps) + 1, "source": source, "startMs": self.t, "durationMs": ms, "kind": kind, "label": label, **kw}); self.t += ms
def agent_substeps(t0, vers, snap, ids, prior, search_keys, n_files, read_ms, write_ms, out_tokens):
    sub, st = [], t0
    def s(kind, label, ms, **kw):
        nonlocal st; sub.append({"source": "agent", "kind": kind, "label": label, "startMs": st, "durationMs": ms, **kw}); st += ms
    s("model_turn", f"Reading requirement, required clauses, applicability and evidence for {len(ids)} controls with {n_files} file texts and diff hints", read_ms)
    for c in ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-17"]:
        pv = prior[c]
        s("tool_call", f"get_prior_evidence({c})", 55, tool="get_prior_evidence", args={"control_id": c},
          result={"quote": pv["binding"]["quote"], "fileName": pv["binding"]["fileName"], "versionId": pv["binding"]["versionId"], "verified_by": pv["by"], "verified_at": pv["at"]})
    hits = [vers[k]["fileName"] for k in search_keys if has_term(vers.text(k), "customer-managed keys")]
    s("tool_call", 'search_snapshot("customer-managed keys")', 140, tool="search_snapshot", args={"query": "customer-managed keys", "snapshot_id": snap},
      result={"files_searched": [vers[k]["fileName"] for k in search_keys], "match_count": len(hits), "matches": []})
    rto = [k for k in search_keys if has_term(vers.text(k), "RTO")]
    s("tool_call", 'search_snapshot("RTO")', 130, tool="search_snapshot", args={"query": "RTO", "snapshot_id": snap},
      result={"files_searched": [vers[k]["fileName"] for k in search_keys], "match_count": len(rto), "matches": [vers.ev(k, Q["22"]) for k in rto]})
    s("model_turn", f"Writing {len(ids)} typed findings with per-clause support", write_ms, output_tokens=out_tokens)
    assert not hits and [vers[k]["fileName"] for k in rto] == ["runbook.md"]
    return sub, st - t0
def build_trace(S, snap, prior_snap, ids, results, prior, hints, search_keys, files_label, meta, task, read_ms, write_ms, tokens, findings_label, step_ms):
    tr = Trace(); s = S.snapshots[snap]
    n = len(s["files"])
    tr.step("app", "snapshot_captured", f"Snapshot {snap} captured: {n} files", step_ms[0],
            detail={"snapshot_id": snap, "manifest_hash": s["manifest_hash"], "files": s["files"]})
    tr.step("app", "texts_fetched", f"Texts fetched by version: coverage {n} of {n} readable", step_ms[1],
            detail={"coverage": f"{n} of {n}", "downloaded": [{"fileName": "architecture.md", "versionId": S.V["arch-v3"]["versionId"]}], "cached": [f["fileName"] for f in s["files"] if f["fileName"] != "architecture.md"]})
    w = sum(1 for h in hints if h["status"] == "weakened"); rm = sum(1 for h in hints if h["status"] == "removed")
    tr.step("app", "prior_quotes_diffed", f"Prior quotes diffed: {w} weakened, {rm} removed, 0 added", step_ms[2], detail={"prior_snapshot_id": prior_snap, "hints": hints, "added_bound_quotes": 0})
    sub, ms = agent_substeps(tr.t, S.V, snap, ids, prior, search_keys, n, read_ms, write_ms, tokens)
    tr.step("agent", "agent_evaluation", f"Agent evaluation: one Claude Sonnet 4.6 call, {len(ids)} controls", ms, model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE,
            prompt_version=PROMPT_VERSION, prompt_hash=PROMPT_HASH, mrm_model_id=MRM_MODEL_ID,
            detail={"output_tokens": tokens, "structured_output": "FindingSet (zod)", "substeps": sub, "result": {c: [results[c]["ma"], results[c]["cc"]] for c in ids}})
    tr.step("app", "quotes_validated", f"{len(ids)} of {len(ids)} quotes matched; a failed match would set the finding to not_evaluated. Coverage complete.", step_ms[3],
            detail={"normalization": NORMALIZATION, "downgraded": []})
    tr.step("app", "findings_applied", findings_label, step_ms[4], detail={"assessment_rule": profile_us["assessment_rule"]})
    ev_ids = [e["event_id"] for e in S.L.events if e["snapshot_id"] == snap and e["event_type"] in ("evaluation_attempt", "control_evaluated", "verification_holds", "binding_changed", "evaluation_completed")]
    tr.step("app", "ledger_events_written", f"Ledger events written: {len(ev_ids)} events, hash chain extended", step_ms[5], detail={"event_ids": ev_ids})
    tr.step("app", "box_folder_metadata_written", "Box folder metadata written: keel_snapshot_id, one status field per control, keel_last_human_review, keel_record_url", step_ms[6],
            detail={"pointer_check": "current snapshot matches", "fields": meta, "outcome": "ok"})
    tr.step("app", "box_task_created", task[0], step_ms[7], detail=task[1])
    return tr
tr = build_trace(FS, "S4", "S3", CIDS, r4, prior_snapshot_quotes, hints, OTHERS, "5 files", S4_META,
                 ("Box review tasks created: task A for SEC-ARCH-07, task C for SEC-ARCH-22 (both Dana Okafor)", {"tasks": [TASK_A, TASK_C]}),
                 4100, 6700, 2690, "Findings applied: 1 weakened, 1 binding moved, 6 verifications hold", [240, 720, 80, 55, 40, 35, 470, 520])
assert 12500 <= tr.t <= 13500, tr.t
trace_full = {"run_id": "run-20261017-153004-lantern", "mode_label": "Live", "snapshot_id": "S4", "prior_snapshot_id": "S3", "started_at": SNAP_TS["S4"],
              "total_duration_ms": tr.t, "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE, "mrm_model_id": MRM_MODEL_ID, "steps": tr.steps}

# ============================================================ LIVE SLICE
os.makedirs(SL, exist_ok=True)
shutil.copyfile(P("architecture-v2.md"), os.path.join(SL, "architecture-v2.md"))
shutil.copyfile(P("architecture-v3.md"), os.path.join(SL, "architecture-v3.md"))
shutil.copyfile(P("runbook-v1.md"), os.path.join(SL, "runbook.md"))
LV = Versions()
LV.add("arch-v2", "arch", "1801102232", "v2", "2026-10-07T12:58:31Z", "Kevin Lindqvist", os.path.join(SL, "architecture-v2.md"))
LV.add("run-v1", "run", "1801102251", "v1", "2026-10-03T14:53:40Z", "Kevin Lindqvist", os.path.join(SL, "runbook.md"))
LV.add("arch-v3", "arch", "1801102233", "v3", "LIVE", "svc-confluence-export", os.path.join(SL, "architecture-v3.md"), **V3_META)
LCIDS = ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-17"]
live_ctl = {c: copy.deepcopy(CTL[c]) for c in LCIDS}
live_ctl["SEC-ARCH-22"]["requirement"] = "Recovery targets and rollback path are documented: the package states RTO and RPO and describes a rollback path for deployments. BIA consistency check: pilot scope."
live_ctl["SEC-ARCH-22"]["required_clauses"] = RC("SEC-ARCH-22", ("RTO and RPO stated", ["RTO", "RPO"]), ("rollback path described", ["roll back"]))
profile_live = {"profile_id": "profile-live", "profile_version": PROFILE_VERSION + "-live", "derived_from": "profile-us-bank " + PROFILE_VERSION, "fields": FIELDS,
                "materiality": MATERIALITY, "attestation_phrase": ATTESTATION, "assessment_rule": profile_us["assessment_rule"],
                "notes": {"SEC-ARCH-22": "BIA consistency check: pilot scope"}, "controls": [live_ctl[c] for c in LCIDS]}
for c in ("SEC-ARCH-07", "SEC-ARCH-17"): assert live_ctl[c] == CTL[c], "copied verbatim"
L_KEYS = {"S2": ["arch-v2", "run-v1"], "S4": ["arch-v3", "run-v1"]}
def judge_live(snap, cid):
    a = "arch-v2" if snap == "S2" else "arch-v3"; c = lambda n: f"{cid}.{n}"
    if cid == "SEC-ARCH-07": return {c(1): (a, "07w")} if snap == "S4" else {c(1): (a, "07"), c(2): (a, "07aes"), c(3): (a, "07"), c(4): (a, "07"), c(5): (a, "07")}
    if cid == "SEC-ARCH-17": return {c(1): (a, "17"), c(2): (a, "17"), c(3): (a, "17")}
    return {c(1): (a, "22"), c(2): (a, "22")} if snap == "S2" else {c(1): ("run-v1", "22"), c(2): ("run-v1", "22")}
LS = Scenario(LV, LCIDS, live_ctl, L_KEYS, {"S2": "2026-10-07T13:00:05Z", "S4": "LIVE"}, {"S2": "reviewed baseline", "S4": "live v3 upload"}, judge_live, profile_live["profile_version"])
LS.observe("seed", "S2", ["run-v1", "arch-v2"])
LS.evaluate("seed", "S2", "2026-10-07T13:00:31Z")
LS.completed("seed", "S2", "2026-10-07T13:00:40Z", attempts=1)
LS.project("seed", "S2", "2026-10-07T13:00:41Z")
LS.L.add("2026-10-07T15:00:00Z", "seed", "S2", "arb_decision_recorded", human(ALVAREZ), decision=PROJECT["arb_decision"])
for i, (cid, who, vts) in enumerate([("SEC-ARCH-17", DANA, "2026-10-07T15:46:31Z"), ("SEC-ARCH-22", DANA, "2026-10-07T15:52:08Z"), ("SEC-ARCH-07", PRIYA, "2026-10-08T10:32:00Z")]):
    LS.record_disposition(vts, "seed", "S2", cid, who, "verified", ATTESTATION,
                          {"channel": "Box task", "task_id": f"box-task-7712{i:04d}", "assignment_id": f"box-asgn-8812{i:04d}", "resolution_state": "approved", "completed_at": vts, "ingested_at": tick(vts, 21),
                           "note": "seed: review task creation events elided"})
LS.project("seed", "S2", "2026-10-08T10:32:30Z")
lprior = {c: copy.deepcopy(LS.prior_ver[c]) for c in LCIDS}
LS.observe("live_v3", "S4", ["arch-v3"])
lhints = LS.diff_hints("S2", "S4")
LFIND = {c: FIND[c] for c in LCIDS}
lw7 = LV.locate("arch-v3", Q["07w"])
LBASIS = {"SEC-ARCH-07": ["Verified quote from architecture.md v2 §4.3 ¶1 not found in v3 after normalization.",
                          f"Encryption is still stated at §4.3 ¶{lw7['paragraph']}; 1 of 5 required clauses supported. The key model and rotation clauses have no support.",
                          "2 files in the snapshot searched for customer-managed keys: 0 candidates."],
          "SEC-ARCH-22": ["Verified quote from architecture.md v2 §4.6 not found in v3 after normalization.",
                          "The same statement matched verbatim in runbook.md §3; 2 of 2 required clauses supported.",
                          "The runbook quote already existed at the reviewed baseline, so the binding moved from architecture.md v2 to runbook.md and the support did not."]}
lr4 = LS.evaluate("live_v3", "S4", "LIVE", basis_for=LBASIS, extra_for={c: {"finding_id": LFIND[c]} for c in LCIDS})
assert {c: (lr4[c]["ma"], lr4[c]["cc"]) for c in LCIDS} == {"SEC-ARCH-07": ("evidence_weakened", "weakened"), "SEC-ARCH-22": ("evidence_found", "moved"), "SEC-ARCH-17": ("evidence_found", "unchanged")}
LS.staleness("live_v3", "S4", "LIVE", lr4)
LS.completed("live_v3", "S4", "LIVE", attempts=1, quotes_validated="3 of 3")
ldisp_before = {c: LS.display(c) for c in LCIDS}
LMETA = LS.project("live_v3", "S4", "LIVE")
LTASK_A = {**TASK_A, "finding_id": LFIND["SEC-ARCH-07"],
           "message": f"{LFIND['SEC-ARCH-07']} (snapshot S4): SEC-ARCH-07 needs review. Encryption is still stated in architecture.md v3 §4.3, but the key model and rotation have no support. Priya Natarajan verified the v2 sentence on 2026-10-08."}
LS.L.add("LIVE", "live_v3", "S4", "box_task_created", APP, control_id="SEC-ARCH-07", finding_id=LFIND["SEC-ARCH-07"], task=LTASK_A,
         server_mapping={"task_id": LTASK_A["task_id"], "assignment_id": LTASK_A["assignment_id"], "finding_id": LFIND["SEC-ARCH-07"], "control_id": "SEC-ARCH-07", "snapshot_id": "S4", "immutable": True})
LDANA = "Encrypted is stated; the key model and rotation are not. Requirement IS-STD-014 §5.1 needs the KMS CMK statement restored."
LS.L.add("LIVE", "live_v3", "S4", "box_task_response_ingested", APP, control_id="SEC-ARCH-07", finding_id=LFIND["SEC-ARCH-07"],
         response={"task_id": LTASK_A["task_id"], "assignment_id": LTASK_A["assignment_id"], "resolution_state": "rejected", "message": LDANA, "completed_at": "LIVE", "ingested_at": "LIVE"},
         reviewer_identity=box_identity(DANA), mapped_action="returned_to_author")
LTASK_B = {**TASK_B, "finding_id": LFIND["SEC-ARCH-07"], "message": f"Returned by Dana Okafor (ARB reviewer): \"{LDANA}\" Lost from architecture.md §4.3 in v3: \"{Q['07']}\""}
LS.L.add("LIVE", "live_v3", "S4", "box_task_created", APP, control_id="SEC-ARCH-07", finding_id=LFIND["SEC-ARCH-07"], task=LTASK_B,
         lost_clauses=[c["clause"] for c in LS.state["SEC-ARCH-07"]["clauses"] if c["support"] == "unsupported"],
         server_mapping={"task_id": LTASK_B["task_id"], "assignment_id": LTASK_B["assignment_id"], "finding_id": LFIND["SEC-ARCH-07"], "control_id": "SEC-ARCH-07", "snapshot_id": "S4", "immutable": True})
LS.record_disposition("LIVE", "live_v3", "S4", "SEC-ARCH-07", DANA, "returned_to_author", LDANA,
                      {"channel": "Box task", "task_id": LTASK_A["task_id"], "assignment_id": LTASK_A["assignment_id"], "resolution_state": "rejected"},
                      finding_id=LFIND["SEC-ARCH-07"], due_at=LTASK_B["due_at"], author_task_id=LTASK_B["task_id"], recorded_after="author task created successfully")
ldisp_after = {c: LS.display(c) for c in LCIDS}
LS.project("live_v3", "S4", "LIVE")
LS.L.verify()
assert ldisp_before["SEC-ARCH-07"][1] == "Needs review: key-management evidence missing"
lfindings = make_findings(LS, lr4, LFIND, lprior, "S4", ldisp_before, ldisp_after,
                          {"SEC-ARCH-07": "Return to author: restore the KMS customer-managed key and rotation statement (IS-STD-014 §5.1).",
                           "SEC-ARCH-22": "Acknowledge the new binding: confirm runbook.md §3 as the evidence of record.", "SEC-ARCH-17": "None. The prior verification holds."})
lledger = {"folderId": FOLDER_ID, "folderName": "Project Lantern - ARB package (live slice)", **PROJECT, "control_profile": "profile-live", "control_profile_version": profile_live["profile_version"],
           "append_only": True, "live_timestamp_placeholder": "LIVE",
           "chain": {"algorithm": ledger["chain"]["algorithm"], "genesis": "0" * 64, "head": LS.L.events[-1]["chain_hash"], "note": "Events with ts LIVE are re-chained by the app when the real timestamp is known."},
           "population": LS.L.population(), "events": LS.L.events}
lexpected = {**PROJECT, "snapshot_id": "S4", "prior_snapshot_id": "S2", "control_profile_version": profile_live["profile_version"], "trigger": expected["trigger"],
             "summary": {"controls_evaluated": 3, "evidence_found": 2, "evidence_weakened": 1, "change_classification": {"weakened": 1, "moved": 1, "unchanged": 1},
                         "displayed_counts_before": counts(ldisp_before), "displayed_counts_after": counts(ldisp_after)},
             "prior_quote_diff_hints": lhints, "box_tasks": {"A_review_SEC_ARCH_07": LTASK_A["task_id"], "B_author_remediation": LTASK_B["task_id"]},
             "human_actions_expected": [{"control_id": "SEC-ARCH-07", "actor": "Dana Okafor", "task": LTASK_A["task_id"], "resolution": "rejected", "disposition": "returned_to_author", "message": LDANA, "author_task": LTASK_B["task_id"], "due_at": LTASK_B["due_at"]}],
             "findings": lfindings}
ltr = build_trace(LS, "S4", "S2", LCIDS, lr4, lprior, lhints, ["arch-v3", "run-v1"], "2 files", LMETA,
                  ("Box task A created for Dana Okafor (review)", LTASK_A), 3600, 5900, 1240, "Findings applied: 3", [220, 610, 60, 40, 30, 30, 450, 390])
assert 11500 <= ltr.t <= 12500, ltr.t
ltrace = {"run_id": "run-live-slice", "mode_label": "Live", "snapshot_id": "S4", "prior_snapshot_id": "S2", "started_at": "LIVE", "total_duration_ms": ltr.t,
          "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE, "mrm_model_id": MRM_MODEL_ID, "steps": ltr.steps}

# ============================================================ write
def write(path, obj):
    s = json.dumps(obj, indent=2, ensure_ascii=False); low = s.lower()
    for bad in BANNED: assert bad not in low, (path, bad)
    with open(path, "w") as fh: fh.write(s + "\n")
for name, obj in [("profile-us-bank.json", profile_us), ("profile-eu.json", profile_eu), ("snapshots.json", {"folderId": FOLDER_ID, **PROJECT, "snapshots": list(FS.snapshots.values())}),
                  ("ledger.json", ledger), ("expected-findings.json", expected), ("agent-trace.json", trace_full)]:
    write(P(name), obj)
for name, obj in [("profile-live.json", profile_live), ("snapshots.json", {"folderId": FOLDER_ID, **PROJECT, "snapshots": list(LS.snapshots.values())}), ("ledger.json", lledger),
                  ("expected-findings.json", lexpected), ("agent-trace.json", ltrace)]:
    write(os.path.join(SL, name), obj)
print(f"full: {len(L.events)} events, trace {tr.t} ms, display before {counts(display_before)}, after {counts(display_after)}")
print(f"live: {len(LS.L.events)} events, trace {ltr.t} ms, display before {counts(ldisp_before)}, after {counts(ldisp_after)}")
print("hints full:", [(h['control_id'], h['status']) for h in hints if h['status'] != 'present'], "| live:", [(h['control_id'], h['status']) for h in lhints if h['status'] != 'present'])

"""Generate the Lantern demo fixtures.

Full fixture (demo-data/lantern/): profile-us-bank.json, profile-eu.json, snapshots.json, ledger.json,
expected-findings.json, agent-trace.json.
Live slice (demo-data/lantern/live-slice/): profile-live.json, snapshots.json, ledger.json,
expected-findings.json, agent-trace.json, plus copies of the three source documents.

Every quote is located (section, paragraph, page) and checked against its pinned file version.
Content hashes are real SHA-256 digests. Run: python3 -I scripts/gen.py demo-data/lantern
"""
import sys, json, hashlib, re, copy, shutil, os
from datetime import datetime, timedelta

D = sys.argv[1]
SL = os.path.join(D, "live-slice")
def txt(path): return open(path).read()
def sha(s, n=64): return "sha256:" + hashlib.sha256(s.encode()).hexdigest()[:n]
def norm(s):  # whitespace, quotes, hyphens, case
    s = s.replace("`", "").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("‐", "-").replace("‑", "-").replace("–", "-").replace("—", "-")
    return " ".join(s.split()).strip().lower()
NORMALIZATION = "whitespace, quotes, hyphens, case"
MODEL_ID = "anthropic.claude-sonnet-4-6"
INFERENCE_PROFILE = "us.anthropic.claude-sonnet-4-6"
PROMPT_VERSION = "v3"
PROMPT_HASH = sha("keel/evaluate-snapshot/prompt/v3", 16)
MRM_MODEL_ID = "MRM-AI-0271"
PROFILE_VERSION = "2026.3"
FOLDER_ID = "318840021"
PROJECT = {"project": "Project Lantern: Customer Support AI Assistant", "application_id": "APM-20417", "application_tier": "Tier 1",
           "regulatory_scope": "NPI (GLBA)", "arb_decision": {"id": "ARB-2026-0338", "outcome": "approved with conditions", "date": "2026-10-07", "chair": "R. Alvarez"}}
BANNED = ("satisfied", "regressed", "confidence", "haiku", "accept risk", "risk_accepted", "proposed_satisfied")
def tick(ts, s):
    if ts == "LIVE": return "LIVE"
    return (datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ") + timedelta(seconds=s)).strftime("%Y-%m-%dT%H:%M:%SZ")
def deep_link(file_id=None, version_id=None):
    return f"https://app.box.com/file/{file_id}?version={version_id}" if file_id else f"https://app.box.com/folder/{FOLDER_ID}"

# ============================================================ documents and versions
F = {"arch": ("1650233401", "architecture.md"), "dfc": ("1650233402", "data-flow-and-classification.md"),
     "run": ("1650233403", "runbook.md"), "ven": ("1650233404", "vendor-contract-summary.md"),
     "ase": ("1650233405", "approved-services-and-exceptions.md")}
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
        return {"fileId": v["fileId"], "fileName": v["fileName"], "versionId": v["versionId"], "section": loc["section"], "page": loc["page"],
                "quote": q, "box_deep_link": deep_link(v["fileId"], v["versionId"])}

FULL = Versions()
P = lambda n: os.path.join(D, n)
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
 "20ven": "Corvid Systems (ticketing software, self-hosted), TPRM-2026-0412, inherent risk Tier 2, assessment current to 2027-03.",
 "22": "Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1.",
 "22b": "AWS Backup copies the table and bucket daily to the backup vault in account `mtb-backup-prod`, same Region, with 35-day retention and Vault Lock in compliance mode, so backups cannot be deleted or shortened by anyone in the Lantern accounts.",
 "22arch_b": "Backups are copied daily to a vault-locked AWS Backup vault in the separate account `mtb-backup-prod`.",
}
LOST_07 = ["AWS KMS customer-managed keys", "rotated annually", "key custodians are the Card Servicing Platform leads", "AES-256"]

# headline invariants (the demo depends on these)
a2, a3, rb = FULL.text("arch-v2"), FULL.text("arch-v3"), FULL.text("run-v2")
assert a2.count(Q["07"]) == 1 and a3.count(Q["07"]) == 0
assert a2.count(Q["22"]) == 1 and a3.count(Q["22"]) == 0 and rb.count(Q["22"]) == 1 and FULL.text("run-v1").count(Q["22"]) == 1
assert "TLS 1.2" in a2 and "TLS 1.2" in a3, "TLS is no longer weakened in v3"
assert "encrypt" in norm(Q["07w"])
OTHERS = ["dfc-v1", "run-v2", "ven-v1", "ase-v1"]
for k in OTHERS:
    assert "customer-managed keys" not in norm(FULL.text(k)), k
assert [k for k in OTHERS if "rto" in re.findall(r"[a-z]+", norm(FULL.text(k)))] == ["run-v2"]
assert "rto" not in re.findall(r"[a-z]+", norm(a3))
# acceptance fixture (fixtures/README.md)
assert norm("Lantern uses no third-party processors outside Meridian's AWS accounts.") in norm(a3)
assert norm("to Halcyon Support Services, Austin TX") in norm(txt(P("fixtures/vendor-contract-summary-contradiction.md")))
assert "halcyon" not in norm(FULL.text("ven-v1"))

# ============================================================ profiles
ILL = "illustrative; not reviewed by a compliance owner"
MATERIALITY = {"Critical": "acknowledge_on_evidencing_file_change", "High": "hold_if_unchanged", "Medium": "hold_if_unchanged"}
us_controls = [
 {"id": "SEC-ARCH-01", "title": "Approved services only",
  "requirement": "Every cloud service and third-party component named in the design must be on the Approved Cloud Services Catalog, or the package must reference an approved exception by id. The package must contain a list of services and components with their catalog status. A component named in the design but missing from the list is a finding.",
  "standard": "IS-STD-009 Approved Technology v3.1 §4.2",
  "applicability": "Applies to every new application and material change. Not applicable only to documentation-only changes with no deployed component.",
  "evidence": ["approved-services-and-exceptions.md (service list and exception table)", "Architecture document §3.1"],
  "tier": "Medium", "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk",
  "required_clauses": ["every cloud service and component is listed", "catalog status or exception id is given for each item"],
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["12.5.1"], "nist_csf_2_0": ["ID.AM-01", "ID.AM-02"], "ffiec_is_booklet": ["II.C.5 Inventory and classification of assets"], "iso_27001_2022_annex_a": ["A.5.9", "A.5.23"], "glba_occ": ["OCC Bulletin 2023-17"]}},
 {"id": "SEC-ARCH-02", "title": "Data classification and regulatory scope per data store",
  "requirement": "Every data store must carry a classification label under IS-STD-003: Public, Internal, Confidential or Restricted. Stores holding nonpublic personal information must be flagged NPI (GLBA). If payment card data could be present, the design must state the PCI DSS scope boundary.",
  "standard": "IS-STD-003 Data Classification v5.0 §3",
  "applicability": "Applies whenever the application stores or processes data. Not applicable only to stateless components that hold no data at rest.",
  "evidence": ["data-flow-and-classification.md §3", "Architecture document §3.2"],
  "tier": "High", "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk",
  "required_clauses": ["classification label given per data store", "NPI (GLBA) stores flagged", "PCI DSS scope boundary stated"],
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["12.5.2"], "nist_csf_2_0": ["ID.AM-07", "PR.DS-01"], "ffiec_is_booklet": ["II.C.5 Inventory and classification of assets"], "iso_27001_2022_annex_a": ["A.5.12", "A.5.13"], "glba_occ": ["Interagency Guidelines Establishing Information Security Standards (12 CFR 30, App. B)"]}},
 {"id": "SEC-ARCH-04", "title": "Authentication and MFA via enterprise IdP",
  "requirement": "All human access, for users and administrators, must authenticate through the enterprise IdP. Multi-factor authentication is required, and it must be phishing-resistant for privileged and remote access. The application must not keep local user accounts.",
  "standard": "IS-STD-011 Identity and Authentication v4.0 §2.3",
  "applicability": "Applies to every component with a human access path. Not applicable to components reached only by workload identities.",
  "evidence": ["Architecture document, authentication section"],
  "tier": "Medium", "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk",
  "required_clauses": ["authentication through the enterprise IdP", "phishing-resistant MFA required", "no local user accounts"],
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["8.3.1", "8.4.2"], "nist_csf_2_0": ["PR.AA-01", "PR.AA-03"], "ffiec_is_booklet": ["II.C.15 Access management"], "iso_27001_2022_annex_a": ["A.5.17", "A.8.5"], "glba_occ": ["FFIEC Authentication and Access to Financial Institution Services and Systems (2021)"]}},
 {"id": "SEC-ARCH-05", "title": "Least privilege, PAM, no shared admin, break-glass named",
  "requirement": "Access must use named roles scoped to specific resources. Privileged access must be brokered through the enterprise PAM vault, and there must be no shared administrator account. A break-glass path must be named, require two-person approval, and expire.",
  "standard": "IS-STD-012 Privileged Access v2.4 §3.1",
  "applicability": "Applies to every application with production accounts or administrative interfaces.",
  "evidence": ["Architecture document, privileged access section and role table"],
  "tier": "High", "reviewer_role": "ARB reviewer, Technology Resilience and Operations",
  "required_clauses": ["named roles scoped to resources", "privileged access brokered through PAM", "no shared administrator account", "break-glass named with two-person approval and expiry"],
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["7.2.1", "7.2.2", "8.2.2", "8.6.1"], "nist_csf_2_0": ["PR.AA-05"], "ffiec_is_booklet": ["II.C.15 Access management"], "iso_27001_2022_annex_a": ["A.5.15", "A.5.18", "A.8.2"], "glba_occ": ["12 CFR 30, App. B, III.C.1(a)"]}},
 {"id": "SEC-ARCH-07", "title": "Encryption at rest and key management",
  "requirement": "All customer data at rest must be encrypted with AES-256. Keys must be AWS KMS customer-managed keys or held in CipherTrust Manager; provider-managed or default keys do not meet this requirement. Keys must rotate at least annually, and the key custodians must be named.",
  "standard": "IS-STD-014 Cryptography v4.2 §5.1",
  "applicability": "Applies to every data store holding Confidential or Restricted data. Not applicable only if the classification document shows no such data at rest.",
  "evidence": ["Architecture document, encryption at rest and key management section"],
  "tier": "Critical", "reviewer_role": "ARB reviewer, Security Architecture",
  "required_clauses": ["encryption at rest stated", "AES-256 stated", "key management model stated (AWS KMS customer-managed keys or CipherTrust)", "rotation period stated (at least annually)", "key custodians named"],
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["3.5.1", "3.6.1", "3.7.4"], "nist_csf_2_0": ["PR.DS-01"], "ffiec_is_booklet": ["II.C.19 Encryption"], "iso_27001_2022_annex_a": ["A.8.24"], "glba_occ": ["12 CFR 30, App. B, III.C.1(c)"]}},
 {"id": "SEC-ARCH-17", "title": "Security events to enterprise SIEM (Splunk)",
  "requirement": "Security events from control plane, network flow, application audit and model invocation sources must be forwarded to the enterprise SIEM (Splunk). Retention must follow IS-STD-021. A named team must own the alerts raised on these events.",
  "standard": "IS-STD-021 Security Logging and Monitoring v3.0 §4",
  "applicability": "Applies to every production application.",
  "evidence": ["Architecture document, logging and monitoring section", "Runbook, monitoring and alerting"],
  "tier": "High", "reviewer_role": "ARB reviewer, Technology Resilience and Operations",
  "required_clauses": ["security event sources forwarded to Splunk", "retention per IS-STD-021", "alert owner named"],
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["10.2.1", "10.4.1", "10.5.1"], "nist_csf_2_0": ["DE.CM-01", "DE.AE-02"], "ffiec_is_booklet": ["II.C.22 Log management"], "iso_27001_2022_annex_a": ["A.8.15", "A.8.16"], "glba_occ": ["12 CFR 30, App. B, III.C.1(f)"]}},
 {"id": "SEC-ARCH-20", "title": "Third parties named with TPRM assessment id and inherent risk tier",
  "requirement": "Every third party or sub-processor in the design must be named and must carry a TPRM assessment id and an inherent risk tier. Each assessment must be current on the date of review.",
  "standard": "IS-STD-019 Third-Party Risk Management v2.0 §3.4",
  "applicability": "Applies whenever the design uses a third party or sub-processor. Not applicable only if the design states that no third party is used and no document in the package names one.",
  "evidence": ["Architecture document, third-party dependencies section", "vendor-contract-summary.md"],
  "tier": "Medium", "reviewer_role": "ARB reviewer, Data Governance and Third-Party Risk",
  "required_clauses": ["each third party named", "TPRM assessment id given", "inherent risk tier given", "assessment current"],
  "framework_map": {"status": ILL, "glba_occ": ["OCC Bulletin 2023-17 (third-party relationships)"], "ffiec_is_booklet": ["FFIEC Outsourcing Technology Services Booklet"], "iso_27001_2022_annex_a": ["A.5.19", "A.5.20"], "nist_csf_2_0": ["GV.SC-04", "GV.SC-07"]}},
 {"id": "SEC-ARCH-22", "title": "RTO/RPO consistent with BIA tier, rollback path, immutable backups",
  "requirement": "The package must state RTO and RPO, and both must be consistent with the application's BIA tier. A rollback path for deployments must be described. Backups must be immutable, for example held in a vault-locked backup vault. Evidence may be in the architecture document or the runbook.",
  "standard": "IS-STD-030 Resilience and Recovery v2.2 §3",
  "applicability": "Applies to every production application with a BIA tier.",
  "evidence": ["Architecture document, resilience section", "runbook.md §2 to §4"],
  "tier": "High", "reviewer_role": "ARB reviewer, Technology Resilience and Operations",
  "required_clauses": ["RTO and RPO stated", "consistent with BIA tier", "rollback path described", "backups immutable"],
  "framework_map": {"status": ILL, "pci_dss_4_0_1": ["12.10.1"], "nist_csf_2_0": ["PR.DS-11", "RC.RP-01"], "ffiec_is_booklet": ["FFIEC Business Continuity Management Booklet"], "iso_27001_2022_annex_a": ["A.5.30", "A.8.13"], "glba_occ": ["Interagency Paper on Sound Practices to Strengthen Operational Resilience (2020)"]}},
]
FIELDS = ["id", "title", "requirement", "standard", "applicability", "evidence", "tier", "framework_map", "reviewer_role", "required_clauses"]
for c in us_controls: assert list(c) == ["id", "title", "requirement", "standard", "applicability", "evidence", "tier", "reviewer_role", "required_clauses", "framework_map"] or set(c) == set(FIELDS)
TIERS = {"SEC-ARCH-07": "Critical", "SEC-ARCH-02": "High", "SEC-ARCH-05": "High", "SEC-ARCH-17": "High", "SEC-ARCH-22": "High",
         "SEC-ARCH-01": "Medium", "SEC-ARCH-04": "Medium", "SEC-ARCH-20": "Medium"}
for c in us_controls: assert c["tier"] == TIERS[c["id"]]
profile_us = {"profile_id": "profile-us-bank", "profile_version": PROFILE_VERSION, "default": True,
  "name": "Meridian Trust Bank ARB design review, US", "fields": FIELDS,
  "handed_to_model": ["requirement", "applicability", "evidence", "required_clauses"], "materiality": MATERIALITY,
  "severity_rule": "control tier x application tier",
  "out_of_profile": ["network diagram currency (images)", "contract clause matching (contracts live in the legal system)", "bare retention numbers (banks cite a Records Retention Schedule class)"],
  "controls": [{k: c[k] for k in FIELDS} for c in us_controls]}
CTL = {c["id"]: c for c in us_controls}
CIDS = [c["id"] for c in us_controls]

eu_rows = [
 ("EU-C1", "Encryption at rest and key management", "Critical", "All customer data at rest must be encrypted, and the design must state the key model: customer-managed or provider-managed keys, where they are held, and the rotation period. Vague statements such as 'industry-standard encryption' do not meet this requirement.", "MTB-EU-STD-07 Cryptography §3", {"gdpr": ["Art. 32(1)(a)"], "dora": ["Art. 9(2)", "RTS 2024/1774 Art. 6-7"], "iso_27001_2022_annex_a": ["A.8.24"], "nist_800_53": ["SC-28", "SC-12"]}, "Security Architecture", ["encryption at rest stated", "key model stated", "rotation period stated"]),
 ("EU-C2", "Encryption in transit", "High", "All network connections carrying customer data must be encrypted, with the minimum TLS version stated as a number.", "MTB-EU-STD-07 Cryptography §4", {"gdpr": ["Art. 32(1)(a)"], "dora": ["Art. 9(4)(d)"], "iso_27001_2022_annex_a": ["A.8.20", "A.8.24"], "nist_800_53": ["SC-8"]}, "Security Architecture", ["all connections encrypted", "minimum TLS version stated"]),
 ("EU-C3", "Data residency and processing region", "Critical", "The processing and storage region must be stated for every data store and processor. The design must state whether any personal data is transferred outside the EEA, and the transfer mechanism if so.", "MTB-EU-STD-02 Data Location §2", {"gdpr": ["Art. 44", "Art. 46"], "dora": ["Art. 28(3)", "Art. 28(9)"], "iso_27001_2022_annex_a": ["A.5.34"]}, "Privacy Office", ["region per data store", "region per processor", "transfer statement"]),
 ("EU-C4", "Personal data inventory", "High", "Personal data must be inventoried by category, the data subjects must be named, and the document must state whether special category data is processed.", "MTB-EU-STD-03 Records of Processing §1", {"gdpr": ["Art. 30(1)(c)", "Art. 35(7)(a)", "Art. 9"], "iso_27001_2022_annex_a": ["A.5.34"]}, "Privacy Office", ["data categories listed", "data subjects named", "special category flag stated"]),
 ("EU-C5", "Retention and deletion", "High", "A retention period must be stated as a number with a unit, and a deletion mechanism such as a job, lifecycle rule or TTL must be described.", "MTB-EU-STD-04 Retention §2", {"gdpr": ["Art. 5(1)(e)", "Art. 17"], "iso_27001_2022_annex_a": ["A.8.10"]}, "Privacy Office", ["numeric retention period", "deletion mechanism named"]),
 ("EU-C6", "Processors and sub-processors", "Critical", "Every processor and sub-processor that can access personal data must be listed in the design, and the list must match the processing agreements in the package.", "MTB-EU-STD-05 Third Parties §3", {"gdpr": ["Art. 28(2)", "Art. 28(4)"], "dora": ["Art. 28(3)", "Art. 30"], "iso_27001_2022_annex_a": ["A.5.19", "A.5.20", "A.5.21"]}, "Privacy Office", ["processors listed or none stated", "list matches agreements in the package"]),
 ("EU-C7", "Network segmentation and trust boundaries", "High", "Network segmentation must be described, trust boundaries shown, and every inbound path and the internet egress posture stated.", "MTB-EU-STD-08 Network §2", {"dora": ["Art. 9(4)(b)"], "iso_27001_2022_annex_a": ["A.8.20", "A.8.22"], "nist_800_53": ["SC-7"]}, "Security Architecture", ["segmentation described", "inbound paths stated", "egress posture stated"]),
 ("EU-C8", "Least-privilege access", "Critical", "Access must use named roles scoped to specific resources. There must be no shared administrator account, and human access to production data must not be standing.", "MTB-EU-STD-09 Access §2", {"dora": ["Art. 9(4)(c)"], "iso_27001_2022_annex_a": ["A.5.15", "A.5.18", "A.8.2"], "nist_800_53": ["AC-6"]}, "Security Architecture", ["named scoped roles", "no shared admin", "no standing human data access"]),
 ("EU-C9", "Security logging and monitoring", "High", "Security events must be logged to a protected location, with a numeric retention period and a description of alerting and its routing.", "MTB-EU-STD-10 Logging §3", {"dora": ["Art. 10"], "iso_27001_2022_annex_a": ["A.8.15", "A.8.16"], "nist_800_53": ["AU-2", "AU-11"]}, "Technology Resilience", ["security event sources logged", "numeric retention", "alert routing"]),
 ("EU-C10", "Rollback and recovery", "Medium", "A rollback plan for deployments must exist, and RTO and RPO must be stated as numbers.", "MTB-EU-STD-11 Continuity §2", {"dora": ["Art. 11", "Art. 12"], "iso_27001_2022_annex_a": ["A.5.30", "A.8.13"], "nist_800_53": ["CP-2", "CP-10"]}, "Technology Resilience", ["rollback plan described", "RTO stated", "RPO stated"]),
]
profile_eu = {"profile_id": "profile-eu", "profile_version": "2026.1-eu", "default": False, "name": "Meridian group EU design review (GDPR, DORA), alternate",
  "fields": FIELDS, "handed_to_model": profile_us["handed_to_model"], "materiality": MATERIALITY,
  "controls": [{"id": i, "title": t, "requirement": r, "standard": s,
                "applicability": "Applies when the application processes personal data of EU or EEA data subjects or supports an EU entity's ICT services.",
                "evidence": ["Architecture document", "Data flow document", "Processing agreements in the package"] if i in ("EU-C3", "EU-C4", "EU-C5", "EU-C6") else ["Architecture document", "Runbook"],
                "tier": tier, "framework_map": {"status": ILL, **fm}, "reviewer_role": "ARB reviewer, " + role, "required_clauses": rc}
               for i, t, tier, r, s, fm, role, rc in eu_rows]}

# ============================================================ ledger helper
class Ledger:
    def __init__(self): self.events = []; self.prev = "0" * 64
    def add(self, ts, phase, snap, etype, actor, **kw):
        e = {"event_id": f"EVT-{len(self.events)+1:04d}", "ts": ts, "phase": phase, "snapshot_id": snap, "control_id": kw.pop("control_id", None),
             "event_type": etype, "machine_assessment": kw.pop("machine_assessment", None), "prior_machine_assessment": kw.pop("prior_machine_assessment", None),
             "change_classification": kw.pop("change_classification", None), "human_disposition": kw.pop("human_disposition", None), "actor": actor,
             "fileId": kw.pop("fileId", None), "fileName": kw.pop("fileName", None), "versionId": kw.pop("versionId", None), "contentHash": kw.pop("contentHash", None),
             "quote": kw.pop("quote", None), "basis": kw.pop("basis", None), "prompt_hash": kw.pop("prompt_hash", None),
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
        seen_live = False
        for e in self.events:
            if e["ts"] == "LIVE": seen_live = True
            else: assert not seen_live, "dated event after LIVE events"
    def population(self):
        t = [e["event_type"] for e in self.events]
        return {"revisions_observed": t.count("file_version_observed"), "snapshots": t.count("snapshot_captured"), "evaluations_run": t.count("evaluation_completed"),
                "control_evaluations": t.count("control_evaluated"), "evaluation_errors": t.count("evaluation_error"),
                "verification_holds": t.count("verification_holds"), "binding_changes": t.count("binding_changed"),
                "box_tasks_created": t.count("box_task_created"), "human_actions": t.count("human_disposition_recorded")}

PRIYA = {"type": "human", "name": "Priya Natarajan", "role": "Principal Security Architect, ARB reviewer", "box_user_id": "30118802", "box_login": "priya.natarajan@meridiantrust.example"}
MARCUS = {"type": "human", "name": "Marcus Hale", "role": "Data Governance and Third-Party Risk Lead, ARB reviewer", "box_user_id": "30118803", "box_login": "marcus.hale@meridiantrust.example"}
DANA = {"type": "human", "name": "Dana Okafor", "role": "ARB reviewer, Technology Resilience", "box_user_id": "30118804", "box_login": "dana.okafor@meridiantrust.example"}
ALVAREZ = {"type": "human", "name": "R. Alvarez", "role": "ARB chair", "box_user_id": "30118801"}
JPARK = {"name": "J. Park (Eng)", "box_user_id": "30118811", "box_login": "j.park@meridiantrust.example"}
AGENT = {"type": "agent", "name": "keel-evaluator", "role": "machine assessment", "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE}
APP = {"type": "app", "name": "keel", "role": "snapshot, validation and projection"}
def box_identity(p): return {"box_user_id": p["box_user_id"], "login": p["box_login"], "name": p["name"], "source": "identity as returned by Box (task assignment resolved_by)"}

def snapshot_manifest(sid, ts, label, vers, keys):
    files = [{x: vers[k][x] for x in ("fileId", "fileName", "versionId", "contentHash")} for k in keys]
    body = {"snapshot_id": sid, "captured_at": ts, "control_profile_version": PROFILE_VERSION, "files": files}
    return {**body, "era": label, "manifest_hash": sha(json.dumps(body, sort_keys=True))}

def clause_support(vers, cid, mapping):
    out = []
    for clause in CTL[cid]["required_clauses"]:
        ref = mapping.get(clause)
        if ref:
            k, q = ref; assert vers.present(k, Q[q]); out.append({"clause": clause, "support": "supported", "quote": vers.ev(k, Q[q])})
        else:
            out.append({"clause": clause, "support": "unsupported", "quote": None})
    assert [c["clause"] for c in out] == CTL[cid]["required_clauses"]
    return out

def hold_note(tier, file_changed):
    rule = MATERIALITY[tier]
    if rule == "hold_if_unchanged":
        return ("evidencing file version changed; cited quote unchanged; tier %s holds without acknowledgment" % tier) if file_changed else \
               ("evidencing file version unchanged; cited quote unchanged; tier %s holds without acknowledgment" % tier)
    return "evidencing file version changed; tier Critical requires acknowledgment"

# ============================================================ FULL FIXTURE
SNAP_KEYS = {"S1": ["arch-v1", "dfc-v1", "run-v1", "ven-v1", "ase-v1"], "S2": ["arch-v2", "dfc-v1", "run-v1", "ven-v1", "ase-v1"],
             "S3": ["arch-v2", "dfc-v1", "run-v2", "ven-v1", "ase-v1"], "S4": ["arch-v3", "dfc-v1", "run-v2", "ven-v1", "ase-v1"]}
SNAP_TS = {"S1": "2026-10-03T15:00:12Z", "S2": "2026-10-07T13:00:05Z", "S3": "2026-10-12T14:20:44Z", "S4": "2026-10-17T15:30:04Z"}
SNAP_ERA = {"S1": "baseline v1", "S2": "verified package v2", "S3": "runbook minor edit", "S4": "v3 upload"}
snapshots = [snapshot_manifest(s, SNAP_TS[s], SNAP_ERA[s], FULL, SNAP_KEYS[s]) for s in ("S1", "S2", "S3", "S4")]
SNAP = {s["snapshot_id"]: s for s in snapshots}
def vk(snap, f): return [k for k in SNAP_KEYS[snap] if FULL[k]["fileId"] == F[f][0]][0]

# primary evidence (file, quote) and clause mapping per control, by snapshot
def primary(snap, cid):
    a = vk(snap, "arch")
    return {"SEC-ARCH-01": [(vk(snap, "ase"), "01")], "SEC-ARCH-02": [(a, "02")], "SEC-ARCH-04": [(a, "04")], "SEC-ARCH-05": [(a, "05")],
            "SEC-ARCH-07": [(a, "07")], "SEC-ARCH-17": [(a, "17")], "SEC-ARCH-20": [(a, "20"), (vk(snap, "ven"), "20ven")],
            "SEC-ARCH-22": [(a, "22"), (vk(snap, "run"), "22")]}[cid]
def clauses_full(snap, cid):
    a, r = vk(snap, "arch"), vk(snap, "run")
    m = {"SEC-ARCH-01": {"every cloud service and component is listed": (vk(snap, "ase"), "01"), "catalog status or exception id is given for each item": (a, "01x")},
         "SEC-ARCH-02": {"classification label given per data store": (vk(snap, "dfc"), "02dfc"), "NPI (GLBA) stores flagged": (a, "02"), "PCI DSS scope boundary stated": (a, "02")},
         "SEC-ARCH-04": {c: (a, "04") for c in CTL["SEC-ARCH-04"]["required_clauses"]},
         "SEC-ARCH-05": {"named roles scoped to resources": (a, "05roles"), "privileged access brokered through PAM": (a, "05"), "no shared administrator account": (a, "05"), "break-glass named with two-person approval and expiry": (a, "05")},
         "SEC-ARCH-07": {"encryption at rest stated": (a, "07"), "AES-256 stated": (a, "07aes"), "key management model stated (AWS KMS customer-managed keys or CipherTrust)": (a, "07"), "rotation period stated (at least annually)": (a, "07"), "key custodians named": (a, "07")},
         "SEC-ARCH-17": {c: (a, "17") for c in CTL["SEC-ARCH-17"]["required_clauses"]},
         "SEC-ARCH-20": {c: (a, "20") for c in CTL["SEC-ARCH-20"]["required_clauses"]},
         "SEC-ARCH-22": {"RTO and RPO stated": (r, "22"), "consistent with BIA tier": (r, "22"), "rollback path described": (r, "22"), "backups immutable": (r, "22b")}}[cid]
    if snap == "S4":
        if cid == "SEC-ARCH-07": m = {"encryption at rest stated": (a, "07w")}
    return m

L = Ledger()
assess = {c: None for c in CIDS}
disp = {c: {"value": "unreviewed"} for c in CIDS}
verified = {}
def observe(phase, snap, keys):
    for k in keys:
        v = FULL[k]
        L.add(v["uploadedAt"], phase, snap, "file_version_observed", {"type": "human" if " " in v["uploadedBy"] else "service", "name": v["uploadedBy"], "role": "uploader"},
              fileId=v["fileId"], fileName=v["fileName"], versionId=v["versionId"], contentHash=v["contentHash"],
              **({"version_comment": v["versionComment"], "confluence_editor": v["confluenceEditor"], "jira": v["jira"]} if "versionComment" in v else {}))
    s = SNAP[snap]
    L.add(s["captured_at"], phase, snap, "snapshot_captured", APP, manifest_hash=s["manifest_hash"], control_profile_version=PROFILE_VERSION,
          files=[{"fileName": f["fileName"], "versionId": f["versionId"], "contentHash": f["contentHash"]} for f in s["files"]])
def ctl_event(ts, phase, snap, cid, ma, cc, evid, basis, **extra):
    first = evid[0] if evid else None
    e = L.add(ts, phase, snap, "control_evaluated", AGENT, control_id=cid, machine_assessment=ma, prior_machine_assessment=assess[cid], change_classification=cc,
              human_disposition=disp[cid]["value"], fileId=first and first["fileId"], fileName=first and first["fileName"], versionId=first and first["versionId"],
              contentHash=first and FULL[FULL.by_vid(first["versionId"])]["contentHash"], quote=first and first["quote"], basis=basis, evidence=evid,
              prompt_hash=PROMPT_HASH, model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION,
              disposition_snapshot_id=disp[cid].get("snapshot_id"), projection={"box_metadata": "ok"}, **extra)
    assess[cid] = ma; return e
def completed(ts, phase, snap, outcomes, errors=0, **extra):
    L.add(ts, phase, snap, "evaluation_completed", AGENT, prompt_hash=PROMPT_HASH, model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION,
          controls_evaluated=len(outcomes), evaluation_errors=errors, outcomes=outcomes, projection={"box_metadata": "ok"}, **extra)
def folder_meta(ts, phase, snap, last_review):
    fields = {"keel_snapshot_id": snap}
    for c in CIDS:
        fields["keel_status_" + c.replace("-", "_")] = f"{assess[c]} / {disp[c]['value']}" + (f"@{disp[c]['snapshot_id']}" if disp[c].get("snapshot_id") else "")
    fields["keel_last_human_review"] = last_review
    L.add(ts, phase, snap, "box_metadata_written", APP, target={"type": "folder", "id": FOLDER_ID, "template": "keelReview"}, fields_written=fields, projection={"box_metadata": "ok"})
    return fields

# ---- S1 baseline (one temporary read error, downgrade to not_evaluated, retry)
observe("seed", "S1", SNAP_KEYS["S1"])
S1_PLAN = {
 "SEC-ARCH-01": ("evidence_found", ["Retry after the file became readable.", "Service list names every AWS service and component with catalog status.", "One exception referenced (EXC-2026-0117) with expiry."]),
 "SEC-ARCH-02": ("evidence_found", ["Classification and NPI (GLBA) flag stated for all three customer data stores.", "PCI DSS scope boundary stated."]),
 "SEC-ARCH-04": ("evidence_absent", ["No enterprise IdP or MFA statement in the snapshot.", "§4.1 reuses the agent console session; engineer authentication is 'to be confirmed'.", "4 other files searched: 0 candidates."]),
 "SEC-ARCH-05": ("evidence_absent", ["No PAM, no break-glass role, no statement on shared admin.", "§4.2 gives engineers a standing production role (LanternEngineer).", "4 other files searched: 0 candidates."]),
 "SEC-ARCH-07": ("evidence_weakened", ["Encryption at rest is stated at §4.3 ¶1.", "No AES-256, key model, rotation period or custodian; key model deferred to CRYPTO-OPS.", "4 other files searched for a key model: 0 candidates."]),
 "SEC-ARCH-17": ("evidence_absent", ["Application logs go to CloudWatch Logs; no SIEM forwarding, retention standard or alert owner.", "4 other files searched: 0 candidates."]),
 "SEC-ARCH-20": ("evidence_found", ["Both third parties named with TPRM id, inherent risk tier and assessment date in §7.", "Matches vendor-contract-summary.md."]),
 "SEC-ARCH-22": ("evidence_found", ["RTO, RPO and rollback window stated in runbook.md §3; consistent with BIA Tier 1.", "Vault-locked backups stated in runbook.md §4."]),
}
S1_EVID = {"SEC-ARCH-01": [("ase-v1", "01")], "SEC-ARCH-02": [("arch-v1", "02")], "SEC-ARCH-04": [], "SEC-ARCH-05": [], "SEC-ARCH-07": [("arch-v1", "07v1")],
           "SEC-ARCH-17": [], "SEC-ARCH-20": [("arch-v1", "20"), ("ven-v1", "20ven")], "SEC-ARCH-22": [("run-v1", "22")]}
ts = "2026-10-03T15:00:40Z"
err = L.add(ts, "seed", "S1", "evaluation_error", APP, control_id="SEC-ARCH-01", machine_assessment="not_evaluated", prior_machine_assessment=None,
            human_disposition="unreviewed", fileId=FULL["ase-v1"]["fileId"], fileName=FULL["ase-v1"]["fileName"], versionId=FULL["ase-v1"]["versionId"],
            contentHash=FULL["ase-v1"]["contentHash"], error={"code": "TEXT_REPRESENTATION_NOT_READY", "message": "Box text representation still processing after upload (HTTP 202). File temporarily unreadable."},
            basis=["Downgrade example: the required evidence file could not be read, so the finding is not_evaluated rather than a quote-less positive.", "Retry scheduled in 4 minutes."],
            projection={"box_metadata": "ok"})
assess["SEC-ARCH-01"] = "not_evaluated"
outcomes = []
for i, cid in enumerate(CIDS):
    ma, basis = S1_PLAN[cid]
    if cid == "SEC-ARCH-01": outcomes.append({"control_id": cid, "machine_assessment": "not_evaluated", "change_classification": None}); continue
    ctl_event(tick(ts, i + 1), "seed", "S1", cid, ma, None, [FULL.ev(k, Q[q]) for k, q in S1_EVID[cid]], basis)
    outcomes.append({"control_id": cid, "machine_assessment": ma, "change_classification": None})
ctl_event(tick(ts, 240), "seed", "S1", "SEC-ARCH-01", "evidence_found", None, [FULL.ev("ase-v1", Q["01"])], S1_PLAN["SEC-ARCH-01"][1], retry_of=err["event_id"])
outcomes[0] = {"control_id": "SEC-ARCH-01", "machine_assessment": "evidence_found", "change_classification": None, "after_retry": True}
completed(tick(ts, 250), "seed", "S1", outcomes, errors=1)
folder_meta(tick(ts, 251), "seed", "S1", None)

# ---- S2 verified package
observe("seed", "S2", ["arch-v2"])
ts = "2026-10-07T13:00:31Z"; outcomes = []
S2_BASIS = {"SEC-ARCH-04": ["New in v2 at §4.1 ¶1: enterprise IdP, phishing-resistant MFA, no local accounts."],
            "SEC-ARCH-05": ["New in v2 at §4.2 ¶1: PAM vault, no shared admin, named break-glass with two-person approval and expiry."],
            "SEC-ARCH-07": ["The v1 statement is replaced at §4.3 ¶1 by customer-managed KMS keys, annual rotation and named custodians.", "AES-256 stated at §4.3 ¶2."],
            "SEC-ARCH-17": ["New in v2 at §6 ¶1: Splunk forwarding, IS-STD-021 retention, SOC as alert owner."]}
for i, cid in enumerate(CIDS):
    new = cid in S2_BASIS
    cc = None if new else "unchanged"
    basis = S2_BASIS.get(cid, ["Prior quote matched after normalization."] + (["Same statement now also in architecture.md v2 §4.6."] if cid == "SEC-ARCH-22" else []))
    ctl_event(tick(ts, i), "seed", "S2", cid, "evidence_found", cc, [FULL.ev(k, Q[q]) for k, q in primary("S2", cid)], basis)
    outcomes.append({"control_id": cid, "machine_assessment": "evidence_found", "change_classification": cc})
completed(tick(ts, 9), "seed", "S2", outcomes)
folder_meta(tick(ts, 10), "seed", "S2", None)
L.add("2026-10-07T15:00:00Z", "seed", "S2", "arb_decision_recorded", ALVAREZ, decision=PROJECT["arb_decision"],
      conditions=["Confirm the two approved Bedrock model ids with Model Risk Management by 20 Oct 2026.", "Load test at 2x expected peak by 23 Oct 2026."])
VERIFY = [("SEC-ARCH-05", DANA, "2026-10-07T15:40:12Z"), ("SEC-ARCH-17", DANA, "2026-10-07T15:46:31Z"), ("SEC-ARCH-22", DANA, "2026-10-07T15:52:08Z"),
          ("SEC-ARCH-01", MARCUS, "2026-10-08T09:05:44Z"), ("SEC-ARCH-02", MARCUS, "2026-10-08T09:11:20Z"), ("SEC-ARCH-04", MARCUS, "2026-10-08T09:16:02Z"),
          ("SEC-ARCH-20", MARCUS, "2026-10-08T09:22:47Z"), ("SEC-ARCH-07", PRIYA, "2026-10-08T10:32:00Z")]
last_review = None
for cid, who, vts in VERIFY:
    evid = [FULL.ev(k, Q[q]) for k, q in primary("S2", cid)]
    verified[cid] = [{**x, "verified_by": who["name"], "verified_role": who["role"], "verified_at": vts} for x in evid]
    disp[cid] = {"value": "verified", "snapshot_id": "S2", "by": who["name"], "role": who["role"], "at": vts, "binding": evid[0]}
    L.add(vts, "seed", "S2", "human_disposition_recorded", {k: who[k] for k in ("type", "name", "role", "box_user_id")}, control_id=cid,
          machine_assessment=assess[cid], human_disposition="verified", fileId=evid[0]["fileId"], fileName=evid[0]["fileName"], versionId=evid[0]["versionId"],
          contentHash=FULL[FULL.by_vid(evid[0]["versionId"])]["contentHash"], quote=evid[0]["quote"], via={"channel": "Keel finding card"},
          comment="Verified against the quoted version.", reviewer_identity=box_identity(who),
          freshness_check={"decision_snapshot_id": "S2", "current_snapshot_id": "S2", "result": "pass"}, projection={"box_metadata": "ok"})
    last_review = vts

# ---- S3 runbook minor edit: nothing changes, still recorded
observe("seed", "S3", ["run-v2"])
ts = "2026-10-12T14:21:09Z"; outcomes = []
for i, cid in enumerate(CIDS):
    ctl_event(tick(ts, i), "seed", "S3", cid, "evidence_found", "unchanged", [FULL.ev(k, Q[q]) for k, q in primary("S3", cid)],
              ["Prior quote matched after normalization.", "The only changed file, runbook.md v2, edits the escalation contact."])
    outcomes.append({"control_id": cid, "machine_assessment": "evidence_found", "change_classification": "unchanged"})
L.add(tick(ts, 8), "seed", "S3", "verification_holds", AGENT, control_id="SEC-ARCH-22", machine_assessment="evidence_found", change_classification="unchanged",
      human_disposition="verified", prior_verification={k: disp["SEC-ARCH-22"][k] for k in ("by", "role", "at", "snapshot_id")},
      fileId=FULL["run-v2"]["fileId"], fileName="runbook.md", versionId=FULL["run-v2"]["versionId"], contentHash=FULL["run-v2"]["contentHash"], quote=Q["22"],
      note="supporting file version changed (runbook.md v1 to v2); cited quote unchanged; selected binding (architecture.md v2) unchanged; tier High holds without acknowledgment")
completed(tick(ts, 9), "seed", "S3", outcomes)
folder_meta(tick(ts, 10), "seed", "S3", last_review)

# ---- S4 v3 upload (live)
FIND = {c: f"KEEL-2026-04{i+1:02d}" for i, c in enumerate(CIDS)}
w7 = FULL.locate("arch-v3", Q["07w"]); p7 = FULL.locate("arch-v2", Q["07"]); p22 = FULL.locate("arch-v2", Q["22"])
CHANGED_43 = [("Each data store has its own AES-256 key: `lantern-s3-snapshots`, `lantern-ddb-state`, `lantern-aoss-index` and `lantern-logs`.", "Each store is logically isolated with its own encryption context."),
              ("Key policies grant `kms:Decrypt` only to the service roles in 4.2.", "The ability to decrypt is restricted to the service roles described in 4.2."),
              ("Key administration is held by CRYPTO-OPS and is separated from key usage. Scheduling a key for deletion requires a 30-day waiting period and a change ticket approved by CRYPTO-OPS.", "Key lifecycle operations are governed by CRYPTO-OPS in line with Meridian's cryptographic standard.")]
for old, new in CHANGED_43:
    assert FULL.present("arch-v2", old) and not FULL.present("arch-v3", old) and FULL.present("arch-v3", new) and FULL.locate("arch-v3", new)["section"].startswith("§4.3")
others_names = [FULL[k]["fileName"] for k in OTHERS]
def finding(cid, ma, cc, evid, basis, action, display, cs):
    d = disp[cid]
    return {"finding_id": FIND[cid], "control_id": cid, "control_title": CTL[cid]["title"], "tier": CTL[cid]["tier"], "materiality": MATERIALITY[CTL[cid]["tier"]],
            "snapshot_id": "S4", "machine_assessment": ma, "change_classification": cc, "basis": basis, "evidence": evid, "clause_support": cs,
            "prior_evidence": verified[cid], "human_disposition_at_evaluation": {"value": d["value"], "snapshot_id": d["snapshot_id"], "by": d["by"], "role": d["role"], "at": d["at"]},
            "expected_display": display, "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE, "prompt_version": PROMPT_VERSION, "prompt_hash": PROMPT_HASH,
            "mrm_model_id": MRM_MODEL_ID, "normalization": NORMALIZATION, "box_deep_link": f"https://app.box.com/folder/{FOLDER_ID}?keel_finding={FIND[cid]}",
            "suggested_action": action}
S4 = {}
S4["SEC-ARCH-07"] = finding("SEC-ARCH-07", "evidence_weakened", "weakened", [FULL.ev("arch-v3", Q["07w"])],
  [f"Verified quote from architecture.md v2 {p7['section']} ¶{p7['paragraph']} not found in v3 after normalization ({NORMALIZATION}).",
   f"Encryption is still stated at {w7['section'].split(' ')[0]} ¶{w7['paragraph']}, but AES-256, the key model, the rotation period and the custodians have no support in the snapshot.",
   f"{len(OTHERS)} other files searched for customer-managed keys, CipherTrust, rotation and key custodians: 0 candidates.",
   f"{len(CHANGED_43)} other assertions changed in {w7['section'].split(' ')[0]}."],
  "Return to author: restore the AWS KMS customer-managed key, annual rotation and custodian statement in §4.3 (IS-STD-014 §5.1). Verify stays unavailable until each required clause has a supporting quote in a current file.",
  "Needs review: key-management evidence missing", clause_support(FULL, "SEC-ARCH-07", clauses_full("S4", "SEC-ARCH-07")))
S4["SEC-ARCH-22"] = finding("SEC-ARCH-22", "evidence_found", "moved", [FULL.ev("run-v2", Q["22"])],
  [f"Verified quote from architecture.md v2 {p22['section']} ¶{p22['paragraph']} not found in v3 after normalization.",
   "The same statement matched verbatim in runbook.md v2 §3 Deployment and rollback.",
   "The runbook quote already existed before v3 (runbook.md v1 and v2), so support did not move; the selected evidence binding moved from architecture.md to runbook.md.",
   "Vault-locked backups still stated in runbook.md v2 §4 and architecture.md v3 §4.6."],
  "Acknowledge the new binding (low-effort review): confirm runbook.md v2 §3 as the evidence of record.",
  "Verified, stale: evidence moved, re-review due", clause_support(FULL, "SEC-ARCH-22", clauses_full("S4", "SEC-ARCH-22")))
for cid in ["SEC-ARCH-01", "SEC-ARCH-02", "SEC-ARCH-04", "SEC-ARCH-05", "SEC-ARCH-17", "SEC-ARCH-20"]:
    refs = primary("S4", cid); k, q = refs[0]; loc = FULL.locate(k, Q[q])
    file_changed = FULL[k]["versionId"] != verified[cid][0]["versionId"]
    S4[cid] = finding(cid, "evidence_found", "unchanged", [FULL.ev(k, Q[q])],
      [f"Verified quote matched after normalization in {FULL[k]['fileName']} {FULL[k]['versionLabel']} {loc['section']}.",
       ("The evidencing file has a new version; the cited quote is unchanged." if file_changed else "The evidencing file version is unchanged."),
       "Each required clause has a supporting quote in the snapshot.",
       hold_note(CTL[cid]["tier"], file_changed).capitalize() + "."],
      "None. The prior verification holds for this snapshot.", "Verified", clause_support(FULL, cid, clauses_full("S4", cid)))
findings = [S4[c] for c in CIDS]
q_checked = []
for fd in findings:
    for x in fd["evidence"]:
        k = FULL.by_vid(x["versionId"]); assert k in SNAP_KEYS["S4"] and FULL.present(k, x["quote"]); q_checked.append(fd["control_id"])
    for x in fd["prior_evidence"]: assert FULL.present(FULL.by_vid(x["versionId"]), x["quote"])
    for c in fd["clause_support"]:
        if c["quote"]: assert FULL.by_vid(c["quote"]["versionId"]) in SNAP_KEYS["S4"]
assert len(q_checked) == 8
assert sum(1 for c in S4["SEC-ARCH-07"]["clause_support"] if c["support"] == "supported") == 1

observe("live_v3", "S4", ["arch-v3"])
ts = "2026-10-17T15:30:16Z"
for cid in CIDS:
    fd = S4[cid]
    ctl_event(ts, "live_v3", "S4", cid, fd["machine_assessment"], fd["change_classification"], fd["evidence"], fd["basis"], finding_id=fd["finding_id"],
              clause_support=fd["clause_support"], **({"prior_verification": {k: disp[cid][k] for k in ("by", "role", "at", "snapshot_id")}} if cid == "SEC-ARCH-07" else {}))
for cid in ["SEC-ARCH-01", "SEC-ARCH-02", "SEC-ARCH-04", "SEC-ARCH-05", "SEC-ARCH-17", "SEC-ARCH-20"]:
    fd = S4[cid]; x = fd["evidence"][0]
    L.add(ts, "live_v3", "S4", "verification_holds", AGENT, control_id=cid, machine_assessment="evidence_found", change_classification="unchanged",
          human_disposition="verified", prior_verification={k: disp[cid][k] for k in ("by", "role", "at", "snapshot_id")}, finding_id=fd["finding_id"],
          fileId=x["fileId"], fileName=x["fileName"], versionId=x["versionId"], contentHash=FULL[FULL.by_vid(x["versionId"])]["contentHash"], quote=x["quote"],
          note=hold_note(CTL[cid]["tier"], x["versionId"] != verified[cid][0]["versionId"]))
x = S4["SEC-ARCH-22"]["evidence"][0]
L.add(ts, "live_v3", "S4", "binding_changed", AGENT, control_id="SEC-ARCH-22", machine_assessment="evidence_found", change_classification="moved", human_disposition="verified",
      prior_verification={k: disp["SEC-ARCH-22"][k] for k in ("by", "role", "at", "snapshot_id")}, finding_id=FIND["SEC-ARCH-22"],
      fileId=x["fileId"], fileName=x["fileName"], versionId=x["versionId"], contentHash=FULL[FULL.by_vid(x["versionId"])]["contentHash"], quote=x["quote"],
      previous_binding=verified["SEC-ARCH-22"][0], acknowledgment={"required": True, "severity": "Low"},
      note="selected binding moved from architecture.md v2 to runbook.md v2; the runbook quote pre-existed, so support did not move")
completed(tick(ts, 0), "live_v3", "S4", [{"control_id": c, "machine_assessment": S4[c]["machine_assessment"], "change_classification": S4[c]["change_classification"]} for c in CIDS],
          quotes_validated="8 of 8")
S4_META = folder_meta(tick(ts, 1), "live_v3", "S4", last_review)
TASK_A = {"task_id": "box-task-77120931", "kind": "review", "fileId": F["arch"][0], "assignee": "Dana Okafor", "assignee_box_user_id": DANA["box_user_id"],
          "finding_id": FIND["SEC-ARCH-07"], "snapshot_id": "S4", "due_at": "2026-10-20T17:00:00Z",
          "message": f"{FIND['SEC-ARCH-07']} (snapshot S4): SEC-ARCH-07 Encryption at rest needs review. Encryption is still stated in architecture.md v3 §4.3, but the key model, rotation period, custodians and AES-256 have no support. Priya Natarajan verified the v2 sentence on 2026-10-08. Related: SEC-ARCH-22 evidence moved to runbook.md."}
L.add(tick(ts, 2), "live_v3", "S4", "box_task_created", APP, control_id="SEC-ARCH-07", finding_id=FIND["SEC-ARCH-07"], task=TASK_A, projection={"box_metadata": "n/a"})
DANA_REASON = "Encrypted is stated; the key model and rotation are not. IS-STD-014 §5.1 requires the KMS CMK statement restored."
disp["SEC-ARCH-07"] = {**disp["SEC-ARCH-07"], "value": "returned_to_author", "snapshot_id": "S4"}
L.add("2026-10-17T15:33:40Z", "live_v3", "S4", "human_disposition_recorded", {k: DANA[k] for k in ("type", "name", "role", "box_user_id")}, control_id="SEC-ARCH-07",
      machine_assessment="evidence_weakened", human_disposition="returned_to_author", finding_id=FIND["SEC-ARCH-07"],
      via={"channel": "Box task", "task_id": TASK_A["task_id"], "resolution_state": "completed"}, comment=DANA_REASON,
      reviewer_identity=box_identity(DANA), freshness_check={"decision_snapshot_id": "S4", "current_snapshot_id": "S4", "result": "pass"}, projection={"box_metadata": "ok"})
TASK_B = {"task_id": "box-task-77120944", "kind": "author_remediation", "fileId": F["arch"][0], "assignee": JPARK["name"], "assignee_box_user_id": JPARK["box_user_id"],
          "finding_id": FIND["SEC-ARCH-07"], "snapshot_id": "S4", "due_at": "2026-10-23T17:00:00Z", "jira": "LAN-2291", "created_by": "keel (after reviewer response)",
          "message": f"Returned by Dana Okafor (ARB reviewer): \"{DANA_REASON}\" Lost from architecture.md §4.3 in v3: \"{Q['07']}\" and \"{Q['07aes']}\" Restore them or cite where the key model is now documented."}
L.add("2026-10-17T15:33:41Z", "live_v3", "S4", "box_task_created", APP, control_id="SEC-ARCH-07", finding_id=FIND["SEC-ARCH-07"], task=TASK_B,
      lost_clauses=[c["clause"] for c in S4["SEC-ARCH-07"]["clause_support"] if c["support"] == "unsupported"], projection={"box_metadata": "n/a"})
x = S4["SEC-ARCH-22"]["evidence"][0]
disp["SEC-ARCH-22"] = {"value": "verified", "snapshot_id": "S4", "by": DANA["name"], "role": DANA["role"], "at": "2026-10-17T15:34:12Z", "binding": x}
L.add("2026-10-17T15:34:12Z", "live_v3", "S4", "human_disposition_recorded", {k: DANA[k] for k in ("type", "name", "role", "box_user_id")}, control_id="SEC-ARCH-22",
      machine_assessment="evidence_found", change_classification="moved", human_disposition="verified", finding_id=FIND["SEC-ARCH-22"],
      fileId=x["fileId"], fileName=x["fileName"], versionId=x["versionId"], contentHash=FULL[FULL.by_vid(x["versionId"])]["contentHash"], quote=x["quote"],
      via={"channel": "Keel finding card", "action": "acknowledge binding change"}, comment="Recovery targets present in runbook §3; binding updated.",
      acknowledgment_duration_s=30, reviewer_identity=box_identity(DANA),
      freshness_check={"decision_snapshot_id": "S4", "current_snapshot_id": "S4", "result": "pass"}, projection={"box_metadata": "ok"})
folder_meta("2026-10-17T15:34:13Z", "live_v3", "S4", "2026-10-17T15:34:12Z")
L.verify()
ledger = {"folderId": FOLDER_ID, "folderName": "Project Lantern - ARB package", **PROJECT, "control_profile": "profile-us-bank", "control_profile_version": PROFILE_VERSION,
          "append_only": True, "scope": "All observed revisions and outcomes, including evaluations that changed nothing and evaluations that failed.",
          "staleness_rule": "Keyed to the evidence binding, not the snapshot. See profile materiality.",
          "chain": {"algorithm": "sha256(previous chain_hash + canonical JSON of event without chain_hash)", "genesis": "0" * 64, "head": L.events[-1]["chain_hash"]},
          "population": L.population(), "phases": {"seed": "Before the demo: S1 to S3, the ARB decision and the verifications.", "live_v3": "Produced on stage by the v3 upload (S4) and the reviewer's actions."},
          "events": L.events}
expected = {**PROJECT, "snapshot_id": "S4", "prior_snapshot_id": "S3", "manifest_hash": SNAP["S4"]["manifest_hash"], "control_profile_version": PROFILE_VERSION,
  "trigger": {"fileId": F["arch"][0], "fileName": F["arch"][1], "fromVersionId": FULL["arch-v2"]["versionId"], "toVersionId": FULL["arch-v3"]["versionId"], "uploadedBy": "svc-confluence-export", **V3_META},
  "summary": {"controls_evaluated": 8, "evidence_found": 7, "evidence_weakened": 1, "evidence_absent": 0, "evidence_contradicted": 0, "not_evaluated": 0,
              "change_classification": {"unchanged": 6, "weakened": 1, "moved": 1}, "verification_holds": 6, "binding_changed": 1},
  "removed_from_v2": [Q["07"], Q["07aes"], Q["22"]],
  "human_actions_expected": [{"control_id": "SEC-ARCH-07", "actor": "Dana Okafor", "disposition": "returned_to_author", "task_a": TASK_A["task_id"], "task_b": TASK_B["task_id"], "task_b_due": TASK_B["due_at"], "message": DANA_REASON},
                             {"control_id": "SEC-ARCH-22", "actor": "Dana Okafor", "disposition": "verified", "binding": "runbook.md v2", "message": "Recovery targets present in runbook §3; binding updated."}],
  "findings": findings}
cnt = {}
for fd in findings: cnt[fd["machine_assessment"]] = cnt.get(fd["machine_assessment"], 0) + 1
assert cnt == {"evidence_found": 7, "evidence_weakened": 1}

# ============================================================ traces (shared)
ANCHORS = {"SEC-ARCH-07": ["encrypt", "customer-managed", "rotated", "custodian", "AES-256", "CipherTrust"], "SEC-ARCH-22": ["RTO", "RPO", "roll back"]}
def sentences(s):
    out = []
    for para in s.split("\n\n"):
        lines = [l for l in para.split("\n") if l.strip() and not l.lstrip().startswith(("#", "|", "```"))]
        if lines: out += [" ".join(x.split()) for x in re.split(r"(?<=[.])\s+(?=[A-Z*`])", " ".join(lines)) if len(x) > 20]
    return out
def diff_prior(vers, prior_by_cid, new_key_for_file):
    rows = []
    for cid, items in prior_by_cid.items():
        for x in items:
            k_old = vers.by_vid(x["versionId"]); k_new = new_key_for_file(x["fileId"])
            if vers.present(k_new, x["quote"]): continue
            had = [a for a in ANCHORS.get(cid, []) if a.lower() in x["quote"].lower()]
            cands = [s for s in sentences(vers.text(k_new)) if not vers.present(k_old, s)]
            keep = [(s, [a for a in had if a.lower() in s.lower()]) for s in cands]
            keep = [z for z in keep if z[1]]
            if keep:
                s, kept = max(keep, key=lambda z: len(z[1])); status = "weakened"
            else:
                s, kept, status = None, [], "removed"
            rows.append({"control_id": cid, "file": x["fileName"], "quote": x["quote"], "status": status, "anchor_terms_in_prior_quote": had,
                         "anchor_terms_kept": kept, "anchor_terms_lost": [a for a in had if a not in kept], "replacement_sentence": s})
    added = [s for s in sentences(vers.text(new_key_for_file(F["arch"][0]))) if not vers.present(vers.by_vid(prior_by_cid["SEC-ARCH-07"][0]["versionId"]), s)]
    return rows, added
class Trace:
    def __init__(self): self.steps = []; self.t = 0
    def step(self, source, kind, label, ms, **kw):
        self.steps.append({"seq": len(self.steps) + 1, "source": source, "startMs": self.t, "durationMs": ms, "kind": kind, "label": label, **kw}); self.t += ms
def agent_substeps(t0, vers, snap, ctl_ids, prior_by_cid, others_keys, n_files, read_ms, write_ms, out_tokens):
    sub, st = [], t0
    def s(kind, label, ms, **kw):
        nonlocal st; sub.append({"source": "agent", "kind": kind, "label": label, "startMs": st, "durationMs": ms, **kw}); st += ms
    s("model_turn", f"Reading requirement, applicability, evidence and required clauses for {len(ctl_ids)} controls with {n_files} file texts", read_ms)
    for c in ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-17"]:
        if c in prior_by_cid:
            pe = prior_by_cid[c][0]
            s("tool_call", f"get_prior_evidence({c})", 55, tool="get_prior_evidence", args={"control_id": c},
              result={"quote": pe["quote"], "fileName": pe["fileName"], "versionId": pe["versionId"], "verified_by": pe["verified_by"], "verified_at": pe["verified_at"]})
    hits = [vers[k]["fileName"] for k in others_keys if "customer-managed keys" in norm(vers.text(k))]
    s("tool_call", 'search_snapshot("customer-managed keys")', 140, tool="search_snapshot", args={"query": "customer-managed keys", "snapshot_id": snap},
      result={"files_searched": [vers[k]["fileName"] for k in others_keys], "match_count": len(hits), "matches": []})
    rto = [k for k in others_keys if "rto" in re.findall(r"[a-z]+", norm(vers.text(k)))]
    s("tool_call", 'search_snapshot("RTO")', 130, tool="search_snapshot", args={"query": "RTO", "snapshot_id": snap},
      result={"files_searched": [vers[k]["fileName"] for k in others_keys], "match_count": len(rto), "matches": [vers.ev(k, Q["22"]) for k in rto]})
    s("model_turn", f"Writing {len(ctl_ids)} typed findings with clause support", write_ms, output_tokens=out_tokens)
    assert not hits and [vers[k]["fileName"] for k in rto] == ["runbook.md"]
    return sub, st - t0

# ---- full trace
prior_full = {c: verified[c] for c in CIDS}
rows, added = diff_prior(FULL, {c: [verified[c][0]] for c in CIDS}, lambda fid: [k for k in SNAP_KEYS["S4"] if FULL[k]["fileId"] == fid][0])
assert sorted((r["control_id"], r["status"]) for r in rows) == [("SEC-ARCH-07", "weakened"), ("SEC-ARCH-22", "removed")], rows
v2s = sentences(a2); changed_n = len([s for s in v2s if not FULL.present("arch-v3", s)]) - len(rows)
tr = Trace(); s4 = SNAP["S4"]
tr.step("app", "snapshot_captured", "Snapshot S4 captured: 5 files, profile 2026.3", 240,
        detail={"snapshot_id": "S4", "manifest_hash": s4["manifest_hash"], "files": [{"fileName": f["fileName"], "versionId": f["versionId"], "contentHash": f["contentHash"]} for f in s4["files"]]})
tr.step("app", "texts_fetched", "Texts fetched by version: coverage 5 of 5 readable (architecture.md v3 downloaded, 4 from cache)", 720,
        detail={"coverage": "5 of 5", "downloaded": [{"fileName": "architecture.md", "versionId": FULL["arch-v3"]["versionId"], "bytes": FULL["arch-v3"]["bytes"]}],
                "cached": [{"fileName": FULL[k]["fileName"], "versionId": FULL[k]["versionId"]} for k in OTHERS]})
tr.step("app", "prior_quotes_diffed", f"Prior quotes diffed: 1 weakened, 1 removed, 0 added; {len(CIDS) - len(rows)} of {len(CIDS)} bound quotes unchanged; {len(added)} sentences reworded elsewhere", 80,
        detail={"prior_snapshot_id": "S3", "bound_quotes_checked": len(CIDS), "missing": rows, "added_bound_quotes": 0, "reworded_sentences": added,
                "note": "A missing quote is a reason for re-review and a hint to the evaluator, not a verdict."})
sub, ms = agent_substeps(tr.t, FULL, "S4", CIDS, prior_full, OTHERS, 5, 3900, 6700, 2610)
tr.step("agent", "agent_evaluation", "Agent evaluation: one Claude Sonnet 4.6 call, all 8 controls", ms, model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE,
        prompt_version=PROMPT_VERSION, prompt_hash=PROMPT_HASH, mrm_model_id=MRM_MODEL_ID,
        detail={"input_tokens": 18640, "output_tokens": 2610, "structured_output": "FindingSet (zod)", "substeps": sub,
                "result": {c: [S4[c]["machine_assessment"], S4[c]["change_classification"]] for c in CIDS}})
tr.step("app", "quotes_validated", "8 of 8 quotes matched; a failed match would set the finding to not_evaluated. Coverage complete.", 55,
        detail={"normalization": NORMALIZATION, "checked": [{"control_id": c, "match": True} for c in q_checked], "downgraded": []})
tr.step("app", "findings_applied", "Findings applied: 1 weakened, 1 binding moved, 6 holds", 40, detail={"finding_ids": [FIND[c] for c in CIDS]})
s4_ids = [e["event_id"] for e in L.events if e["snapshot_id"] == "S4" and e["event_type"] in ("control_evaluated", "verification_holds", "binding_changed", "evaluation_completed")]
tr.step("app", "ledger_events_written", f"Ledger events written: {len(s4_ids)} events, hash chain extended", 35,
        detail={"event_ids": s4_ids, "chain_head": [e for e in L.events if e["event_id"] == s4_ids[-1]][0]["chain_hash"]})
tr.step("app", "box_folder_metadata_written", "Box folder metadata written: keel_snapshot_id, 8 status fields, keel_last_human_review", 470, detail={"fields": S4_META, "outcome": "ok"})
tr.step("app", "box_task_created", "Box task A created for Dana Okafor (review)", 400, detail=TASK_A)
assert 12500 <= tr.t <= 13500, tr.t
trace_full = {"run_id": "run-20261017-153004-lantern", "mode_label": "Live", "snapshot_id": "S4", "prior_snapshot_id": "S3", "started_at": SNAP_TS["S4"],
              "total_duration_ms": tr.t, "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE, "mrm_model_id": MRM_MODEL_ID, "steps": tr.steps}

# ============================================================ LIVE SLICE
os.makedirs(SL, exist_ok=True)
shutil.copyfile(P("architecture-v2.md"), os.path.join(SL, "architecture-v2.md"))
shutil.copyfile(P("architecture-v3.md"), os.path.join(SL, "architecture-v3.md"))
shutil.copyfile(P("runbook-v1.md"), os.path.join(SL, "runbook.md"))  # runbook version current at the reviewed baseline
LV = Versions()
LV.add("arch-v2", "arch", "1801102232", "v2", "2026-10-07T12:58:31Z", "Kevin Lindqvist", os.path.join(SL, "architecture-v2.md"))
LV.add("run-v1", "run", "1801102251", "v1", "2026-10-03T14:53:40Z", "Kevin Lindqvist", os.path.join(SL, "runbook.md"))
LV.add("arch-v3", "arch", "1801102233", "v3", "LIVE", "svc-confluence-export", os.path.join(SL, "architecture-v3.md"), **V3_META)
LCIDS = ["SEC-ARCH-07", "SEC-ARCH-22", "SEC-ARCH-17"]
live_ctl = {c: copy.deepcopy({k: CTL[c][k] for k in FIELDS}) for c in LCIDS}
live_ctl["SEC-ARCH-22"]["requirement"] = "Recovery targets and rollback path are documented: the package states RTO and RPO and describes a rollback path for deployments. BIA consistency check: pilot scope."
live_ctl["SEC-ARCH-22"]["required_clauses"] = ["RTO and RPO stated", "rollback path described"]
live_ctl["SEC-ARCH-22"]["pilot_scope_note"] = "BIA consistency check: pilot scope"
profile_live = {"profile_id": "profile-live", "profile_version": PROFILE_VERSION + "-live", "derived_from": "profile-us-bank " + PROFILE_VERSION, "fields": FIELDS,
                "materiality": MATERIALITY, "controls": [live_ctl[c] for c in LCIDS]}
for c in ("SEC-ARCH-07", "SEC-ARCH-17"):
    assert {k: live_ctl[c][k] for k in FIELDS} == {k: CTL[c][k] for k in FIELDS}, "copied verbatim"
L_SNAP_KEYS = {"S2": ["arch-v2", "run-v1"], "S4": ["arch-v3", "run-v1"]}
def lmanifest(sid, ts, era):
    files = [{x: LV[k][x] for x in ("fileId", "fileName", "versionId", "contentHash")} for k in L_SNAP_KEYS[sid]]
    body = {"snapshot_id": sid, "captured_at": ts, "control_profile_version": profile_live["profile_version"], "files": files}
    return {**body, "era": era, "manifest_hash": sha(json.dumps(body, sort_keys=True))}
lsnaps = [lmanifest("S2", "2026-10-07T13:00:05Z", "reviewed baseline"), lmanifest("S4", "LIVE", "live v3 upload")]
LL = Ledger(); lassess = {c: None for c in LCIDS}; ldisp = {c: {"value": "unreviewed"} for c in LCIDS}; lver = {}
def lprimary(snap, cid):
    a = "arch-v2" if snap == "S2" else "arch-v3"
    return {"SEC-ARCH-07": [(a, "07" if snap == "S2" else "07w")], "SEC-ARCH-17": [(a, "17")], "SEC-ARCH-22": [("arch-v2", "22"), ("run-v1", "22")] if snap == "S2" else [("run-v1", "22")]}[cid]
def lclauses(snap, cid):
    a = "arch-v2" if snap == "S2" else "arch-v3"
    if cid == "SEC-ARCH-07":
        return {"encryption at rest stated": (a, "07w" if snap == "S4" else "07")} if snap == "S4" else {c: (a, "07aes" if c == "AES-256 stated" else "07") for c in live_ctl[cid]["required_clauses"]}
    if cid == "SEC-ARCH-17": return {c: (a, "17") for c in live_ctl[cid]["required_clauses"]}
    return {c: ("run-v1", "22") for c in live_ctl[cid]["required_clauses"]}
def lclause_support(cid, snap):
    m = lclauses(snap, cid); out = []
    for clause in live_ctl[cid]["required_clauses"]:
        if clause in m:
            k, q = m[clause]; out.append({"clause": clause, "support": "supported", "quote": LV.ev(k, Q[q])})
        else: out.append({"clause": clause, "support": "unsupported", "quote": None})
    return out
def lobserve(phase, snap, keys, ts_snap):
    for k in keys:
        v = LV[k]
        LL.add(v["uploadedAt"], phase, snap, "file_version_observed", {"type": "human" if " " in v["uploadedBy"] else "service", "name": v["uploadedBy"], "role": "uploader"},
               fileId=v["fileId"], fileName=v["fileName"], versionId=v["versionId"], contentHash=v["contentHash"],
               **({"version_comment": v["versionComment"], "confluence_editor": v["confluenceEditor"], "jira": v["jira"]} if "versionComment" in v else {}))
    m = [s for s in lsnaps if s["snapshot_id"] == snap][0]
    LL.add(ts_snap, phase, snap, "snapshot_captured", APP, manifest_hash=m["manifest_hash"], files=[{"fileName": f["fileName"], "versionId": f["versionId"], "contentHash": f["contentHash"]} for f in m["files"]])
def lctl(ts, phase, snap, cid, ma, cc, evid, basis, **extra):
    first = evid[0]
    LL.add(ts, phase, snap, "control_evaluated", AGENT, control_id=cid, machine_assessment=ma, prior_machine_assessment=lassess[cid], change_classification=cc,
           human_disposition=ldisp[cid]["value"], fileId=first["fileId"], fileName=first["fileName"], versionId=first["versionId"],
           contentHash=LV[LV.by_vid(first["versionId"])]["contentHash"], quote=first["quote"], basis=basis, evidence=evid, prompt_hash=PROMPT_HASH,
           model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION, projection={"box_metadata": "ok"}, **extra)
    lassess[cid] = ma
def lmeta(ts, phase, snap, last):
    f = {"keel_snapshot_id": snap, **{"keel_status_" + c.replace("-", "_"): f"{lassess[c]} / {ldisp[c]['value']}" + (f"@{ldisp[c]['snapshot_id']}" if ldisp[c].get("snapshot_id") else "") for c in LCIDS},
         "keel_last_human_review": last}
    LL.add(ts, phase, snap, "box_metadata_written", APP, target={"type": "folder", "id": FOLDER_ID, "template": "keelReview"}, fields_written=f, projection={"box_metadata": "ok"})
    return f
lobserve("seed", "S2", ["run-v1", "arch-v2"], "2026-10-07T13:00:05Z")
for i, cid in enumerate(LCIDS):
    lctl(tick("2026-10-07T13:00:31Z", i), "seed", "S2", cid, "evidence_found", None, [LV.ev(k, Q[q]) for k, q in lprimary("S2", cid)],
         ["Each required clause has a supporting quote in the snapshot."], clause_support=lclause_support(cid, "S2"))
LL.add("2026-10-07T13:00:40Z", "seed", "S2", "evaluation_completed", AGENT, controls_evaluated=3, evaluation_errors=0, prompt_hash=PROMPT_HASH, model_id=MODEL_ID,
       inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION, projection={"box_metadata": "ok"})
lmeta("2026-10-07T13:00:41Z", "seed", "S2", None)
LL.add("2026-10-07T15:00:00Z", "seed", "S2", "arb_decision_recorded", ALVAREZ, decision=PROJECT["arb_decision"])
LV_VER = sorted([("SEC-ARCH-17", DANA, "2026-10-07T15:46:31Z"), ("SEC-ARCH-22", DANA, "2026-10-07T15:52:08Z"), ("SEC-ARCH-07", PRIYA, "2026-10-08T10:32:00Z")], key=lambda z: z[2])
for cid, who, vts in LV_VER:
    evid = [LV.ev(k, Q[q]) for k, q in lprimary("S2", cid)]
    lver[cid] = [{**x, "verified_by": who["name"], "verified_role": who["role"], "verified_at": vts} for x in evid]
    ldisp[cid] = {"value": "verified", "snapshot_id": "S2", "by": who["name"], "role": who["role"], "at": vts}
    LL.add(vts, "seed", "S2", "human_disposition_recorded", {k: who[k] for k in ("type", "name", "role", "box_user_id")}, control_id=cid, machine_assessment="evidence_found",
           human_disposition="verified", fileId=evid[0]["fileId"], fileName=evid[0]["fileName"], versionId=evid[0]["versionId"],
           contentHash=LV[LV.by_vid(evid[0]["versionId"])]["contentHash"], quote=evid[0]["quote"], reviewer_identity=box_identity(who),
           freshness_check={"decision_snapshot_id": "S2", "current_snapshot_id": "S2", "result": "pass"}, projection={"box_metadata": "ok"})
LFIND = {"SEC-ARCH-07": "KEEL-2026-0405", "SEC-ARCH-22": "KEEL-2026-0408", "SEC-ARCH-17": "KEEL-2026-0406"}
lw7 = LV.locate("arch-v3", Q["07w"])
def lfinding(cid, ma, cc, evid, basis, display, action):
    d = ldisp[cid]
    return {"finding_id": LFIND[cid], "control_id": cid, "control_title": live_ctl[cid]["title"], "tier": live_ctl[cid]["tier"], "snapshot_id": "S4",
            "machine_assessment": ma, "change_classification": cc, "basis": basis, "evidence": evid, "clause_support": lclause_support(cid, "S4"),
            "prior_evidence": lver[cid], "human_disposition_at_evaluation": {"value": d["value"], "snapshot_id": d["snapshot_id"], "by": d["by"], "role": d["role"], "at": d["at"]},
            "expected_display": display, "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE, "prompt_version": PROMPT_VERSION, "prompt_hash": PROMPT_HASH,
            "mrm_model_id": MRM_MODEL_ID, "normalization": NORMALIZATION, "box_deep_link": f"https://app.box.com/folder/{FOLDER_ID}?keel_finding={LFIND[cid]}", "suggested_action": action}
LF = {
 "SEC-ARCH-07": lfinding("SEC-ARCH-07", "evidence_weakened", "weakened", [LV.ev("arch-v3", Q["07w"])],
   ["Verified quote from architecture.md v2 §4.3 ¶1 not found in v3 after normalization.",
    f"Encryption is still stated at §4.3 ¶{lw7['paragraph']}; the key model and rotation clauses have no support.",
    "2 files in the snapshot searched for customer-managed keys: 0 candidates."],
   "Needs review: key-management evidence missing", "Return to author: restore the KMS customer-managed key and rotation statement (IS-STD-014 §5.1)."),
 "SEC-ARCH-22": lfinding("SEC-ARCH-22", "evidence_found", "moved", [LV.ev("run-v1", Q["22"])],
   ["Verified quote from architecture.md v2 §4.6 not found in v3 after normalization.",
    "The same statement matched verbatim in runbook.md §3.",
    "The runbook quote already existed at the reviewed baseline, so support did not move; the selected evidence binding moved from architecture.md v2 to runbook.md."],
   "Verified, stale: evidence moved, re-review due", "Acknowledge the new binding: confirm runbook.md §3 as the evidence of record."),
 "SEC-ARCH-17": lfinding("SEC-ARCH-17", "evidence_found", "unchanged", [LV.ev("arch-v3", Q["17"])],
   ["Verified quote matched after normalization in architecture.md v3 §6.", "Each required clause has a supporting quote.", "Tier High holds without acknowledgment."],
   "Verified", "None."),
}
for fd in LF.values():
    for x in fd["evidence"]: assert LV.present(LV.by_vid(x["versionId"]), x["quote"])
assert [c["support"] for c in LF["SEC-ARCH-07"]["clause_support"]] == ["supported", "unsupported", "unsupported", "unsupported", "unsupported"]
lobserve("live_v3", "S4", ["arch-v3"], "LIVE")
for cid in LCIDS:
    fd = LF[cid]
    lctl("LIVE", "live_v3", "S4", cid, fd["machine_assessment"], fd["change_classification"], fd["evidence"], fd["basis"], finding_id=fd["finding_id"], clause_support=fd["clause_support"],
         **({"prior_verification": {k: ldisp[cid][k] for k in ("by", "role", "at", "snapshot_id")}} if cid == "SEC-ARCH-07" else {}))
x = LF["SEC-ARCH-17"]["evidence"][0]
LL.add("LIVE", "live_v3", "S4", "verification_holds", AGENT, control_id="SEC-ARCH-17", machine_assessment="evidence_found", change_classification="unchanged", human_disposition="verified",
       prior_verification={k: ldisp["SEC-ARCH-17"][k] for k in ("by", "role", "at", "snapshot_id")}, fileId=x["fileId"], fileName=x["fileName"], versionId=x["versionId"],
       contentHash=LV["arch-v3"]["contentHash"], quote=x["quote"], note=hold_note("High", True))
x = LF["SEC-ARCH-22"]["evidence"][0]
LL.add("LIVE", "live_v3", "S4", "binding_changed", AGENT, control_id="SEC-ARCH-22", machine_assessment="evidence_found", change_classification="moved", human_disposition="verified",
       prior_verification={k: ldisp["SEC-ARCH-22"][k] for k in ("by", "role", "at", "snapshot_id")}, previous_binding=lver["SEC-ARCH-22"][0], fileId=x["fileId"], fileName=x["fileName"],
       versionId=x["versionId"], contentHash=LV["run-v1"]["contentHash"], quote=x["quote"], acknowledgment={"required": True, "severity": "Low"},
       note="selected binding moved from architecture.md v2 to runbook.md; the runbook quote pre-existed, so support did not move")
LL.add("LIVE", "live_v3", "S4", "evaluation_completed", AGENT, controls_evaluated=3, evaluation_errors=0, quotes_validated="3 of 3", prompt_hash=PROMPT_HASH, model_id=MODEL_ID,
       inference_profile=INFERENCE_PROFILE, prompt_version=PROMPT_VERSION, projection={"box_metadata": "ok"})
LMETA = lmeta("LIVE", "live_v3", "S4", "2026-10-08T10:32:00Z")
LTASK_A = {**TASK_A, "finding_id": LFIND["SEC-ARCH-07"], "message": f"{LFIND['SEC-ARCH-07']} (snapshot S4): SEC-ARCH-07 needs review. Encryption is still stated in architecture.md v3 §4.3, but the key model and rotation have no support. Priya Natarajan verified the v2 sentence on 2026-10-08."}
LTASK_A.pop("due_at"); LTASK_A["due_at"] = "2026-10-20T17:00:00Z"
LL.add("LIVE", "live_v3", "S4", "box_task_created", APP, control_id="SEC-ARCH-07", finding_id=LFIND["SEC-ARCH-07"], task=LTASK_A)
LDANA = "Encrypted is stated; the key model and rotation are not. Requirement IS-STD-014 §5.1 needs the KMS CMK statement restored."
ldisp["SEC-ARCH-07"] = {**ldisp["SEC-ARCH-07"], "value": "returned_to_author", "snapshot_id": "S4"}
LL.add("LIVE", "live_v3", "S4", "human_disposition_recorded", {k: DANA[k] for k in ("type", "name", "role", "box_user_id")}, control_id="SEC-ARCH-07", machine_assessment="evidence_weakened",
       human_disposition="returned_to_author", finding_id=LFIND["SEC-ARCH-07"], via={"channel": "Box task", "task_id": LTASK_A["task_id"], "resolution_state": "completed"},
       comment=LDANA, reviewer_identity=box_identity(DANA), freshness_check={"decision_snapshot_id": "S4", "current_snapshot_id": "S4", "result": "pass"}, projection={"box_metadata": "ok"})
LTASK_B = {**TASK_B, "finding_id": LFIND["SEC-ARCH-07"], "message": f"Returned by Dana Okafor (ARB reviewer): \"{LDANA}\" Lost from architecture.md §4.3 in v3: \"{Q['07']}\""}
LL.add("LIVE", "live_v3", "S4", "box_task_created", APP, control_id="SEC-ARCH-07", finding_id=LFIND["SEC-ARCH-07"], task=LTASK_B,
       lost_clauses=[c["clause"] for c in LF["SEC-ARCH-07"]["clause_support"] if c["support"] == "unsupported"])
LL.verify()
lledger = {"folderId": FOLDER_ID, "folderName": "Project Lantern - ARB package (live slice)", **PROJECT, "control_profile": "profile-live", "control_profile_version": profile_live["profile_version"],
           "append_only": True, "live_timestamp_placeholder": "LIVE", "chain": {"algorithm": ledger["chain"]["algorithm"], "genesis": "0" * 64, "head": LL.events[-1]["chain_hash"],
           "note": "Events with ts LIVE are re-chained by the app when the real timestamp is known."},
           "population": LL.population(), "events": LL.events}
lexpected = {**PROJECT, "snapshot_id": "S4", "prior_snapshot_id": "S2", "control_profile_version": profile_live["profile_version"],
             "trigger": {**expected["trigger"]}, "summary": {"controls_evaluated": 3, "evidence_found": 2, "evidence_weakened": 1, "change_classification": {"weakened": 1, "moved": 1, "unchanged": 1}},
             "human_actions_expected": [{"control_id": "SEC-ARCH-07", "actor": "Dana Okafor", "disposition": "returned_to_author", "task_a": LTASK_A["task_id"], "task_b": LTASK_B["task_id"], "task_b_due": LTASK_B["due_at"], "message": LDANA}],
             "findings": [LF[c] for c in LCIDS]}
# live trace
lrows, ladded = diff_prior(LV, {c: [lver[c][0]] for c in LCIDS}, lambda fid: "arch-v3" if fid == F["arch"][0] else "run-v1")
assert sorted((r["control_id"], r["status"]) for r in lrows) == [("SEC-ARCH-07", "weakened"), ("SEC-ARCH-22", "removed")]
lt = Trace(); ls4 = lsnaps[1]
lt.step("app", "snapshot_captured", "Snapshot S4 captured: 2 files", 220, detail={"snapshot_id": "S4", "manifest_hash": ls4["manifest_hash"], "files": ls4["files"]})
lt.step("app", "texts_fetched", "Texts fetched: coverage 2 of 2 readable", 610, detail={"coverage": "2 of 2", "downloaded": [{"fileName": "architecture.md", "versionId": LV["arch-v3"]["versionId"]}], "cached": [{"fileName": "runbook.md", "versionId": LV["run-v1"]["versionId"]}]})
lt.step("app", "prior_quotes_diffed", "Prior quotes diffed: 1 weakened, 1 removed, 0 added", 60, detail={"missing": lrows, "added_bound_quotes": 0})
lsub, lms = agent_substeps(lt.t, LV, "S4", LCIDS, lver, ["run-v1", "arch-v3"], 2, 3600, 5900, 1240)
lt.step("agent", "agent_evaluation", "Agent evaluation: one Claude Sonnet 4.6 call, 3 controls", lms, model_id=MODEL_ID, inference_profile=INFERENCE_PROFILE, prompt_hash=PROMPT_HASH,
        mrm_model_id=MRM_MODEL_ID, detail={"input_tokens": 9310, "output_tokens": 1240, "substeps": lsub, "result": {c: [LF[c]["machine_assessment"], LF[c]["change_classification"]] for c in LCIDS}})
lt.step("app", "quotes_validated", "3 of 3 quotes matched; a failed match would set the finding to not_evaluated. Coverage complete.", 40, detail={"normalization": NORMALIZATION, "downgraded": []})
lt.step("app", "findings_applied", "Findings applied: 3", 30, detail={"finding_ids": [LFIND[c] for c in LCIDS]})
lt.step("app", "ledger_events_written", "Ledger events written (hash chain)", 30, detail={"chain_head": LL.events[-1]["chain_hash"]})
lt.step("app", "box_folder_metadata_written", "Box folder metadata written: keel_snapshot_id, keel_status_SEC_ARCH_07, _22, _17, keel_last_human_review", 450, detail={"fields": LMETA, "outcome": "ok"})
lt.step("app", "box_task_created", "Box task A created for Dana Okafor (review)", 390, detail=LTASK_A)
assert 11500 <= lt.t <= 12500, lt.t
ltrace = {"run_id": "run-live-slice", "mode_label": "Live", "snapshot_id": "S4", "prior_snapshot_id": "S2", "started_at": "LIVE", "total_duration_ms": lt.t,
          "model_id": MODEL_ID, "inference_profile": INFERENCE_PROFILE, "mrm_model_id": MRM_MODEL_ID, "steps": lt.steps}

# ============================================================ write
def write(path, obj):
    s = json.dumps(obj, indent=2, ensure_ascii=False); low = s.lower()
    for bad in BANNED: assert bad not in low, (path, bad)
    with open(path, "w") as fh: fh.write(s + "\n")
for name, obj in [("profile-us-bank.json", profile_us), ("profile-eu.json", profile_eu), ("snapshots.json", {"folderId": FOLDER_ID, **PROJECT, "snapshots": snapshots}),
                  ("ledger.json", ledger), ("expected-findings.json", expected), ("agent-trace.json", trace_full)]:
    write(P(name), obj)
for name, obj in [("profile-live.json", profile_live), ("snapshots.json", {"folderId": FOLDER_ID, **PROJECT, "snapshots": lsnaps}), ("ledger.json", lledger),
                  ("expected-findings.json", lexpected), ("agent-trace.json", ltrace)]:
    write(os.path.join(SL, name), obj)
print(f"full: {len(L.events)} events, trace {tr.t} ms | live slice: {len(LL.events)} events, trace {lt.t} ms")

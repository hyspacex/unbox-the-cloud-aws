"""Rebuild architecture-v1.md and architecture-v3.md from architecture-v2.md, and runbook-v1.md from runbook.md,
by exact replacements. Overwrites the derived files. Run: python3 -I scripts/derive.py demo-data/lantern"""
import sys
d = sys.argv[1]
v2 = open(f"{d}/architecture-v2.md").read()
rb = open(f"{d}/runbook.md").read()

def rep(s, old, new):
    assert s.count(old) == 1, ("not unique/found", old[:70], s.count(old))
    return s.replace(old, new)
def section(s, start, end):
    i = s.index(start); return i, s.index(end, i)
def swap(s, start, end, new):
    i, j = section(s, start, end); return s[:i] + new + s[j:]

CMK = "All customer data at rest is encrypted using AWS KMS customer-managed keys, rotated annually; key custodians are the Card Servicing Platform leads."
RB = "Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1."
TLS = "All network connections use TLS 1.2 at minimum, and TLS 1.3 is preferred where both sides support it."

# ---------- v1 (baseline, 03 Oct) ----------
v1 = v2
v1 = rep(v1, "| Version | 2.0 |", "| Version | 1.0 |")
v1 = rep(v1, "| Status | Submitted to Architecture Review Board, session of 07 Oct 2026 |", "| Status | Draft for ARB pre-read |")
v1 = rep(v1, "| Contributors | Card Servicing Platform engineering, Cloud Platform Engineering, Cryptographic Services (CRYPTO-OPS) |", "| Contributors | Card Servicing Platform engineering |")
i, j = section(v1, "| 2.0 | 06 Oct 2026", "\n"); v1 = v1[:i] + v1[j + 1:]
v1 = swap(v1, "### 4.1 Authentication", "### 4.2 Privileged access", """### 4.1 Authentication

Agents reach Lantern from the Corvid agent console and reuse the console session. The authentication approach for engineers is to be confirmed.

""")
v1 = swap(v1, "### 4.2 Privileged access", "### 4.3 Encryption at rest", """### 4.2 Privileged access

Each Lambda function will have its own execution role. The detailed role list will be added in the next version.

For the pilot, engineers will use the `LanternEngineer` role for troubleshooting in production. This role can read the session table and the snapshot bucket. We expect to narrow this after the pilot.

""")
v1 = swap(v1, "### 4.3 Encryption at rest and key management", "### 4.4 Encryption in transit", """### 4.3 Encryption at rest

Data at rest is encrypted in all Lantern data stores. The key management approach (AWS-managed versus customer-managed keys, rotation) is to be confirmed with CRYPTO-OPS before the ARB session.

""")
v1 = swap(v1, "### 4.6 Resilience and recovery", "## 5. Network segmentation", """### 4.6 Resilience and recovery

Recovery objectives and rollback procedures are in the runbook (MTB-RUN-LAN-001).

""")
v1 = swap(v1, "## 6. Logging and monitoring", "## 7. Third-party dependencies", """## 6. Logging and monitoring

Lambda functions write application logs to CloudWatch Logs. SIEM integration and log retention are to be confirmed with the Security Operations Center.

""")
v1 = rep(v1, "| 3 | Agent training material on reviewing drafts. | Support Operations | 30 Oct 2026 |",
 "| 3 | Agent training material on reviewing drafts. | Support Operations | 30 Oct 2026 |\n| 4 | Key management model for all data stores. | K. Lindqvist with CRYPTO-OPS | Before ARB |\n| 5 | Authentication, PAM and break-glass design. | K. Lindqvist | Before ARB |\n| 6 | SIEM forwarding and alert ownership. | K. Lindqvist with SOC | Before ARB |")
open(f"{d}/architecture-v1.md", "w").write(v1)

# ---------- v3 (17 Oct, AI-polished section 4) ----------
v3 = v2
v3 = rep(v3, "| Version | 2.0 |", "| Version | 3.0 |")
v3 = rep(v3, "| Status | Submitted to Architecture Review Board, session of 07 Oct 2026 |", "| Status | ARB-2026-0338 approved with conditions, 07 Oct 2026 |")
v3 = rep(v3, "Addresses pre-read comments from P. Natarajan and D. Okafor. |\n",
 "Addresses pre-read comments from P. Natarajan and D. Okafor. |\n| 3.0 | 17 Oct 2026 | J. Park (Eng), exported by svc-confluence-export | Section 4 rewrite for clarity (LAN-2291). |\n")
# harmless rewording outside section 4
v3 = rep(v3, "When an agent opens a support ticket, Lantern retrieves the ticket history and the relevant account notes, produces a short summary, and drafts a suggested reply that the agent must review and edit before sending. Lantern does not send anything to customers on its own and does not take actions on accounts.",
 "When an agent opens a support ticket, Lantern retrieves the ticket history and relevant account notes, summarizes them, and drafts a suggested reply that the agent reviews and edits before sending. Lantern never sends messages to customers on its own and never takes actions on accounts.")
v3 = rep(v3, "Initial rollout is to the Retail Card Servicing queue (approximately 140 agents, 9,000 tickets per week). Expansion to other queues requires a new ARB submission.",
 "The initial rollout covers the Retail Card Servicing queue (about 140 agents and 9,000 tickets per week). Any expansion to other queues requires a new ARB submission.")
v3 = rep(v3, "- Average handle time for card disputes is 11.5 minutes. Most of that time is spent reading prior ticket history and account notes. The target is a 20 percent reduction.",
 "- Average handle time for card disputes is 11.5 minutes, most of it spent reading prior ticket history and account notes. The target is a 20 percent reduction.")
v3 = rep(v3, "The only inbound path is from the agent desktop VLAN through the internal ALB. Security groups allow",
 "The agent desktop VLAN, through the internal ALB, is the only inbound path. Security groups allow")
v3 = rep(v3, "Application audit logs record, for each request: agent id, ticket id, model id, latency, and whether the draft was accepted, edited or discarded. They do not record the ticket text.",
 "For each request, application audit logs record the agent id, ticket id, model id, latency, and whether the draft was accepted, edited or discarded. Ticket text is not logged.")
v3 = swap(v3, "## 4. Security architecture", "## 5. Network segmentation", """## 4. Security architecture

Lantern's security architecture follows a defense-in-depth model that combines strong identity controls, robust data protection, and resilient operations. The subsections below describe how each layer keeps customer data safe across its full lifecycle.

### 4.1 Authentication

All human access to Lantern, for agents and engineers, authenticates through the Meridian enterprise IdP with phishing-resistant MFA; Lantern has no local user accounts. Only tokens issued by the enterprise IdP for the `lantern-agents` application are accepted, and group claims in each token govern queue access.

### 4.2 Privileged access

Privileged access to the Lantern production accounts is brokered through the enterprise PAM vault; there is no shared administrator account, and the named break-glass role is LanternBreakGlass, which requires two-person approval and expires after 4 hours.

| Role | Used by | Permissions (summary) |
| --- | --- | --- |
| `LanternApiRole` | `lantern-api` | Invoke `lantern-orchestrator`; read the session table. |
| `LanternIngestRole` | `lantern-ingest` | Read Corvid API secret; write to snapshot bucket prefix `tickets/`; write to the index. |
| `LanternOrchestratorRole` | `lantern-orchestrator` | Read the index; `bedrock:InvokeModel` on two approved model ids only; read and write the session table. |
| `LanternDeployRole` | CI/CD pipeline | Deploy CloudFormation stacks in the Lantern accounts; no data-plane read. |
| `LanternReadOnlyRole` | Engineers (through PAM) | CloudWatch metrics and log metadata; no object, table or index read. |
| `LanternBreakGlass` | On-call engineer, emergency only | Time-boxed read of session table and snapshots for incident diagnosis. |

Root credentials for the Lantern accounts are managed by Cloud Platform Engineering through the standard account vending process and play no part in day-to-day operations.

### 4.3 Data protection at rest

Lantern applies a comprehensive, layered approach to protecting data at rest, so that customer information remains secure wherever it is stored.

All customer data is protected with industry-standard encryption, with keys managed through AWS's native key management capabilities.

Each store is logically isolated with its own encryption context. The ability to decrypt is restricted to the service roles described in 4.2. Key lifecycle operations are governed by CRYPTO-OPS in line with Meridian's cryptographic standard.

### 4.4 Encryption in transit

All network connections use TLS 1.2 at minimum, and TLS 1.3 is preferred where both sides support it. The ALB applies the security policy `ELBSecurityPolicy-TLS13-1-2-2021-06`, and calls to Corvid and Atlas CRM use certificates from the Meridian internal CA.

### 4.5 Processing location

All Project Lantern processing and storage run in AWS us-east-1 within Meridian's AWS accounts. Bedrock inference uses the `us.` cross-Region inference profile, which routes requests only to US Regions.

### 4.6 Resilience and recovery

Lantern is designed for resilience in line with its Tier 1 classification. Backups are copied daily to a vault-locked AWS Backup vault in the separate account `mtb-backup-prod`, and detailed rollback and recovery procedures are maintained in the runbook (MTB-RUN-LAN-001).

""")
open(f"{d}/architecture-v3.md", "w").write(v3)

# ---------- runbook v1 (03 Oct) ----------
rb1 = rep(rb, "| Version | 1.1 |", "| Version | 1.0 |")
i, j = section(rb1, "| 1.1 | 12 Oct 2026", "\n"); rb1 = rb1[:i] + rb1[j + 1:]
rb1 = rep(rb1, "Card Servicing Platform engineering manager (Rafael Ortiz)", "Card Servicing Platform engineering manager (Jordan Whitfield)")
open(f"{d}/runbook-v1.md", "w").write(rb1)

for name, s in [("v1", v1), ("v2", v2), ("v3", v3), ("runbook", rb), ("runbook-v1", rb1)]:
    print(f"{name:10s} CMK {s.count(CMK)}  rollback {s.count(RB)}  'TLS 1.2' {s.count('TLS 1.2')}")

# Project Lantern: Customer Support AI Assistant, Solution Architecture

| Field | Value |
| --- | --- |
| Document ID | MTB-ARCH-LAN-001 |
| Project | Project Lantern: Customer Support AI Assistant |
| Application ID | APM-20417 |
| Application tier | Tier 1 (BIA-2026-114) |
| Regulatory scope | NPI (GLBA). Outside PCI DSS cardholder data environment. |
| Version | 1.0 |
| Status | Draft for ARB pre-read |
| Owner | Kevin Lindqvist, Staff Engineer, Card Servicing Platform |
| Contributors | Card Servicing Platform engineering |
| Classification | Meridian Confidential |
| Control profile | profile-us-bank 2026.3 |

## Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 03 Oct 2026 | K. Lindqvist | First draft for ARB pre-read. |

## 1. Purpose and scope

Project Lantern is an internal assistant for Meridian Trust Bank customer support agents. When an agent opens a support ticket, Lantern retrieves the ticket history and the relevant account notes, produces a short summary, and drafts a suggested reply that the agent must review and edit before sending. Lantern does not send anything to customers on its own and does not take actions on accounts.

In scope for this document: the Lantern application, its data stores, its integration with the Corvid ServiceDesk ticketing platform and the Atlas CRM account notes service, and its use of Amazon Bedrock. Out of scope: the ticketing platform itself (covered by MTB-ARCH-SUP-014), the agent desktop, and the customer-facing channels.

Initial rollout is to the Retail Card Servicing queue (approximately 140 agents, 9,000 tickets per week). Expansion to other queues requires a new ARB submission.

## 2. Business context and constraints

- Average handle time for card disputes is 11.5 minutes. Most of that time is spent reading prior ticket history and account notes. The target is a 20 percent reduction.
- Tickets and account notes contain nonpublic personal information (NPI) as defined under GLBA, including names, account status, and transaction details for disputed charges. Full PANs are masked by Corvid at ingestion and are not available to Lantern.
- The Business Impact Analysis (BIA-2026-114) rates Lantern Tier 1 because the Card Servicing queue's handle-time commitments depend on it once rolled out.
- Lantern must not become a system of record. The ticket in Corvid remains the record; Lantern stores working copies only, under the records class in the data flow and classification document.

## 3. Components, services and data

The flow for a single ticket is:

1. The agent opens a ticket in the Corvid agent console. The console calls the Lantern API through the internal Application Load Balancer (ALB) with the ticket id and the agent's SSO token.
2. The Lantern API (AWS Lambda, `lantern-api`) validates the token and checks that the agent is assigned to the ticket's queue.
3. The ingestion function (`lantern-ingest`) fetches the ticket thread from the Corvid API and the account notes from Atlas CRM, writes a snapshot to the S3 bucket `mtb-lantern-snapshots-prod`, and chunks and embeds the text into the Amazon OpenSearch Serverless collection `lantern-ticket-index`.
4. The orchestration function (`lantern-orchestrator`) retrieves the relevant chunks, calls Amazon Bedrock for the summary and draft reply, and stores the conversation state in the DynamoDB table `lantern-session-state`.
5. The result is returned to the agent console. The agent's edits and the final sent reply are written back to Corvid by the console, not by Lantern.

### 3.1 Services and components

Every AWS service and third-party component Lantern uses is listed in approved-services-and-exceptions.md and is either on the Approved Cloud Services Catalog or references an approved exception. Amazon OpenSearch Serverless is the one service used under an exception (EXC-2026-0117).

### 3.2 Data classification

The snapshot bucket, the session table and the vector index are classified Confidential / NPI (GLBA), and Lantern is outside PCI DSS scope because full PANs are masked before ingestion. Per-store classification and records classes are in data-flow-and-classification.md.

## 4. Security architecture

### 4.1 Authentication

Agents reach Lantern from the Corvid agent console and reuse the console session. The authentication approach for engineers is to be confirmed.

### 4.2 Privileged access

Each Lambda function will have its own execution role. The detailed role list will be added in the next version.

For the pilot, engineers will use the `LanternEngineer` role for troubleshooting in production. This role can read the session table and the snapshot bucket. We expect to narrow this after the pilot.

### 4.3 Encryption at rest

Data at rest is encrypted in all Lantern data stores. The key management approach (AWS-managed versus customer-managed keys, rotation) is to be confirmed with CRYPTO-OPS before the ARB session.

### 4.4 Encryption in transit

All network connections use TLS 1.2 at minimum, and TLS 1.3 is preferred where both sides support it. The ALB uses the security policy `ELBSecurityPolicy-TLS13-1-2-2021-06`, and calls to Corvid and Atlas CRM use certificates issued by the Meridian internal CA.

### 4.5 Processing location

All Project Lantern processing and storage run in AWS us-east-1 within Meridian's AWS accounts. Bedrock inference uses the `us.` cross-Region inference profile, which routes requests only to US Regions.

### 4.6 Resilience and recovery

Recovery objectives and rollback procedures are in the runbook (MTB-RUN-LAN-001).

## 5. Network segmentation

Lantern runs in private subnets of a dedicated VPC (`vpc-lantern-prod`, 10.84.0.0/20) with no internet gateway and no NAT gateway. Access to AWS services is through VPC interface endpoints for Bedrock Runtime, OpenSearch Serverless, KMS, Secrets Manager, CloudWatch Logs and STS, and a gateway endpoint for S3 and DynamoDB.

The only inbound path is from the agent desktop VLAN through the internal ALB. Security groups allow the ALB to reach `lantern-api` on 443 only, and allow the Lambda functions to reach the Corvid and Atlas CRM APIs on 443 only through the Transit Gateway attachment.

## 6. Logging and monitoring

Lambda functions write application logs to CloudWatch Logs. SIEM integration and log retention are to be confirmed with the Security Operations Center.

## 7. Third-party dependencies

Lantern uses no third-party processors outside Meridian's AWS accounts. Third parties are Corvid Systems (ticketing software, self-hosted), TPRM-2026-0412, inherent risk Tier 2, assessment current to 2027-03, and Amazon Web Services (cloud provider), TPRM-2025-0007, inherent risk Tier 1, assessment current to 2026-12. The Corvid ServiceDesk platform is self-hosted in account `mtb-support-prod`; the Corvid contract terms that apply are summarized in vendor-contract-summary.md.

## 8. Open items for ARB

| # | Item | Owner | Due |
| --- | --- | --- | --- |
| 1 | Confirm the two approved Bedrock model ids with Model Risk Management. | K. Lindqvist | 20 Oct 2026 |
| 2 | Load test at 2x expected peak (60 requests per second). | Card Servicing Platform | 23 Oct 2026 |
| 3 | Agent training material on reviewing drafts. | Support Operations | 30 Oct 2026 |
| 4 | Key management model for all data stores. | K. Lindqvist with CRYPTO-OPS | Before ARB |
| 5 | Authentication, PAM and break-glass design. | K. Lindqvist | Before ARB |
| 6 | SIEM forwarding and alert ownership. | K. Lindqvist with SOC | Before ARB |

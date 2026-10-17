# Project Lantern: Data Flow and Classification

| Field | Value |
| --- | --- |
| Document ID | MTB-DFC-LAN-001 |
| Application ID | APM-20417 |
| Version | 1.0 |
| Status | Reviewed by Enterprise Data Office, 02 Oct 2026 |
| Prepared by | Card Servicing Platform engineering |
| Data governance reviewer | Marcus Hale, Data Governance Lead, Enterprise Data Office |
| Related documents | MTB-ARCH-LAN-001 (architecture), MTB-RUN-LAN-001 (runbook) |
| Classification | Meridian Confidential |

## 1. Purpose

This document classifies every data store and data flow in Project Lantern under the Meridian Data Classification Standard (IS-STD-003) and records the regulatory scope of each. It is the input for the information security review, the GLBA safeguards program inventory, and the Records Management review.

## 2. Data flow

```
Customer -> (phone, chat, email) -> Corvid ServiceDesk ticket          [mtb-support-prod]
                                          |
                     agent opens ticket   v
Agent console --> Lantern API --> lantern-ingest --(ticket thread)--> Corvid API
                                          |--(account notes)--> Atlas CRM API
                                          v
                        S3 snapshot  +  OpenSearch index               [mtb-lantern-prod, us-east-1]
                                          |
                                          v
                     lantern-orchestrator --> Amazon Bedrock (us. inference profile)
                                          |
                                          v
                     DynamoDB session state --> summary + draft to agent console
```

Flows F1 to F5 are internal to Meridian's AWS accounts and use TLS on every hop. No flow leaves Meridian's accounts other than the Bedrock inference call, which stays within AWS US Regions and is not retained by the service for training.

## 3. Classification by data store

| Data store | Contents | Classification | Regulatory scope | Records class (RRS) |
| --- | --- | --- | --- | --- |
| S3 `mtb-lantern-snapshots-prod` | Ticket threads and account notes copied at ingest | Confidential / NPI (GLBA) | GLBA Safeguards; outside PCI DSS CDE | CS-210 Customer service working copies |
| OpenSearch Serverless `lantern-ticket-index` | Text chunks and embeddings derived from snapshots | Confidential / NPI (GLBA) | GLBA Safeguards; outside PCI DSS CDE | CS-210 Customer service working copies |
| DynamoDB `lantern-session-state` | Summaries, drafts, agent edits | Confidential / NPI (GLBA) | GLBA Safeguards; outside PCI DSS CDE | CS-210 Customer service working copies |
| CloudWatch Logs `/lantern/*` | Application metadata, no ticket text | Internal | None | IT-410 Operational logs |
| Splunk index `lantern_security` | Security events | Confidential | SOX ITGC evidence | IT-420 Security event logs (IS-STD-021) |
| Parameter Store `/lantern/prod/*` | Configuration, no customer data | Internal | None | IT-410 Operational logs |

**PCI DSS scope boundary.** Corvid masks the primary account number at ingestion to the last four digits. Lantern never receives, stores or transmits a full PAN, CVV or PIN, so no Lantern component is in the cardholder data environment. The integration test `no-pan-in-snapshot` fails the build if a 13 to 19 digit Luhn-valid sequence appears in a test snapshot.

## 4. Personal information

| Category | Examples | Present in |
| --- | --- | --- |
| Identification | Name, customer number, email address, phone number | Snapshots, index, session |
| Account and product | Product type, card last four, account status, recent fees and disputes | Snapshots, index |
| Transactions | Merchant, amount and date for disputed transactions | Snapshots, index |
| Free text | Customer messages; may incidentally include health or hardship details | Snapshots, index, session |
| Employee | Agent id, queue, whether the draft was edited | Audit logs |

Customers can disclose sensitive details in free text, for example a medical reason for a hardship request. Lantern does not seek these details and does not use them as inputs to any decision. Summaries mask health terms before display.

## 5. Retention and deletion

Lantern working copies fall under Records Retention Schedule class CS-210, "Customer service working copies", whose disposition trigger is the close of the source ticket in Corvid. The source record remains in Corvid under class CS-110.

Disposition is automated. The job `lantern-retention-sweeper` is an EventBridge-scheduled Lambda function that runs daily at 02:00 Eastern and deletes the snapshot objects, index documents and session records for every ticket whose CS-210 period has elapsed, writing a disposition record to the audit log. S3 lifecycle rules and a DynamoDB TTL attribute are set to the same period as backstops. Records Management receives a quarterly disposition report. Legal holds are applied in Corvid and propagate to Lantern through the `legal_hold` flag, which the sweeper honors.

## 6. Sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Data Governance Lead | Marcus Hale | Approved | 02 Oct 2026 |
| Records Management | Ines Carvalho | Approved, class CS-210 confirmed | 02 Oct 2026 |
| Product owner | Lena Brandt, Head of Support Operations | Accepted | 02 Oct 2026 |

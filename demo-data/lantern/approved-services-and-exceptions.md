# Project Lantern: Approved Services and Exceptions

| Field | Value |
| --- | --- |
| Document ID | MTB-ASE-LAN-001 |
| Application ID | APM-20417 |
| Version | 1.0 |
| Catalog checked | Approved Cloud Services Catalog (ACSC), release 2026-09 |
| Prepared by | Card Servicing Platform engineering, checked by Cloud Platform Engineering |
| Classification | Meridian Internal |

## 1. Purpose

This list names every AWS service and third-party component in the Project Lantern design and records whether it is on the Approved Cloud Services Catalog or is used under an approved exception. It is the evidence for standard IS-STD-009 (Approved Technology). Any component not listed here must not be deployed.

## 2. AWS services

| Service | Use in Lantern | ACSC status | Reference |
| --- | --- | --- | --- |
| AWS Lambda | API, ingest, orchestrator, sweeper | Approved | ACSC-0012 |
| Amazon S3 | Ticket snapshots | Approved | ACSC-0003 |
| Amazon DynamoDB | Session state | Approved | ACSC-0007 |
| Amazon OpenSearch Serverless | Vector index | Not yet on catalog; approved exception | EXC-2026-0117, expires 31 Mar 2027 |
| Amazon Bedrock | Summaries and draft replies | Approved with conditions (approved model list, `us.` inference profiles only) | ACSC-0141 |
| AWS Key Management Service | Encryption keys for Lantern data stores | Approved | ACSC-0005 |
| AWS Secrets Manager | Corvid API credential | Approved | ACSC-0019 |
| Elastic Load Balancing (ALB) | Internal API entry point | Approved | ACSC-0010 |
| Amazon VPC, VPC endpoints, AWS Transit Gateway | Network isolation and connectivity | Approved | ACSC-0001, ACSC-0024 |
| Amazon CloudWatch | Metrics, alarms, application logs | Approved | ACSC-0015 |
| AWS CloudTrail | API audit events | Approved | ACSC-0016 |
| Amazon EventBridge | Sweeper schedule | Approved | ACSC-0031 |
| Amazon SNS | Alarm fan-out | Approved | ACSC-0022 |
| AWS Systems Manager Parameter Store | Configuration and kill switch | Approved | ACSC-0027 |
| AWS Backup | Daily backups with Vault Lock | Approved | ACSC-0033 |

## 3. Third-party and internal components

| Component | Use in Lantern | Status | Reference |
| --- | --- | --- | --- |
| Corvid ServiceDesk (self-hosted) | Source of tickets | Approved vendor | TPRM-2026-0412 (inherent risk Tier 2) |
| Atlas CRM API | Source of account notes | Internal platform | APM-10088 |
| Meridian enterprise IdP | Agent and engineer authentication | Enterprise standard | IS-STD-011 |
| Enterprise PAM vault | Privileged and break-glass access | Enterprise standard | IS-STD-012 |
| Splunk (enterprise SIEM) | Security event forwarding | Enterprise standard | IS-STD-021 |

## 4. Exceptions

| Exception | Scope | Compensating controls | Risk owner | Approver | Expiry |
| --- | --- | --- | --- | --- | --- |
| EXC-2026-0117 | Amazon OpenSearch Serverless for `lantern-ticket-index` | Encrypted with a Lantern KMS key, VPC endpoint only, no public network policy, data limited to derived chunks | Head of Card Servicing Platform | CISO delegate, Cloud Security | 31 Mar 2027 |

Cloud Platform Engineering expects OpenSearch Serverless to be added to the catalog in the 2026-12 release, at which point the exception is closed.

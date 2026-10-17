# Project Lantern: Operations Runbook

| Field | Value |
| --- | --- |
| Document ID | MTB-RUN-LAN-001 |
| Application ID | APM-20417 |
| Version | 1.0 |
| Status | Reviewed by Technology Resilience |
| Service owner | Card Servicing Platform (team alias: csp-lantern) |
| Resilience reviewer | Dana Okafor, Technology Resilience |
| BIA tier | Tier 1 (BIA-2026-114) |
| Classification | Meridian Internal |

## Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 03 Oct 2026 | Card Servicing Platform | First issue after Technology Resilience review. |

## 1. Service summary

Lantern produces ticket summaries and draft replies for support agents. If Lantern is down, the agent console hides the Lantern panel and agents work tickets the way they did before the pilot; handle time rises, which is why the BIA rates the service Tier 1. Components: `lantern-api`, `lantern-ingest`, `lantern-orchestrator` (Lambda), `mtb-lantern-snapshots-prod` (S3), `lantern-ticket-index` (OpenSearch Serverless), `lantern-session-state` (DynamoDB), Amazon Bedrock. Architecture: MTB-ARCH-LAN-001.

## 2. Recovery objectives

| Objective | Target | Basis |
| --- | --- | --- |
| Recovery time objective (RTO) | 4 hours | BIA Tier 1 maximum is 4 hours. |
| Recovery point objective (RPO) | 15 minutes | DynamoDB point-in-time recovery and S3 versioning; index is rebuildable from snapshots. |
| Maximum tolerable downtime | 8 hours | Agreed with Support Operations (L. Brandt), 02 Oct 2026. |

The objectives were tested in the recovery exercise on 01 Oct 2026 in the staging account: restore of the session table to a point 10 minutes before a simulated corruption took 38 minutes; full index rebuild from snapshots for 30 days of tickets took 2 hours 50 minutes. Total time to service restored was 3 hours 31 minutes, inside the 4-hour RTO.

## 3. Deployment and rollback

Deployments go through the `lantern-pipeline` CI/CD pipeline: build, unit tests, deploy to staging, integration tests (including the cross-customer retrieval test), manual approval by the on-call engineer, then production in two waves (10 percent of agents for 1 hour, then 100 percent).

**Rollback plan.** Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1.

1. Trigger: any Sev 2 alarm during or within 2 hours of a deployment.
2. The on-call engineer runs the pipeline's "Revert to last good" action. This shifts the Lambda aliases (`live`) back to the previous published versions. The alias shift itself takes under 5 minutes.
3. If the deployment changed the index mapping or the table schema, follow 3.1.
4. Confirm recovery on the dashboard `Lantern-Prod-Overview` (error rate below 1 percent, p95 latency below 6 seconds).
5. Record the rollback in MTB ChangeHub against the original change and open a problem record.

**3.1 Data rollback.** Schema changes are additive only, so a code rollback does not require a data rollback. If data is corrupted: restore `lantern-session-state` with DynamoDB point-in-time recovery to a new table, swap the table name in Parameter Store, and redeploy; rebuild `lantern-ticket-index` from S3 snapshots with the `lantern-reindex` job.

**3.2 Model rollback.** The model id is a parameter in Parameter Store. Changing the model requires a change ticket and Model Risk Management approval. To revert, set `/lantern/prod/model-id` to the previous approved id and cycle the function version.

**3.3 Kill switch.** Setting `/lantern/prod/enabled` to `false` hides the Lantern panel for all agents within 1 minute. Use this if the model produces harmful or wrong output at scale and the cause is not yet known.

## 4. Backup

DynamoDB point-in-time recovery is enabled (35 days). S3 versioning is enabled on the snapshot bucket. AWS Backup copies the table and bucket daily to the backup vault in account `mtb-backup-prod`, same Region, with 35-day retention and Vault Lock in compliance mode, so backups cannot be deleted or shortened by anyone in the Lantern accounts. The index is not backed up; it is rebuilt from snapshots.

## 5. Monitoring and alerting

| Alarm | Condition | Severity | Routed to |
| --- | --- | --- | --- |
| `lantern-api-5xx` | 5xx rate above 2 percent for 5 minutes | Sev 2 | On-call engineer |
| `lantern-latency-p95` | p95 above 8 seconds for 10 minutes | Sev 3 | On-call engineer |
| `lantern-bedrock-throttle` | Bedrock throttling above 1 percent for 5 minutes | Sev 3 | On-call engineer |
| `lantern-kms-access-denied` | Any KMS AccessDenied on Lantern keys | Sev 2 | SOC (via Splunk) |
| `lantern-breakglass-assumed` | LanternBreakGlass role assumed | Sev 3 (notify) | SOC and service owner |
| `lantern-retention-sweeper-failed` | Sweeper run failed or did not run in 26 hours | Sev 3 | On-call engineer and Records Management |
| `lantern-ingest-errors` | Corvid or Atlas CRM API errors above 5 percent for 10 minutes | Sev 3 | On-call engineer |

Operational alarms are CloudWatch alarms published to the `lantern-alerts` SNS topic, which pages through MTB Pager. Security detections run in Splunk and are owned by the SOC.

## 6. On-call

- Rotation: Card Servicing Platform, primary and secondary, weekly handover on Mondays at 10:00 Eastern.
- Coverage: 24x7 for Sev 2, business hours for Sev 3.
- Escalation: primary (15 minutes) to secondary (15 minutes) to Card Servicing Platform engineering manager (Jordan Whitfield).
- The on-call engineer may assume LanternBreakGlass only through the PAM vault with a second approver; the session expires after 4 hours.

## 7. Common procedures

| Symptom | First checks | Action |
| --- | --- | --- |
| Agents report empty summaries | `lantern-ingest-errors`, Corvid API status | If Corvid is down, set the kill switch and notify Support Operations. |
| Slow responses | `lantern-latency-p95`, Bedrock throttling | Request quota increase; temporarily reduce max output tokens via parameter. |
| Draft contains wrong customer's details | Stop: Sev 1 privacy incident | Set the kill switch, page SOC and the Privacy Office, preserve logs. Do not delete data. |
| Sweeper failed | Sweeper logs | Re-run manually after fix; record in the Records Management tracker. |

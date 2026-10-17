# Lantern — Architecture

Author: J. Park · Version for architecture review board

## 1. Overview

Agent desktop → Suggestion API → retrieval over the approved knowledge base → model gateway → suggestion returned to the agent.
Conversation text flows from the contact-center platform into the Suggestion API and is never sent to the knowledge base.

## 2. Data residency

All customer data is stored and processed in the EU (AWS eu-central-1, Frankfurt).
Backups are replicated to eu-west-1 (Ireland) and never leave the EU.

## 3. Performance and capacity

The Suggestion API targets a p99 latency of 50 ms at peak load.
Capacity is provisioned for 1,500 requests per second, 25% above the forecast peak, with autoscaling on queue depth.

## 4. Security

### 4.1 Authentication

Agents sign in through the enterprise IdP with MFA. Service-to-service calls use short-lived IAM credentials.

### 4.2 Network

All traffic uses TLS 1.2 or higher. The service runs in private subnets with no public ingress.

### 4.3 Key management

All data is encrypted at rest with AES-256.
Keys are customer-managed keys in AWS KMS, owned by the Lantern security team, and rotated every 12 months.

### 4.4 Logging and monitoring

Security events stream to the enterprise SIEM (Splunk). Logs never contain conversation text or account numbers.

## 5. Recovery

Each release is deployed blue/green and can be rolled back in under 10 minutes.
RTO is 1 hour and RPO is 15 minutes.

## 6. Third parties

Corvid Speech provides call transcription under TPRM assessment TPRM-2026-0412 (tier 2).

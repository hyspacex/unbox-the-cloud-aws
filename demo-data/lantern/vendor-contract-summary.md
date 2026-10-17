# Corvid Systems, Inc.: Contract and Data Handling Summary

| Field | Value |
| --- | --- |
| Document ID | MTB-TPR-0213-SUM |
| Prepared by | Vendor Management Office, Third-Party Risk |
| Analyst | Owen Pryce, Third-Party Risk Analyst |
| Source documents | Corvid Master Subscription and Support Agreement (MSSA) dated 14 Feb 2024; Data Handling Addendum v4.2 dated 01 Jul 2026; Order Form 3 |
| TPRM assessment | TPRM-2026-0412 (Corvid ServiceDesk), inherent risk Tier 2, assessment current to 2027-03 |
| Prepared for | Project Lantern ARB package |
| Date | 02 Oct 2026 |
| Classification | Meridian Confidential |

## 1. Purpose

This summary records the terms in Meridian's agreement with Corvid Systems, Inc. that matter for Project Lantern, which reads tickets from the Corvid ServiceDesk platform. It is a summary for the ARB package; the signed agreement in the contract repository governs.

## 2. Service description

Corvid Systems (ticketing software, self-hosted), TPRM-2026-0412, inherent risk Tier 2, assessment current to 2027-03.


Corvid ServiceDesk is licensed as self-hosted software. Meridian runs the platform in its own AWS account (`mtb-support-prod`, us-east-1). Corvid provides software updates and Tier 2 and Tier 3 technical support under the MSSA Support Schedule. Ticket data is stored only in Meridian's account.

## 3. Access to Meridian data

- Corvid support personnel can view a Meridian deployment only through a Corvid Remote Assist session that Meridian enables per case. Each session is limited to 8 hours and is logged on the Meridian side.
- Order Form 3 disables Remote Assist export for Meridian: Corvid personnel may view diagnostic screens but may not copy, download or transfer ticket content.
- No sub-processor receives Meridian customer data under Order Form 3. Corvid's general sub-processor list applies to its hosted customers and does not apply to Meridian's self-hosted deployment.

This is consistent with the Lantern architecture, which states that Lantern uses no third-party processors outside Meridian's AWS accounts.

## 4. Security terms

- Corvid maintains an information security program consistent with ISO/IEC 27001 and provides a SOC 2 Type II report annually. The latest report (period ending 30 Jun 2026) was received on 22 Aug 2026 with no exceptions.
- Security incident notification to Meridian within 24 hours of discovery (Addendum 9.2), which meets the bank's third-party incident notification standard.
- Meridian has audit rights once per year, or after a security incident, on 30 days' notice (Addendum 10.1).
- Software updates are signed; Meridian verifies signatures before deployment to `mtb-support-prod`.

## 5. Observations for Project Lantern

1. Lantern calls the Corvid API inside Meridian's network. No Lantern data flow involves Corvid systems.
2. Remote Assist sessions on tickets that Lantern has read do not expose Lantern data stores; Corvid personnel have no access to the Lantern accounts.
3. No action required for the ARB. The next periodic review of TPRM-2026-0412 is due Mar 2027.

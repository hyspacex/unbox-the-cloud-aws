# Corvid Systems, Inc.: Data Processing Addendum Summary

| Field | Value |
| --- | --- |
| Document ID | MTB-TPRM-2026-0412-DPA-SUM |
| Prepared by | Vendor Management Office, Third-Party Risk |
| Analyst | Owen Pryce, Third-Party Risk Analyst |
| Source documents | Corvid Master Subscription and Support Agreement (MSSA) dated 14 Feb 2024; Data Processing Addendum (DPA) v4.2 dated 01 Jul 2026; Sub-processor Schedule rev. 2026-07 |
| Third-party register entry | TPRM-2026-0412 (Corvid ServiceDesk), criticality: Important |
| Prepared for | Project Lantern folder, at the request of the ARB (open item from 13 Oct 2026 session) |
| Date | 16 Oct 2026 |
| Classification | Meridian Internal, Confidential |

## 1. Purpose

This summary records the data protection terms in Meridian's agreement with Corvid Systems, Inc. for the Corvid ServiceDesk ticketing platform. It was requested so that the Project Lantern design can be checked against the contract. It is a summary for internal review; the signed agreement and DPA in the contract repository govern.

## 2. Service description

Corvid ServiceDesk is licensed as self-hosted software. Meridian runs the platform in its own AWS account (`mtb-support-prod`, us-east-1). Corvid provides software updates, and Tier 2 and Tier 3 technical support under the MSSA Support Schedule. Ticket data is stored in Meridian's account. Corvid does not host Meridian ticket data in normal operation.

## 3. Roles and scope of processing

- Meridian is the controller. Corvid acts as a processor only when performing support services that involve access to Customer Data (DPA section 2.1).
- Customer Data in scope includes ticket content, attachments, and any account information that Meridian personnel copy into tickets.
- Corvid support access is through the Corvid Remote Assist channel, which Meridian must enable per case. Each session is time-limited to 8 hours and logged on the Meridian side.

## 4. Sub-processors

DPA section 6.3: "For Tier 3 escalations, Corvid may transfer Customer Data contained in escalated tickets, including attachments and account information copied into tickets, to Halcyon Support Services, Austin TX, for the purpose of reproducing and resolving the reported defect."

| Sub-processor | Location | Service | Customer Data access |
| --- | --- | --- | --- |
| Halcyon Support Services, LLC | Austin, TX, United States | Tier 3 escalation handling and defect reproduction | Yes, ticket samples exported during Tier 3 cases |
| Corvid Systems Ireland Ltd. | Cork, Ireland | Follow-the-sun Tier 2 support for EU customers | Not applicable to Meridian (US support region selected in Order Form 3) |
| Amazon Web Services, Inc. | us-east-1 | Hosting for Corvid's support case tracker | Case metadata only (case id, severity, customer org id) |

Corvid must give 30 days' notice of any new sub-processor (DPA 6.4). Meridian may object; if the objection is not resolved, Meridian may terminate the affected support services without penalty.

## 5. Data location and transfers

- The Order Form 3 support region is "United States". Under DPA 7.1, Corvid will not transfer Meridian Customer Data outside the United States without prior written consent.
- Data exported to Halcyon during a Tier 3 case is retained by Halcyon for up to 90 days after case closure and then deleted (DPA 6.3(c)). Halcyon provides a deletion certificate on request.

## 6. Security terms

- Corvid and its sub-processors must maintain an information security program consistent with ISO/IEC 27001 and provide a SOC 2 Type II report annually. The latest Corvid report (period ending 30 Jun 2026) was received on 22 Aug 2026 with no exceptions. Halcyon's SOC 2 Type II report has been requested and is not yet on file.
- Security incident notification to Meridian within 24 hours of discovery (DPA 9.2). This meets the bank's third-party incident notification standard.
- Meridian has audit rights once per year, or after a security incident, on 30 days' notice (DPA 10.1).

## 7. Observations for Project Lantern

1. Tickets that Lantern reads can contain account notes and card dispute details. If a Lantern-related defect is escalated to Corvid Tier 3, ticket samples may be exported to Halcyon under DPA 6.3.
2. Halcyon is located in the United States, so the transfer does not leave the US. It does leave Meridian's AWS accounts.
3. Halcyon is listed in the third-party register only as a fourth party under TPRM-2026-0412, with no separate due diligence record.
4. Recommendation from Vendor Management: either disable Remote Assist export for Lantern-related cases, or record Halcyon as a sub-processor in the Lantern design and complete fourth-party due diligence. Decision owner: ARB with the Privacy Office.

"use strict";
// Generated from the repository's synthetic Lantern fixture; run npm run fixture:sync.
(function (root) {
  const evidence = {
  "SEC-ARCH-01": {
    "source": "approved-services-and-exceptions.md v1",
    "snippet": "This list names every AWS service and third-party component in the Project Lantern design and records whether it is on the Approved Cloud Services Catalog or is used under an approved exception.",
    "section": "§1 Purpose",
    "verifiedBy": "Marcus Hale",
    "verifiedAt": "2026-10-08T09:05:44Z",
    "author": null
  },
  "SEC-ARCH-02": {
    "source": "architecture.md v3",
    "snippet": "The snapshot bucket, the session table and the vector index are classified Confidential / NPI (GLBA), and Lantern is outside PCI DSS scope because full PANs are masked before ingestion.",
    "section": "§3.2 Data classification",
    "verifiedBy": "Marcus Hale",
    "verifiedAt": "2026-10-08T09:11:20Z",
    "author": "J. Park (Eng)"
  },
  "SEC-ARCH-04": {
    "source": "architecture.md v3",
    "snippet": "All human access to Lantern, for agents and engineers, authenticates through the Meridian enterprise IdP with phishing-resistant MFA; Lantern has no local user accounts.",
    "section": "§4.1 Authentication",
    "verifiedBy": "Marcus Hale",
    "verifiedAt": "2026-10-08T09:16:02Z",
    "author": "J. Park (Eng)"
  },
  "SEC-ARCH-05": {
    "source": "architecture.md v3",
    "snippet": "Privileged access to the Lantern production accounts is brokered through the enterprise PAM vault; there is no shared administrator account, and the named break-glass role is LanternBreakGlass, which requires two-person approval and expires after 4 hours.",
    "section": "§4.2 Privileged access",
    "verifiedBy": "Dana Okafor",
    "verifiedAt": "2026-10-07T15:40:12Z",
    "author": "J. Park (Eng)"
  },
  "SEC-ARCH-07": {
    "source": "architecture.md v3",
    "snippet": "All customer data is protected with industry-standard encryption, with keys managed through AWS's native key management capabilities.",
    "section": "§4.3 Data protection at rest",
    "verifiedBy": "Priya Natarajan",
    "verifiedAt": "2026-10-08T10:32:00Z",
    "author": "J. Park (Eng)"
  },
  "SEC-ARCH-17": {
    "source": "architecture.md v3",
    "snippet": "Security events from CloudTrail, VPC Flow Logs, Bedrock model invocation logs and Lantern application audit logs are forwarded to the enterprise SIEM (Splunk) and retained per IS-STD-021; the alert owner is the Security Operations Center, with Card Servicing Platform on-call as secondary.",
    "section": "§6 Logging and monitoring",
    "verifiedBy": "Dana Okafor",
    "verifiedAt": "2026-10-07T15:46:31Z",
    "author": "J. Park (Eng)"
  },
  "SEC-ARCH-20": {
    "source": "architecture.md v3",
    "snippet": "Third parties are Corvid Systems (ticketing software, self-hosted), TPRM-2026-0412, inherent risk Tier 2, assessment current to 2027-03, and Amazon Web Services (cloud provider), TPRM-2025-0007, inherent risk Tier 1, assessment current to 2026-12.",
    "section": "§7 Third-party dependencies",
    "verifiedBy": "Marcus Hale",
    "verifiedAt": "2026-10-08T09:22:47Z",
    "author": "J. Park (Eng)"
  },
  "SEC-ARCH-22": {
    "source": "runbook.md v2",
    "snippet": "Deployments roll back to the previous published Lambda version within 15 minutes; RTO 4 hours and RPO 15 minutes per BIA Tier 1.",
    "section": "§3 Deployment and rollback",
    "verifiedBy": "Dana Okafor",
    "verifiedAt": "2026-10-07T15:52:08Z",
    "author": null
  }
};
  if (typeof module === "object" && module.exports) module.exports = evidence;
  else root.KeelEvidence = evidence;
})(globalThis);

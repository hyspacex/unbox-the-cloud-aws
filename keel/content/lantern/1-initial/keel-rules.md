# Keel rules — Project Lantern

Checks run on every upload to this folder. Each rule is judged against the documents in the folder.
Rules check that the thinking is stated and consistent; they do not prove what was built.

## R1 · Security checklist complete
Every item in the security review checklist is checked and has an answer. Open or TBD items fail this rule.

## R2 · Encryption and key management documented
The architecture document states encryption at rest, the key-management model (who owns the keys) and the key rotation period.

## R3 · Latency targets consistent
p99 latency targets agree across every document and meeting transcript in the folder.

## R4 · Scale estimates present
The folder states the expected peak load and the capacity provisioned for it.

## R5 · Data residency stated
The folder states where customer data is stored and processed.

## R6 · Data retention stated
The folder states how long conversation data and logs are retained.

## R7 · Rollback and recovery documented
The folder documents how a release is rolled back and states recovery objectives (RTO and RPO).

## R8 · Owners named
An accountable owner and an on-call escalation path are named.

# Project Lantern — Customer Support AI Assistant

Owner: Maya Chen (Product) · Status: proposal for architecture review

## 1. Summary

Lantern drafts reply suggestions for contact-center agents at Meridian Trust Bank.
Agents stay in control: every suggestion is reviewed and edited by a person before it reaches a customer.

## 2. Goals

- Reduce average handle time by 20% within two quarters.
- Keep suggestion quality above 4.2 / 5 in weekly agent ratings.
- Suggestions must appear within a p99 latency of 50 ms so agents never wait on the assistant.

## 3. Scale

We expect a peak of 1,200 requests per second during the January billing cycle, with 40% annual growth.
Roughly 2,300 agents across four sites will use Lantern at launch.

## 4. Personal data

The assistant processes customer names, account numbers and the text of support conversations.
The lawful basis for processing is legitimate interest in resolving the customer's own support request.
No special-category data is used to generate suggestions.

## 5. Owners

Accountable owner: Maya Chen (Product).
Technical owner: J. Park (Engineering).
On-call escalation: the Lantern on-call rotation in PagerDuty, backed by the Support Platform team.

# Project connection contract

This is the API consumed by the lightweight native client and implemented by
the consolidated Next.js demo server. The desktop transport rejects remote HTTP, redirects, oversized
responses, mismatched project IDs and unknown control states.
Loopback HTTP is allowed only for a local presentation; remote hosting uses HTTPS.

## 1. Browser handoff

After installation, a project's authenticated web page renders a link:

```html
<a href="keel://connect?project=lantern&amp;server=https%3A%2F%2Fkeel.example.com&amp;code=SERVER_MINTED_ONE_TIME_CODE">
  Open in Keel
</a>
```

The example domain is a placeholder. `project` is a 1-64 character identifier
using letters, numbers, hyphens or underscores. `server` is an HTTPS origin
without path, query, credentials or fragment. `code` is a 16-2048 character
base64url-compatible single-use code; extra/duplicate parameters are rejected.
`http://127.0.0.1:3100` is the explicit local-demo exception.

The backend must bind the code to the project, user and a short expiry, consume
it atomically, rate-limit exchange, and enforce project authorization. A URL
scheme is not proof of user identity. Custom schemes can be claimed by other
software; stronger device binding/PKCE is a production-hardening requirement.

## 2. Exchange

`POST /api/desktop/connect`

```json
{"projectId":"lantern","code":"SERVER_MINTED_ONE_TIME_CODE"}
```

Successful response:

```json
{"projectId":"lantern","accessToken":"PROJECT_SCOPED_TOKEN","expiresIn":900}
```

Return 401/403 for unauthorized or expired codes. The token must authorize only
the selected user's readable project data, and expire server-side. The widget
holds it in native memory, never in its URL, HTML, localStorage or logs.
An ambiguous exchange failure requires a new link, not automatic code replay.

## 3. Read project state

`GET /api/desktop/projects/{projectId}/state`

Authorization: Bearer token from the exchange.

```json
{
  "projectId": "lantern",
  "mode": "live",
  "projectName": "Project Lantern",
  "snapshotId": "S4",
  "sequence": 14,
  "observedAt": "2026-10-17T08:00:00Z",
  "controls": [
    {
      "id": "SEC-ARCH-07",
      "title": "Key management",
      "status": "NEEDS_REVIEW_WEAKENED",
      "reason": "The customer-managed key clause lost support.",
      "source": "architecture.md v3",
      "sourceUrl": "https://app.box.com/file/EXAMPLE_FILE_ID",
      "author": "Example contributor",
      "snippet": "All data at rest is protected with industry-standard encryption.",
      "section": "4.3",
      "verifiedBy": "Previous reviewer"
    },
    {
      "id": "SEC-ARCH-22",
      "title": "Recovery and rollback",
      "status": "VERIFIED",
      "reason": "A named reviewer re-verified the current evidence binding.",
      "source": "runbook.md v2",
      "verifiedBy": "Example reviewer"
    }
  ],
  "event": {
    "id": "event-14",
    "kind": "reviewed",
    "actor": "Example reviewer",
    "file": "runbook.md v2",
    "title": "1 re-verified",
    "note": "Recovery was re-verified; key management still needs attention.",
    "beforeVerified": 0,
    "affected": ["SEC-ARCH-22"]
  }
}
```

All values above are illustrative, including file IDs and people. Source links
must be accessible to the user; do not copy privileged source excerpts into an
otherwise readable summary. The client allows source links only to Box or the
connected service's HTTPS origin.

`sequence` is monotonic per project; every new snapshot, evaluation or human
response that changes this representation must advance it. Stable refreshes
keep the same event ID and observation timestamp. Return a coherent full
snapshot, not a partial subset or a sequence of guessed count increments.

Supported projection codes:

- Green only: `VERIFIED`, `VERIFIED_HOLDS`, with `verifiedBy` required.
- Attention: `ACKNOWLEDGE`, `PENDING`, `NOT_EVALUATED`,
  `NEEDS_REVIEW_BINDING`, `NEEDS_REVIEW_WEAKENED`, `NEEDS_REVIEW_ABSENT`,
  `NEEDS_REVIEW_CONFLICT`, `RETURNED_TO_AUTHOR`, `EXCEPTION`,
  `NOT_APPLICABLE`, `SUPERSEDED`.

The two counters conservatively mean **verified evidence / all other current
outcomes**, not a compliance certification or a percent-compliant score.
More detailed exception/applicability treatment belongs on the web page.

The response limit is 256 KiB and the client accepts 1-500 unique controls.
`sourceUrl`, `author`, `snippet`, `section` and `verifiedAt` are optional.
The accordion shows available evidence rather than inventing missing fields.

The client polls every three seconds with a 12-second request timeout and no
redirects. A dropped or delayed response marks the existing view stale; a new
project never inherits the previous project's counts. There is no telemetry
or third-party analytics endpoint.

## 4. Upload and trigger the shared engine

`POST /api/desktop/projects/{projectId}/uploads`

Send `multipart/form-data` with a `files` field per file, authorized using the
same project-scoped bearer. Up to 20 files / 16 MiB per batch. Native folder
selections are flattened; duplicate filenames and hidden/symlink items are
rejected before upload.

The server checks the session, chooses the configured project folder, and
uploads with the user's Box OAuth token. It then starts the existing review
pipeline with the server Box and Bedrock credentials. A partial upload is
reported explicitly; it is not silently retried.

```json
{
  "uploaded": [{"name":"architecture.md","fileId":"1650233401","versionId":"1801102233"}],
  "runId": "example-run",
  "snapshotId": "S4",
  "mode": "mock",
  "evaluation": "pending"
}
```

These IDs are illustrative. Mock mode permits version uploads only for the
named fixture documents; its evaluator is the documented fixture stand-in.
`mode` is mandatory on both upload and state responses so a connected client
cannot label a mock server as live.

## 5. Detail links

Clicking a counter or notification opens:

```text
https://keel.example.com/projects/lantern?filter=review&snapshot=S4#SEC-ARCH-07
```

The web application must reauthorize that request using its normal browser
session. Native bearer tokens are never forwarded in detail URLs. The
`filter` values are `all`, `verified` and `review`.
The current demo routes an exact control anchor to `/finding/{controlId}`.
Without an anchor it opens the package view; package-wide filter selection
remains a web-UI enhancement.

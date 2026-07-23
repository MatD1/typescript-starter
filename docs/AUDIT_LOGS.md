# Audit Log Operations

Jrail keeps operational request telemetry in `request_log` and accountable
security/business activity in the append-only `audit_event` table. Audit
capture begins when migration `0017_massive_hitman.sql` is deployed; request
logs are not backfilled into the audit trail.

## Production configuration

Configure a dedicated S3-compatible bucket with versioning and Object Lock
enabled at bucket creation time. The archive credentials should be able to put,
read, and head objects, but must not be able to disable Object Lock, shorten
retention, overwrite versions, or delete retained objects.

Required production variables:

- `AUDIT_IP_HASH_SECRET`: dedicated secret for correlating client addresses
  without persisting raw IPs.
- `AUDIT_SIGNING_SECRET`: separate secret for signing chained manifests.
- `AUDIT_S3_ENDPOINT`, `AUDIT_S3_REGION`, and `AUDIT_S3_BUCKET`.
- `AUDIT_S3_ACCESS_KEY_ID` and `AUDIT_S3_SECRET_ACCESS_KEY`.
- `TRUST_PROXY=true` when Railway is the only trusted reverse proxy.

`AUDIT_ARCHIVE_DISABLED=true` is intended only for local development. The
readiness and admin system-health endpoints report missing production archive
configuration.

## Administrator API

Only a live, non-banned administrator session is accepted. API keys are never
accepted for these endpoints.

- `GET /api/v1/admin/audit-events`
- `GET /api/v1/admin/audit-events/:id`
- `GET /api/v1/admin/audit-events/summary`
- `POST /api/v1/admin/audit-events/exports`
- `GET /api/v1/admin/audit-events/exports/:id`
- `GET /api/v1/admin/audit-events/exports/:id/download`
- `GET /api/v1/admin/audit-archives`
- `POST /api/v1/admin/audit-archives/:id/verify`

Equivalent GraphQL operations are exposed as `adminAuditEvents`,
`adminAuditEvent`, `adminAuditSummary`, `adminCreateAuditExport`,
`adminAuditExport`, `adminAuditArchives`, and `adminVerifyAuditArchive`.

High-risk REST operations require `X-Audit-Reason` containing 10–1000
characters. Equivalent GraphQL mutations take a `reason` argument.

## Retention and recovery

At 02:15 UTC the previous complete UTC day is serialized in sequence order as
canonical JSON Lines, compressed, checksummed, and uploaded with a signed
manifest and seven-year compliance retention. Both objects are read back and
their checksums and lock state are verified before the archive becomes
`verified`.

At 03:30 UTC on the first day of each month, the database function
`audit_purge_verified_events()` removes at most 10,000 events older than 12
months. It only removes events covered by a verified, unexpired archive. Run it
again to drain a larger eligible backlog.

To restore an archive:

1. Download the data and manifest into an isolated recovery environment.
2. Verify the manifest HMAC, manifest-chain predecessor, object SHA-256, row
   count, sequence bounds, and UTC window.
3. Decompress into a staging table matching the archived event version.
4. Reject duplicate event IDs or sequences and any row outside the manifest
   window.
5. Query the staging table separately. Never insert restored rows into the live
   append-only table or disable its mutation trigger.

An integrity mismatch, archive lag over 48 hours, retry backlog, or critical
audit-gap log should page the operator. Do not purge online events while any
covering archive is missing or unverified.

# Logging Operations

The API has two complementary logging surfaces:

- Railway receives structured application logs on stdout/stderr. These contain
  severity, message, Nest context, service/environment metadata, and a minimal
  request object (`id`, method, and route) when emitted during a request.
- PostgreSQL `request_log` contains request telemetry used by the admin APIs and
  dashboard statistics. It is not a general application-log store.

## Configuration

- `LOG_LEVEL` accepts `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or
  `silent`. The legacy aliases `log` and `verbose` map to `info` and `trace`.
  Defaults are `info` in production and `debug` elsewhere.
- `SLOW_REQUEST_MS` defaults to `2000`. Requests above the threshold produce
  one structured warning in Railway.
- `REQUEST_LOG_RETENTION_DAYS` defaults to `30` and accepts 1–365 days. A daily
  job removes at most 10,000 expired rows per run.

`X-Request-ID` is returned on every request. A caller-supplied value is retained
only when it contains 8–128 letters, numbers, dots, underscores, colons, or
hyphens; otherwise the API generates a UUID. Use this ID to correlate Railway
application logs, admin request entries, and audit events.

## Data handling

Logging configuration excludes request/response bodies, query values, headers,
cookies, authorization values, API keys, passwords, and tokens. The request
table stores a keyed IP fingerprint, coarse network prefix, and truncated user
agent instead of a raw IP address. Migration `0018` clears historical raw IP
values; the deprecated `ipAddress` API field remains nullable for compatibility.

Expected REST 4xx responses are warnings and unexpected REST 5xx responses are
errors. Apollo owns GraphQL error logging so resolver failures are not duplicated
by the global exception filter. Successful requests are retained in
`request_log` but are not echoed to Railway; only slow requests are surfaced.

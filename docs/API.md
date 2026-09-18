# Ahaai API reference

The API is a standalone Hono service. Everything lives under `/api/v1`, except the unversioned
`GET /health` and `GET /health/ready`, which container health checks rely on.

Base URL in development: `http://localhost:3100/api/v1`. In the self-hosted bundle the API also serves
the frontend, so it is whatever origin you deployed to.

Error shape, unchanged across every endpoint:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Invalid request body", "details": [] } }
```

| Code | Status | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Body or query failed validation. |
| `UNAUTHORIZED` | 401 | Missing credentials, or the session is no longer valid. |
| `FORBIDDEN` | 403 | Cross-origin or cross-site request blocked. |
| `NOT_FOUND` | 404 | No such route, or no such resource for this user. |
| `CONFLICT` | 409 | Stale `revision` on an item update. |
| `RATE_LIMITED` | 429 | Includes `Retry-After`. |
| `UNPROCESSABLE` | 422 | Well-formed but semantically rejected. |
| `UPSTREAM` | 502 | HIBP or an AI provider failed. |
| `INTERNAL` | 500 | Never carries internal details. |

Every `/api/v1` request is subject to a coarse per-IP ceiling (`global`, 300/min) before the route's
own rule applies, so an endpoint without a named rule of its own is still throttled. Limits are shared
through Redis when `REDIS_URL` is set, and held per instance otherwise.

---

## Authentication

There is one kind of credential, the opaque 32-byte session token, and two ways to present it.

**Session cookie.** `ahaai_session`, `HttpOnly`, `SameSite=Lax`, `Secure` in production. This is what
the bundled web app uses. A state-changing cookie request must also pass an origin check: same-origin,
or an origin listed exactly in `CORS_ALLOWED_ORIGINS`.

**Bearer token.** `Authorization: Bearer <token>`, the same token value. This is what a browser
extension, a CLI, or a third-party client uses. Bearer requests skip the origin check, because a
browser never attaches that header on its own, so there is nothing to forge.

### POST /auth/token

Exchanges credentials for a bearer token. Sends no cookie, so an extension can use it directly.

```json
{ "email": "ada@example.com", "authHash": "<64 hex chars>" }
```

`200`:

```json
{
  "token": "<opaque>",
  "tokenType": "Bearer",
  "expiresAt": "<iso>",
  "user": { "id": "...", "email": "..." },
  "vault": { "protectedVaultKey": "v1...", "kdfParams": { } }
}
```

Rate limited like `login`. `401` with the generic message `Invalid email or master password`.

### CORS

Controlled by `CORS_ALLOWED_ORIGINS`, a comma-separated list.

- An exact origin, such as `https://app.example`, is echoed back with
  `Access-Control-Allow-Credentials: true` and is also trusted for cookie auth.
- A prefix wildcard, such as `chrome-extension://*`, is allowed to read responses and gets
  credentials, but is **not** trusted for cookie auth. Use a bearer token.
- A bare `*` exposes the API without credentials, and is not trusted for cookie auth either.

Preflight is answered with `204` and `Access-Control-Max-Age: 600`.

---

## Health

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | no |
| GET | `/health/ready` | no |

`/health` is a cheap liveness check that never touches a dependency:

```json
{ "status": "ok", "service": "ahaai-password-manager", "version": "0.1.0", "uptimeMs": 12345, "time": "<iso>" }
```

`/health/ready` runs a real check and answers `200`, or `503` when a dependency is down:

```json
{
  "status": "ok",
  "service": "ahaai-password-manager",
  "version": "0.1.0",
  "uptimeMs": 12345,
  "checks": { "database": { "status": "up", "latencyMs": 1 } },
  "rateLimiter": { "backend": "memory", "degraded": false }
}
```

A `redis` entry appears only when `REDIS_URL` is set, and `rateLimiter.degraded` is `true` when Redis
was configured but unreachable, which means limits are per instance rather than shared. The failure
reason is written to the log and never returned, because the route is unauthenticated.

---

## Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | no | rate: `register` 5/hour/IP |
| POST | `/auth/login` | no | rate: `login` 10/min/IP, `loginPerEmail` 5/min |
| POST | `/auth/token` | no | same limits as login; returns a bearer token |
| POST | `/auth/logout` | session | revokes the current session |
| GET | `/auth/prelogin` | no | per-user KDF parameters, or a deterministic decoy |
| GET | `/auth/session` | session | current user, session, settings |
| POST | `/auth/password` | session | change master password |
| GET | `/auth/sessions` | session | list active sessions |
| DELETE | `/auth/sessions/:id` | session | revoke one session |
| GET | `/auth/events` | session | audit log, paginated |

### POST /auth/register

```json
{
  "email": "ada@example.com",
  "authHash": "<64 hex chars>",
  "kdfParams": {
    "algo": "argon2id", "version": 1,
    "memoryKiB": 65536, "iterations": 3, "parallelism": 1,
    "salt": "<base64, >=16 bytes>"
  },
  "protectedVaultKey": "v1.<base64>.<base64>"
}
```

`201` plus `Set-Cookie: ahaai_session=...`:

```json
{
  "user": { "id": "...", "email": "...", "emailVerified": false,
            "securityStamp": "...", "createdAt": "...", "lastLoginAt": null },
  "vault": { "protectedVaultKey": "v1...", "kdfParams": { } },
  "expiresAt": "<iso>"
}
```

### POST /auth/login

```json
{ "email": "ada@example.com", "authHash": "<64 hex chars>" }
```

`200` with the same shape as register, or `401` with `Invalid email or master password`.

### GET /auth/prelogin

`?email=`. Returns the user's `kdfParams` so the client can derive before it authenticates. Unknown
emails get a deterministic decoy derived from the server pepper, so the endpoint cannot be used to
enumerate accounts.

### POST /auth/password

```json
{
  "currentAuthHash": "<64 hex>",
  "authHash": "<64 hex>",
  "kdfParams": { },
  "protectedVaultKey": "v1.<base64>.<base64>"
}
```

`200` `{ "securityStamp": "...", "revokedSessions": 1 }`. The current session stays valid and all
others are revoked. The vault key is re-wrapped, never replaced, so existing items keep working.

### GET /auth/events

`?limit=` (1 to 100, default 50) and `?before=` an ISO timestamp. Returns
`{ events: [...], nextCursor }`.

---

## Vault

All endpoints require a session. Items are opaque ciphertext to the server.

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/vault/items` | `limit`, `cursor`, `type`, `folderId`, `favorite`, `includeTrashed` |
| POST | `/vault/items` | create |
| POST | `/vault/items/bulk` | create 1–500 items in one transaction |
| GET | `/vault/items/:id` | |
| PATCH | `/vault/items/:id` | requires `revision` (optimistic concurrency) |
| DELETE | `/vault/items/:id` | soft delete, moves to trash |
| POST | `/vault/items/:id/restore` | |
| DELETE | `/vault/items/:id/purge` | permanent; the item must be trashed first |
| GET | `/vault/folders` | |
| POST | `/vault/folders` | `{ "nameEnc": "v1..." }` |
| PATCH | `/vault/folders/:id` | `{ "nameEnc": "v1..." }` |
| DELETE | `/vault/folders/:id` | items are detached (`folder_id` becomes null) |
| GET | `/vault/sync` | `since=<iso>`; changed items and folders |

Create body:

```json
{
  "id": "<uuid, optional, client generated so AAD can bind to it>",
  "type": "login",
  "nameEnc": "v1.<base64>.<base64>",
  "dataEnc": "v1.<base64>.<base64>",
  "notesEnc": "v1.<base64>.<base64>",
  "folderId": null,
  "favorite": false,
  "reprompt": false
}
```

Item response:

```json
{
  "id": "uuid", "type": "login", "nameEnc": "v1...", "notesEnc": "v1...",
  "dataEnc": "v1...", "folderId": null, "favorite": false, "reprompt": false,
  "revision": 1, "deletedAt": null, "createdAt": "...", "updatedAt": "..."
}
```

`409 CONFLICT` when `revision` is stale; the details carry `currentRevision`. Soft-deleted items appear
as tombstones in `/sync`; purged items require a full resync to notice.

### POST /vault/items/bulk

Creates many items in one request and one transaction, so a large import does not fire N sequential
writes (and does not trip the `vault` rate limit per item).

```json
{
  "items": [
    {
      "id": "<uuid, optional, client generated for AAD>",
      "type": "login",
      "nameEnc": "v1.<base64>.<base64>",
      "dataEnc": "v1.<base64>.<base64>",
      "notesEnc": null,
      "folderId": null,
      "favorite": false,
      "reprompt": false
    }
  ]
}
```

`201` with `{ "items": [ <item response>, ... ] }` in request order. Each element is the same shape as
the single-item response, and every `id` must be unique within the request. `400` when the array is
empty, longer than 500, or malformed. Any item referencing a folder the caller does not own fails the
whole request with `404` and rolls the transaction back.

---

## Import / export formats

Parsing and serialisation live in `@ahaai/core/transfer` as pure functions; the browser runs them, so a
CSV never reaches the API. `parseImport(content, format?)` sniffs the header when `format` is `"auto"`.

| Format | Detected by | Notes |
| --- | --- | --- |
| Bitwarden | `login_uri` / `login_username` / `login_password` / `login_totp` columns | login, card, identity and note rows; `fields` packs custom fields as `Label: value` lines |
| LastPass | `url` plus `grouping` or `extra` | logins only; `grouping` is the folder |
| 1Password | `Title` plus `OTPAuth`, or `Title`/`Username`/`Password` without `Group` | logins only |
| KeePass | `Group`+`Title`, or `Account`+`Login Name` | KeePassXC and KeePass 2.x layouts |
| generic | anything else with a name column | also reads the output of the generic export |

Malformed rows are collected into `skipped` rather than throwing. Exporters: `toBitwardenCsv` and
`toGenericCsv` (both plaintext). The web app's encrypted JSON export is a small
`{ format: "ahaai-export", version, createdAt, itemCount, kdfParams, payload }` envelope, where `payload`
is the AES-256-GCM seal of the serialized records under a key derived from a user passphrase with the
envelope's own `kdfParams`; the passphrase is independent of the master password.

---

## AI providers (BYOK)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/ai/providers` | providers (masked) plus the preset registry |
| POST | `/ai/providers` | store a provider; the key is encrypted at rest |
| PATCH | `/ai/providers/:id` | rotate the key, change the model, label, or base URL |
| DELETE | `/ai/providers/:id` | |
| POST | `/ai/providers/:id/test` | sends a minimal prompt |
| GET | `/ai/settings` | `{ aiMode, defaultProviderId }` |
| PUT | `/ai/settings` | `{ aiMode?: "local" | "cloud", defaultProviderId?: uuid | null }` |

Create body:

```json
{
  "presetId": "openai",
  "label": "main",
  "apiKey": "sk-...",
  "baseUrl": null,
  "defaultModel": "gpt-4o-mini",
  "isLocal": false
}
```

Response provider, which never includes the plaintext key:

```json
{
  "id": "uuid", "presetId": "openai", "label": "main", "baseUrl": null,
  "defaultModel": "gpt-4o-mini", "isLocal": false, "hasApiKey": true,
  "apiKeyMask": "********abcd", "createdAt": "...", "updatedAt": "..."
}
```

Presets: `openai`, `anthropic`, `google`, `openrouter`, `groq`, `mistral`, `deepseek`, `xai`, `azure`,
`ollama`, `lmstudio`, `vllm`, `custom-openai`.

---

## AI search

`POST /ai/search`, session required, rate `aiSearch` 30/min/user.

```json
{
  "query": "my duolingo alt",
  "mode": "cloud",
  "providerId": "uuid",
  "model": "gpt-4o-mini",
  "candidates": [
    { "token": "t_XXXXXXXXXXXXXXXXXXXXXX", "title": "Duolingo alt",
      "note": "second account", "domain": "duolingo.com" }
  ]
}
```

Response:

```json
{
  "matches": [
    { "token": "t_XXXXXXXXXXXXXXXXXXXXXX", "reason": "matches 'alt'", "score": 0.9 }
  ],
  "modelId": "gpt-4o-mini", "presetId": "openai", "isLocal": false,
  "mode": "cloud", "truncated": false
}
```

Notes:

- `token` must match `t_[A-Za-z0-9_-]{22}` and is minted fresh per request by the client.
- The client sends **title, note and domain only**, never usernames or passwords.
- Returned tokens are whitelisted against the request, so a hallucinated token is dropped.
- `truncated` is `true` when the candidate block exceeded the prompt budget.
- `mode` must match the provider's locality, otherwise `400`.

---

## Pwned Passwords

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/pwned/range?prefix=ABCDE` | no | rate `pwned` 60/min/IP |
| POST | `/pwned/range` | no | rate `pwnedBatch` 20/min/IP; body `{ "prefixes": ["ABCDE", ...] }`, 1 to 200 entries |

Only the 5-character SHA-1 prefix goes upstream, which is what k-anonymity means here. Results are
cached for 24 hours.

```json
{ "prefix": "ABCDE", "suffixes": "0018A45C4D1DEF81644B54AB7F969B88D65:3", "cached": false }
```

`POST` returns the same shapes in one call. Prefixes are validated, deduplicated and capped at 200,
and the upstream work fans out through a small pool, which is what makes a vault-wide sweep one round
trip instead of one request per password:

```json
{ "ranges": [ { "prefix": "ABCDE", "suffixes": "0018A45C4D1DEF81644B54AB7F969B88D65:3", "cached": false } ] }
```

The client hashes the password locally, sends only the prefix, and compares the returned suffixes
itself. The password and the full hash never leave the device.

---

## Client expectations

- Responses to API routes carry `Cache-Control: no-store`. Do not cache them.
- Requests should send `Content-Type: application/json` when there is a body.
- A bearer client should treat `401` as "re-authenticate with `POST /auth/token`".
- Optional `X-Device-Name` and `X-Device-Type` headers are recorded on the session and shown in the
  security panel.

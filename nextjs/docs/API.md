# Ahaai API reference

All endpoints live under `/api`. Cookies are `ahaai_session` (`HttpOnly`, `SameSite=Lax`, `Secure` in
production). State-changing requests are CSRF-protected and rate limited.

Error shape:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Invalid request body", "details": [] } }
```

Codes: `BAD_REQUEST` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409,
`RATE_LIMITED` 429 (with `Retry-After`), `UNPROCESSABLE` 422, `UPSTREAM` 502, `INTERNAL` 500.

---

## Health

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/health` | no |

`{ "status": "ok", "service": "ahaai-password-manager", "time": "<iso>" }`

---

## Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | no | rate: `register` 5/hour/IP |
| POST | `/api/auth/login` | no | rate: `login` 10/min/IP, `loginPerEmail` 5/min |
| POST | `/api/auth/logout` | session | revokes current session |
| GET | `/api/auth/session` | session | current user, session, settings |
| POST | `/api/auth/password` | session | change master password |
| GET | `/api/auth/sessions` | session | list active sessions |
| DELETE | `/api/auth/sessions/:id` | session | revoke one session |
| GET | `/api/auth/events` | session | audit log, paginated |

### POST /api/auth/register

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

### POST /api/auth/login

```json
{ "email": "ada@example.com", "authHash": "<64 hex chars>" }
```

`200` with the same shape as register, or `401` with the generic message
`Invalid email or master password`.

### POST /api/auth/password

```json
{
  "currentAuthHash": "<64 hex>",
  "authHash": "<64 hex>",
  "kdfParams": { },
  "protectedVaultKey": "v1.<base64>.<base64>"
}
```

`200` `{ "securityStamp": "...", "revokedSessions": 1 }`. The current session stays valid; all others
are revoked.

---

## Vault

All endpoints require a session. Items are opaque ciphertext to the server.

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/vault/items` | `limit`, `cursor`, `type`, `folderId`, `favorite`, `includeTrashed` |
| POST | `/api/vault/items` | create |
| GET | `/api/vault/items/:id` | |
| PATCH | `/api/vault/items/:id` | requires `revision` (optimistic concurrency) |
| DELETE | `/api/vault/items/:id` | soft delete → trash |
| POST | `/api/vault/items/:id/restore` | |
| DELETE | `/api/vault/items/:id/purge` | permanent; item must be trashed |
| GET | `/api/vault/folders` | |
| POST | `/api/vault/folders` | `{ "nameEnc": "v1..." }` |
| PATCH | `/api/vault/folders/:id` | `{ "nameEnc": "v1..." }` |
| DELETE | `/api/vault/folders/:id` | items are detached (`folder_id` → null) |
| GET | `/api/vault/sync` | `since=<iso>`; returns changed items and folders |

Create body:

```json
{
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

`409 CONFLICT` when `revision` is stale; the response details include `currentRevision`.
Soft-deleted items appear as tombstones in `/sync`; purged items require a full resync.

---

## AI providers (BYOK)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/ai/providers` | returns providers (masked) and the preset registry |
| POST | `/api/ai/providers` | store a provider; key encrypted at rest |
| PATCH | `/api/ai/providers/:id` | rotate key (`apiKey`), change model/label/base URL |
| DELETE | `/api/ai/providers/:id` | |
| POST | `/api/ai/providers/:id/test` | sends a minimal prompt |
| GET | `/api/ai/settings` | `{ aiMode, defaultProviderId }` |
| PUT | `/api/ai/settings` | `{ aiMode?: "local" \| "cloud", defaultProviderId?: uuid \| null }` |

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

Response provider (never includes the plaintext key):

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

`POST /api/ai/search` — session required, rate `aiSearch` 30/min/user.

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
- The client sends **title, note, domain only** — never usernames or passwords.
- Returned tokens are whitelisted against the request; hallucinated tokens are dropped.
- `truncated` is `true` when the candidate block exceeded the prompt budget.
- `mode` must match the provider locality, otherwise `400`.

---

## Pwned Passwords

`GET /api/pwned/range?prefix=ABCDE` — no auth, rate `pwned` 60/min/IP.

Only the 5-character SHA-1 prefix is sent upstream (k-anonymity). Results are cached for 24 hours.

```json
{ "prefix": "ABCDE", "suffixes": "0018A45C4D1DEF81644B54AB7F969B88D65:3", "cached": false }
```

The client hashes the password locally, sends the prefix, and compares the returned suffixes itself.
The password and the full hash never leave the device.

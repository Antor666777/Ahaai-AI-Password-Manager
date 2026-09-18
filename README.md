# Ahaai: your AI password manager

A zero-knowledge, Bitwarden-style password manager with an AI search that finds credentials by
plain-language intent instead of an exact site name.

Your master password, your vault key, and every plaintext credential stay in the browser. The server
stores ciphertext it cannot read, and the AI never receives a real credential.

**Status:** the functional core, the HTTP APIs, the interface, and the self-hosting packaging are all
in place, covered by 512 automated tests.

The API is a standalone service, not part of the frontend. That is what lets a browser extension or
any other client talk to it without depending on Next.js, and it is what makes self-hosting a single
container.

---

## Stack

| Concern | Choice |
| --- | --- |
| API | Hono on Node, bundled with Bun. Owns persistence, sessions, and the relays. |
| Frontend | Next.js 16 (App Router) with React 19, exported as static files |
| Language | TypeScript, strict |
| Database | PostgreSQL through Drizzle ORM, plus an embedded Postgres for development |
| Crypto | `@noble/hashes` (Argon2id, HKDF, SHA-256) and `@noble/ciphers` (AES-256-GCM) |
| AI | Vercel AI SDK, with BYOK presets for 13 hosted and local providers |
| Breach checks | HaveIBeenPwned Pwned Passwords, k-anonymity range queries |
| Rate limiting and cache | Redis when `REDIS_URL` is set, in-memory state otherwise |
| Interface | Tailwind v4, IBM Plex Sans, IBM Plex Mono, Fraunces for the brand moment |
| Tests | Vitest against in-memory Postgres through PGlite |
| Packaging | One Docker image serving the API and the frontend, or a single Bun binary |

---

## Why this exists

Reusing one password everywhere is easy to fix. Remembering *which* account is which is not. Once you
have a main login, an old alt, and a work login for the same service, a password manager that matches
on the site name cannot answer the question you actually have: which of my accounts is the alt one?

So Ahaai adds a search that takes a question. Asking for `my duolingo login` and asking for
`my alt duolingo account` are different questions, and they can return different entries.

---

## How the AI search stays private

The model is useful precisely because it reads your notes. The trick is making sure that is all it
reads.

1. The client, which already holds decrypted metadata in memory, mints a **fresh random token** for
   each candidate item, valid for this one request only. Tokens are never persisted and are not
   derived from item ids.
2. The client sends `{ token, title, note, domain }` plus the query. Usernames and passwords are never
   included.
3. The server resolves your own provider (BYOK), and sends the candidate list as untrusted data.
4. The model answers with tokens. **The output is whitelisted**: any token that was not sent is
   dropped, so a hallucinated or injected token cannot match anything.
5. The client maps the returned tokens back to its own items and decrypts locally.

There is a switch for where the model runs. In **This machine** mode the request goes to a runtime you
host, such as Ollama, LM Studio, or vLLM, and nothing leaves your computer. In **Hosted provider**
mode it goes to the provider you set as default, using your own key.

---

## Security model

### The hash and encryption key split

The master password is never transmitted. The client derives one master key and splits it into two
independent subkeys with HKDF-SHA256:

```
master password
      |  Argon2id (per-user salt, parameters stored on the server)
      v
  master key (32 bytes)
      |  HKDF-Expand  info="ahaai:auth:v1"
      +-------------> auth key  -> hashed again server-side -> stored
      |  HKDF-Expand  info="ahaai:enc:v1"
      +-------------> enc key   -> never leaves the device
```

- The **auth key** is what the server receives. It cannot be used to decrypt anything.
- The **enc key** unwraps your random 256-bit **vault key**, which encrypts every item.
- Changing the master password only re-wraps the same vault key. Items are never re-encrypted, so a
  password change cannot orphan your data.

### What the server holds

`users.auth_hash` is `Argon2id(auth_key, per-user salt, server pepper)`. The server also stores the
wrapped vault key, the KDF parameters, and ciphertext. It cannot read a single vault item.

Item ciphertext is bound to its item through additional authenticated data
(`ahaai:item:v1:<itemId>:<field>`), which is why the client generates the item id and sends it at
create time.

### Sessions

Opaque 32-byte tokens; only `SHA-256(token)` is stored. Sessions are revocable, rotate on privilege
changes, and detect token reuse. Reuse revokes the session and writes a critical audit event.

### Other protections

- AES-256-GCM envelopes, `v1.<nonce>.<ciphertext+tag>`.
- Login throttling with progressive lockout, and generic errors that avoid user enumeration.
- CSRF protection through Origin and `Sec-Fetch-Site` checks on state-changing requests, skipped for
  bearer calls, which a browser never attaches on its own. Only an origin listed exactly in
  `CORS_ALLOWED_ORIGINS` is trusted, so a wildcard cannot be used to act with a session cookie.
- Zod validation and body-size caps on every endpoint, with a logger that never records request bodies.
- BYOK provider keys encrypted at rest and only ever returned masked.
- SSRF guard on user-supplied AI base URLs, with cloud metadata endpoints blocked.
- Security headers (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP).

---

## Clients other than the interface

The API is deliberately independent of the frontend, so a browser extension, a CLI, or a third-party
app can use it without pulling in Next.js.

1. `POST /api/v1/auth/token` with the same `email` and `authHash` a login sends. It returns a bearer
   token in the body and sets no cookie.
2. Send `Authorization: Bearer <token>` on every call.
3. Add the client's origin to `CORS_ALLOWED_ORIGINS`. `chrome-extension://*` lets any extension read
   responses, and such clients must use the bearer token, because a wildcard is never trusted for
   cookie auth.

Cryptography stays in the client, so an extension derives the vault key in its own context exactly as
the web app does, importing the same `packages/core` code rather than reimplementing it. That is the
main reason that package exists.

The full endpoint list, the CORS rules, and the error codes are in [`docs/API.md`](./docs/API.md).

---

## Quick start

Requires Node.js 20.9 or newer, and Bun for packaging.

### Local development

```bash
git clone https://github.com/Antor666777/Ahaai-AI-Password-Manager.git
cd Ahaai-AI-Password-Manager

npm install

# Generate each secret with:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# then fill AUTH_PEPPER and ENCRYPTION_MASTER_KEY in apps/api/.env

npm run dev:api    # API on http://localhost:3100
npm run dev:web    # interface on http://localhost:3000
```

Open http://localhost:3000.

**No database is required.** With `DATABASE_URL` unset and `AHAALI_ALLOW_EMBEDDED_DB=1`, the API boots
an embedded Postgres at `apps/api/.data/ahaai-dev` and applies migrations at startup, so the whole
product runs with zero setup. Set `DATABASE_URL` to use a real server instead. The embedded mode is
deliberately independent of `NODE_ENV`, so it still works in a shell that exports
`NODE_ENV=production`.

In development the interface and the API are on different ports, so the API trusts
`http://localhost:3000` as an origin. Anything that is not the bundled interface, including a browser
extension, uses a bearer token instead of the session cookie.

### Self-hosting

```bash
cd docker
cp .env.example .env    # set AUTH_PEPPER, ENCRYPTION_MASTER_KEY and POSTGRES_PASSWORD
docker compose up -d
```

Open http://localhost:3001. See [docs/SELF-HOSTING.md](./docs/SELF-HOSTING.md) for TLS, backups, the
configuration table, and the single-binary alternative.

### Environment

The API reads `apps/api/.env` in development and `docker/.env` for Compose. The frontend needs only
`NEXT_PUBLIC_API_BASE_URL`, and only when it is not served by the API.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_PEPPER` | Yes | Server-side pepper mixed into the stored auth hash. 16+ characters, 32 random bytes as base64 is ideal. Changing it invalidates every login. |
| `ENCRYPTION_MASTER_KEY` | Yes | Encrypts BYOK provider keys at rest. Exactly 32 bytes as base64. Losing it makes stored provider keys unrecoverable. |
| `DATABASE_URL` | No | Real Postgres. Without it, the embedded database is used in development. |
| `AHAALI_ALLOW_EMBEDDED_DB` | No | Set to `1` to permit the embedded database when `DATABASE_URL` is unset. |
| `PORT` | No | API port. Defaults to 3001. |
| `CORS_ALLOWED_ORIGINS` | No | Browser clients other than the bundled frontend, comma separated. An exact origin is trusted for cookie auth; a wildcard must use a bearer token. |
| `COOKIE_SECURE` | No | Sets `Secure` on the session cookie. Defaults to on when `NODE_ENV=production`. Set to `false` when serving plain HTTP, or sign in silently does nothing. |
| `TRUST_PROXY` | No | Whether `x-forwarded-for` may be believed. Defaults to trusting it, so set `0` when the API is directly reachable. |
| `SERVE_STATIC` | No | Set to `1` to serve the exported frontend from the API. |
| `STATIC_ROOT` | No | Where the exported frontend lives. Defaults to `../web/out`. |
| `REDIS_URL` | No | Shared rate limiting and HIBP cache. Falls back to in-memory state when unset. |
| `SESSION_TTL_DAYS` | No | Session lifetime, absolute from sign in. Defaults to 30. |
| `HIBP_USER_AGENT` | No | User agent for HaveIBeenPwned, which requires an identifiable one. |
| `OPENAI_API_KEY` and similar | No | Optional fallback credentials that presets can pick up from the environment. |

### Scripts

Run these from the repository root. Workspace-specific scripts are forwarded with `--workspace`.

| Script | What it does |
| --- | --- |
| `npm run dev:api` | API on port 3100, with reload. |
| `npm run dev:web` | Interface on port 3000. |
| `npm test` | Vitest across every workspace. Uses in-memory Postgres, so no Docker or services are needed. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run typecheck` | `tsc --noEmit` in every workspace. |
| `npm run build` | Static export of the interface, then the API bundle. |
| `npm run compile --workspace @ahaai/api` | Single-file binary with the migrations inlined. |
| `npm run lint` | ESLint. |
| `npm run db:generate --workspace @ahaai/db` | Generate migrations from the Drizzle schema. |
| `npm run db:embed --workspace @ahaai/db` | Regenerate the inlined migration copy after changing migrations. |
| `npm run db:studio --workspace @ahaai/db` | Browse the database with Drizzle Studio. |

### Troubleshooting

If a dependency looks missing after install, check `npm config get omit`. A shell or global npm config
that sets `omit=dev` silently skips dev dependencies, and `npm install --include=dev` forces them in.

---

## Interface

| Route | Surface |
| --- | --- |
| `/` | Landing and auth. |
| `/unlock` | Master password unlock. The key lives only in that tab, in memory. |
| `/vault` | The vault: AI search, filters, sorting, multi-select, list, inspector, and editor. |
| `/vault/health` | Password health: breached, reused, weak and stale credentials. |
| `/vault/settings` | Search mode, BYOK providers, import and export, and account access. |
| `/vault/security` | Active sessions and the audit timeline. |
| `/vault/trash` | Restore or purge one item, or a selected batch. |

Design rules the interface follows: the 1-4-9 spacing rhythm, three depth planes, a 60 to 76
character measure on prose, `:focus-visible` rings that are never removed, real labels on every field
rather than placeholders, a submit button that stays enabled until the request starts, no state
carried by colour alone, and copy with no em dashes, no exclamation points, and one verb per button.

The vault is keyboard operable: `Cmd K` opens a command palette for jumping to an item or running an
action, `Cmd N` starts a new item, `/` focuses search, and `?` lists the rest. An item marked for
reprompt asks for the master password again before it shows a secret. An unmatched path or a failed
route renders inside the app's own shell rather than the host's, when the host is pointed at the
exported `404.html` (see [`docs/SELF-HOSTING.md`](./docs/SELF-HOSTING.md)).

---

## Project layout

```
package.json          npm workspaces root: shared scripts and one test runner
apps/
  api/                Hono service: routes, middleware, config, Node and Bun entry points
  web/                Next.js interface, exported as static files
packages/
  core/               crypto, auth, vault, AI, HIBP, rate limiting, cache
  db/                 Drizzle schema, migrations, and the inlined migration copy
  testing/            shared PGlite harness and request helpers
docker/               Dockerfile, docker-compose.yml, runtime manifest
docs/                 API.md, SELF-HOSTING.md
```

`packages/core` holds everything that is not tied to a framework, and `packages/db` holds the schema.
The API, the tests and the browser layer all consume them, so the security-critical code has exactly
one implementation rather than a copy per runtime.

Every API route authenticates itself through `requireAuth`. Middleware handles the security headers,
CORS and the origin check, and is never an authorization boundary.

---

## Testing

`npm test` runs 512 tests with Vitest against an in-memory Postgres through PGlite, so no external
services are needed. Coverage includes the key derivation and split, AEAD envelopes, tokenization,
session rotation and reuse detection, vault services with optimistic concurrency, the AI search
pipeline, the HIBP proxy, the rate limiter backends, the provider and mode resolution, RFC 6238 TOTP
against the published vectors, the Bitwarden, LastPass, 1Password and KeePass import mappers, the
password-health classifier, the encrypted export envelope, the readiness probe, the item-revision
history and its restore path, tag assignment and the tag filter, bulk item actions, and the exported
404 fallback.

The API routes are covered end to end by calling the Hono app directly with a real database and no
network: registration, login and logout, the whole item lifecycle including a stale-revision conflict,
folder detachment, cross-user isolation, bearer auth from an extension origin, CORS preflight, the
origin trust rules, and rate limiting.

The AI search is covered by tests against a stubbed model, including the token whitelist. It has not
been exercised against a live provider, because a provider key is required for that.

---

## Deferred by design

- **Account recovery.** A direct consequence of zero-knowledge: a lost master password means lost
  data. There is no reset that could not also be used by someone else.
- Email verification and password reset, which need outbound email.
- Two-factor authentication on the account itself. Login items already store a TOTP secret and
  generate live codes locally; requiring a second factor to sign in is the remaining step.
- Organizations, collections, sharing, and attachments.
- Streaming chat over the vault.
- Narrow-viewport verification below 1024px. The automation used exposes no viewport control, so
  reflow was reviewed in code rather than on screen.

---

## Documentation

- [`docs/API.md`](./docs/API.md): the endpoint reference, bearer auth, and the CORS rules.
- [`docs/SELF-HOSTING.md`](./docs/SELF-HOSTING.md): Docker Compose, TLS, backups, and the binary.

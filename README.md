# Ahaai: your AI password manager

A zero-knowledge, Bitwarden-style password manager with an AI search that finds credentials by
plain-language intent instead of an exact site name.

Your master password, your vault key, and every plaintext credential stay in the browser. The server
stores ciphertext it cannot read, and the AI never receives a real credential.

**Status:** the functional core, the HTTP APIs, and the interface are all in place, covered by 180
automated tests.

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) with React 19 |
| Language | TypeScript, strict |
| Database | PostgreSQL through Drizzle ORM, plus an embedded Postgres for development |
| Crypto | `@noble/hashes` (Argon2id, HKDF, SHA-256) and `@noble/ciphers` (AES-256-GCM) |
| AI | Vercel AI SDK, with BYOK presets for 13 hosted and local providers |
| Breach checks | HaveIBeenPwned Pwned Passwords, k-anonymity range queries |
| Rate limiting and cache | Redis when `REDIS_URL` is set, in-memory state otherwise |
| Interface | Tailwind v4, IBM Plex Sans, IBM Plex Mono, Fraunces for the brand moment |
| Tests | Vitest against in-memory Postgres through PGlite |

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
- CSRF protection through Origin and `Sec-Fetch-Site` checks on state-changing requests.
- Zod validation and body-size caps on every endpoint, with a logger that never records request bodies.
- BYOK provider keys encrypted at rest and only ever returned masked.
- SSRF guard on user-supplied AI base URLs, with cloud metadata endpoints blocked.
- Security headers (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP).

---

## Quick start

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/Antor666777/Ahaai-AI-Password-Manager.git
cd Ahaai-AI-Password-Manager/nextjs

npm install

# Generate each required secret with:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

cp .env.example .env
# then fill in AUTH_PEPPER and ENCRYPTION_MASTER_KEY

npm run dev
```

Open http://localhost:3000.

**No database is required for local development.** With `DATABASE_URL` unset, the app boots an
embedded Postgres at `nextjs/.data/ahaai-dev` and applies migrations at startup, so you can run the
whole product with zero setup. Set `DATABASE_URL` to use a real server instead. The embedded mode is
opt-in through `AHAALI_ALLOW_EMBEDDED_DB=1` and is deliberately independent of `NODE_ENV`, so it still
works in a shell that exports `NODE_ENV=production`.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_PEPPER` | Yes | Server-side pepper mixed into the stored auth hash. 32 random bytes as base64. |
| `ENCRYPTION_MASTER_KEY` | Yes | Encrypts BYOK provider keys at rest. Exactly 32 bytes as base64. |
| `DATABASE_URL` | No | Real Postgres. Without it, the embedded database is used in development. |
| `AHAALI_ALLOW_EMBEDDED_DB` | No | Set to `1` to permit the embedded database when `DATABASE_URL` is unset. |
| `REDIS_URL` | No | Shared rate limiting and HIBP cache. Falls back to in-memory state when unset. |
| `SESSION_TTL_DAYS` | No | Sliding session lifetime. Defaults to 30. |
| `HIBP_USER_AGENT` | No | User agent for HaveIBeenPwned, which requires an identifiable one. |
| `OPENAI_API_KEY` and similar | No | Optional fallback credentials that presets can pick up from the environment. |

### Scripts

Run these from `nextjs/`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm test` | Vitest. Uses in-memory Postgres, so no Docker or services are needed. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run db:generate` | Generate migrations from the Drizzle schema. |
| `npm run db:migrate` | Apply migrations. |
| `npm run db:push` | Push the schema directly to the database. |
| `npm run db:studio` | Browse the database with Drizzle Studio. |

### Troubleshooting

If a dependency looks missing after install, check `npm config get omit`. A shell or global npm config
that sets `omit=dev` silently skips dev dependencies, and `npm install --include=dev` forces them in.

---

## Interface

| Route | Surface |
| --- | --- |
| `/` | Landing and auth. |
| `/unlock` | Master password unlock. The key lives only in that tab, in memory. |
| `/vault` | The vault: AI search, filters, item list, inspector, and editor. |
| `/vault/settings` | Search mode, BYOK providers, and account access. |
| `/vault/security` | Active sessions and the audit timeline. |
| `/vault/trash` | Restore or purge, with confirmation that names the item. |

Design rules the interface follows: the 1-4-9 spacing rhythm, three depth planes, a 60 to 76
character measure on prose, `:focus-visible` rings that are never removed, real labels on every field
rather than placeholders, a submit button that stays enabled until the request starts, no state
carried by colour alone, and copy with no em dashes, no exclamation points, and one verb per button.

---

## Project layout

The application lives in the `nextjs/` directory.

```
nextjs/
  app/                pages and route handlers (auth, vault, ai, pwned, health)
  components/ui/      design-system primitives
  components/app/     product components (shell, vault, item, search, settings, security)
  components/brand/   landing surface pieces
  lib/client/         browser layer: typed API client, item crypto, session and vault providers
  lib/crypto/         KDF, key split, AEAD envelopes, vault key, tokenization
  lib/auth/           sessions, password hashing, audit log, guard, CSRF
  lib/db/             Drizzle schema, client, embedded dev database, migrations
  lib/vault/          item and folder services
  lib/ai/             provider presets, BYOK storage, resolver, search
  lib/hibp/           Pwned Passwords proxy with caching
  lib/rate-limit/     limiter interface, memory and Redis backends
  lib/cache/          cache interface, memory and Redis backends
  proxy.ts            security headers (not an auth boundary)
  test/               helpers and the PGlite harness
  docs/API.md         full endpoint reference
```

Every route handler authenticates itself through `requireAuth`. `proxy.ts` only sets security
headers, and is never an authorization boundary.

---

## Testing

`npm test` runs 180 tests with Vitest against an in-memory Postgres through PGlite, so no external
services are needed. Coverage includes the key derivation and split, AEAD envelopes, tokenization,
session rotation and reuse detection, vault services with optimistic concurrency, the AI search
pipeline, the HIBP proxy, the rate limiter backends, and the provider and mode resolution.

The AI search is covered by tests against a stubbed model, including the token whitelist. It has not
been exercised against a live provider, because a provider key is required for that.

---

## Deferred by design

- **Account recovery.** A direct consequence of zero-knowledge: a lost master password means lost
  data. There is no reset that could not also be used by someone else.
- Email verification and password reset, which need outbound email.
- Two-factor authentication. TOTP is the natural next step.
- Organizations, collections, sharing, and attachments.
- Streaming chat over the vault.
- Narrow-viewport verification below 1024px. The automation used exposes no viewport control, so
  reflow was reviewed in code rather than on screen.

---

## Documentation

- [`nextjs/docs/API.md`](./nextjs/docs/API.md): the full endpoint reference.

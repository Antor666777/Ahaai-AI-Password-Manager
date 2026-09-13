# Ahaai — your AI password manager

Zero-knowledge, Bitwarden-style password manager with an AI search that finds credentials by
natural-language intent. The server never sees your master password, your encryption key, or any
plaintext credential.

**Status:** functional core, HTTP APIs, and the interface are all in place.

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Drizzle ORM |
| Crypto | `@noble/hashes` (Argon2id, HKDF), `@noble/ciphers` (AES-256-GCM), Web Crypto |
| AI | Vercel AI SDK with BYOK provider presets (cloud + local) |
| Breach checks | HaveIBeenPwned Pwned Passwords (k-anonymity) |
| Rate limiting | Redis when `REDIS_URL` is set, in-memory fallback |
| Tests | Vitest against in-memory Postgres (PGlite) |
| Interface | Next.js App Router, Tailwind v4, IBM Plex Sans, IBM Plex Mono, Fraunces for the brand moment |

---

## Quick start

```bash
cd nextjs
npm install --include=dev

# Local secrets (gitignored). Generate each value with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
cp .env.example .env.local
# Required: AUTH_PEPPER, ENCRYPTION_MASTER_KEY
#
# DATABASE_URL is optional in development. Without it the app boots an embedded
# Postgres at ./.data/ahaai-dev and applies migrations on startup, so the UI runs
# with zero setup. Set DATABASE_URL to use a real server.

npm run dev             # http://localhost:3000

npm test                # Vitest (no external services needed)
npm run typecheck
npm run lint
```

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## How the security model works

### Hash vs encryption key split

The master password is never transmitted. The client derives one master key and splits it into two
independent subkeys via HKDF-SHA256:

```
master password
      │  Argon2id (per-user salt, params stored on the server)
      ▼
  master key (32 B)
      │  HKDF-Expand  info="ahaai:auth:v1"
      ├──────────────► auth key   → hashed again server-side → stored
      │  HKDF-Expand  info="ahaai:enc:v1"
      └──────────────► enc key    → NEVER leaves the device
```

- The **auth key** is what the server receives. It is unusable for decryption.
- The **enc key** unwraps the user's random 256-bit **vault key**, which encrypts every item.
- Changing the master password only re-wraps the same vault key; items are not re-encrypted.

### What the server stores

`users.auth_hash` is `Argon2id(auth_key, per-user salt, server pepper)`. The server also stores the
wrapped vault key, KDF parameters, and ciphertext. It cannot read any vault item.

### Sessions

Opaque 32-byte tokens; only `SHA-256(token)` is stored. Sessions are revocable, rotate on privilege
changes, and detect token reuse (reuse revokes the session and logs a critical event).

---

## AI search without leaking your vault

The AI never receives a real credential ID, a username, or a password.

1. The client (which already holds decrypted metadata in memory) mints a **fresh random token** per
   candidate item for this request only. Tokens are never persisted and are not derived from item IDs.
2. The client sends `{ token, title, note, domain }` plus the query. Usernames and passwords are never
   included.
3. The server resolves the user's BYOK provider, calls the model with a prompt that treats the
   candidate list as untrusted data, and receives back tokens.
4. **Output is whitelisted**: any token that was not sent is dropped, duplicates removed, scores
   clamped, results capped.
5. The client maps returned tokens back to its own items and decrypts locally.

The local/cloud toggle is enforced: a local mode request must use a local provider (Ollama, LM Studio,
vLLM) and a cloud request must use a cloud provider. Provider API keys are encrypted at rest with
`ENCRYPTION_MASTER_KEY` and only ever returned masked. Custom base URLs are SSRF-guarded.

---

## Interface

The interface is a warm "archive" theme: parchment surfaces, an ink text ramp, copper for actions,
and verdigris reserved for verified and AI-match signals. Dark mode is an authored second theme, not
an inversion. Tokens live in `app/globals.css`.

| Route | Surface |
| --- | --- |
| `/` | Landing and auth. The proof artifact shows the token swap: the AI matches against opaque tokens while the credential stays sealed. |
| `/unlock` | Master password unlock. The key exists only in that tab, in memory. |
| `/vault` | The vault: AI search bar, filters, dense item list, and an item inspector and editor. |
| `/vault/settings` | Configure: local vs cloud mode, BYOK providers, and account access. |
| `/vault/security` | Monitor: active sessions and the audit timeline. |
| `/vault/trash` | Restore or purge, with confirmation that names the item. |

Design rules the interface follows: the 1-4-9 spacing rhythm, three depth planes, 60-76 character
measure on prose, `:focus-visible` rings that are never removed, real labels on every field, submit
enabled until the request starts and a spinner that keeps its label, no state carried by colour
alone, and copy with no em dashes, no exclamation points, and one verb per button.

---

## Project layout

```
app/                pages and route handlers (auth, vault, ai, pwned, health)
components/ui/      design-system primitives (button, field, overlay, controls, data, feedback)
components/app/     product components (shell, vault, item, search, settings, security, trash)
components/brand/   landing surface pieces
lib/client/         browser layer: typed API client, KDF/AEAD item crypto, session + vault providers
lib/crypto/         KDF, key split, AEAD envelopes, vault key, tokenization
lib/auth/           sessions, password hashing, audit log, guard, CSRF
lib/db/             Drizzle schema, client, embedded dev database, types, migrations
lib/vault/          item + folder services and schemas
lib/ai/             provider presets, BYOK storage, resolver, search
lib/hibp/           Pwned Passwords proxy with caching
lib/rate-limit/     limiter interface, memory + Redis backends
lib/cache/          cache interface, memory + Redis backends
proxy.ts            security headers (not an auth boundary)
test/               helpers, PGlite harness, proxy test
docs/API.md         full endpoint reference
```

Every route handler authenticates itself via `requireAuth`; `proxy.ts` only sets security headers.
Item ciphertext binds to its item through AAD (`ahaai:item:v1:<itemId>:<field>`), which is why the
client generates the item id and sends it at create time.

---

## Security features

- Argon2id for both client KDF and server-side re-hashing, with a server pepper.
- AES-256-GCM with AAD binding (`v1.<nonce>.<ciphertext+tag>` envelopes).
- Session tokens stored hashed; rotation, reuse detection, revocation, per-session device info.
- Audit log (`security_events`) for register, login success/failure, logout, password change, session
  revocation, vault mutations, provider changes, AI searches.
- Login throttling with progressive lockout; generic auth errors to prevent user enumeration.
- CSRF protection via Origin / `Sec-Fetch-Site` checks on state-changing requests.
- Zod validation and body-size caps on every endpoint; redacting logger that never logs request bodies.
- SSRF guard on user-supplied AI base URLs; cloud metadata endpoints blocked.
- Security headers (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP).

---

## Deferred

- Account recovery (a direct consequence of zero-knowledge: a lost master password means lost data).
- Email sending: verification and password reset.
- Two-factor authentication (TOTP is the natural next step).
- Organizations, collections, sharing, attachments.
- Streaming chat over the vault (search currently returns matched items only).
- Browser verification below 1024px. The automation CLI used exposes no viewport control, so narrow
  reflow was reviewed in code (logical properties, no fixed widths, 1rem inputs under 640px) rather
  than on screen. Desktop at 1264px and the dark theme were verified in a real browser.

See [`docs/API.md`](./docs/API.md) for the endpoint reference.

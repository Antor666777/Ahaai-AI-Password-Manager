# Self-hosting Ahaai

Ahaai is two pieces: a Hono API that owns persistence, sessions, and the AI and breach-check relays,
and a static frontend that does all the cryptography in the browser. The API can serve that frontend,
which keeps everything on one origin and makes the whole product one container plus a database.

---

## Docker Compose, the short version

```bash
git clone https://github.com/Antor666777/Ahaai-AI-Password-Manager.git
cd Ahaai-AI-Password-Manager/docker

cp .env.example .env

# Generate each secret:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Fill in AUTH_PEPPER, ENCRYPTION_MASTER_KEY and POSTGRES_PASSWORD in .env, then:
docker compose up -d
```

Open <http://localhost:3001>. Migrations run automatically on the first boot.

Two containers start: `api` and `db`. Data lives in the `pgdata` volume. Nothing else is required.

### About those two secrets

- `AUTH_PEPPER` is mixed into every stored auth hash. Changing it invalidates every login.
- `ENCRYPTION_MASTER_KEY` encrypts BYOK provider keys at rest. **If you lose it, stored provider keys
  cannot be recovered.** Back it up somewhere other than the database, because a database backup
  alone will not save you: without this key the provider keys inside it stay unreadable.

The API refuses to start when either is missing, and tells you how to generate one.

---

## Configuration

Set these in `docker/.env` for Compose, or in the environment for a binary.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AUTH_PEPPER` | Yes | none | Pepper for stored auth hashes. 16+ characters. |
| `ENCRYPTION_MASTER_KEY` | Yes | none | Encrypts BYOK keys at rest. Exactly 32 bytes, base64. |
| `DATABASE_URL` | Docker: yes | none | Postgres connection string. |
| `POSTGRES_PASSWORD` | Compose: yes | none | Password for the bundled Postgres. |
| `PORT` | No | `3001` | Port the API listens on. |
| `COOKIE_SECURE` | No | `false` in Compose | Sets `Secure` on the session cookie. Turn on with TLS. |
| `TRUST_PROXY` | No | `0` in Compose | Whether `x-forwarded-for` may be believed. |
| `CORS_ALLOWED_ORIGINS` | No | empty | Browser clients other than the bundled frontend, comma separated. |
| `REDIS_URL` | No | none | Shared rate limiting and caching. Falls back to per-instance memory. |
| `SESSION_TTL_DAYS` | No | `30` | Session lifetime, absolute from sign in. |
| `SERVE_STATIC` | No | `1` in the image | Serve the exported frontend from the API. |
| `STATIC_ROOT` | No | `/app/web` in the image | Where the exported frontend lives. |
| `AHAALI_MIGRATIONS_DIR` | No | `/app/drizzle` in the image | Migration folder, since a bundle cannot find it by itself. |
| `HIBP_USER_AGENT` | No | `Ahaai-Password-Manager` | User agent for HaveIBeenPwned, which requires an identifiable one. |

### `COOKIE_SECURE` matters more than it looks

A production build defaults the session cookie to `Secure`, and a browser silently drops a `Secure`
cookie served over plain HTTP. That failure looks like "sign in does nothing". Compose therefore
defaults it to `false` so a fresh HTTP deployment works. **Turn it on once you terminate TLS.**

### `TRUST_PROXY` matters for rate limiting

With `TRUST_PROXY=1` the API believes `x-forwarded-for`. That is correct behind a proxy or platform
edge that overwrites it, and wrong when the API is directly reachable, because then any caller can
invent an IP and slip past the per-IP login limits. Compose defaults to `0` because the API is the
edge there. Set it to `1` when you put a reverse proxy in front.

---

## Putting it behind TLS

Terminate TLS at a reverse proxy and forward to the API. Caddy needs two lines:

```
ahaai.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

Then set `COOKIE_SECURE=true` and `TRUST_PROXY=1`, and restart. Caddy obtains a certificate on its
own. Nothing in the app needs to know it is behind TLS beyond those two flags.

---

## Whether you need Redis

No, but read this before scaling out. Without `REDIS_URL`, rate limiting and the breach-check cache
live in process memory. That is correct for a single instance. With more than one instance the limits
become per instance, so the effective login limit multiplies by the number of replicas. The API logs
a warning when it falls back for that reason.

---

## Backups

Back up two things, and keep them separate:

1. The `pgdata` volume, or a `pg_dump` of the database.
2. The `ENCRYPTION_MASTER_KEY` value.

A database backup without the key restores every row but leaves stored provider keys unreadable.
Vault items are unaffected by this, because the server only ever holds ciphertext that the client
encrypts with a key derived from the master password.

---

## Upgrades

```bash
cd docker
git pull
docker compose build
docker compose up -d
```

Migrations run at boot and are idempotent, so a restart applies whatever is new and does nothing
otherwise.

---

## Without Docker: one binary

```bash
npm install
npm run compile --workspace @ahaai/api
```

That writes `apps/api/dist/ahaai-server`. It is self-contained, including the migrations, so it needs
no source tree and no `node_modules`. Point it at a real Postgres:

```bash
AUTH_PEPPER=... \
ENCRYPTION_MASTER_KEY=... \
DATABASE_URL=postgres://user:pass@host:5432/ahaai \
PORT=3001 \
./ahaai-server
```

Two things to know about the binary:

- **It requires Postgres.** The embedded zero-setup database is a development feature and cannot load
  its WebAssembly asset inside a compiled binary. Asking for it gives an error that says exactly that.
- It is roughly 85 MB, because the Bun runtime is embedded.

To serve the frontend from the binary as well, build the export and point at it:

```bash
npm run build --workspace @ahaai/web
SERVE_STATIC=1 STATIC_ROOT=./apps/web/out ./ahaai-server
```

---

## Development instead of self-hosting

```bash
npm install
npm run dev:api    # http://localhost:3100
npm run dev:web    # http://localhost:3000
```

No database is required. With `DATABASE_URL` unset and `AHAALI_ALLOW_EMBEDDED_DB=1`, the API boots an
embedded Postgres at `apps/api/.data/ahaai-dev` and applies migrations at startup. The web dev server
talks to the API cross-origin, which is why `apps/api/.env` lists `http://localhost:3000` as a
trusted origin.

---

## Troubleshooting

**"Invalid environment configuration"** names the variable and prints the command to generate it.
Usually `AUTH_PEPPER` or `ENCRYPTION_MASTER_KEY` is missing, or the master key is not exactly 32
bytes of base64.

**Sign in does nothing, with no error.** The session cookie is `Secure` but the origin is plain HTTP.
Set `COOKIE_SECURE=false`.

**Login works but the vault stays empty on a second device.** Expected. The vault key is unwrapped
from the master password in the browser and never leaves it. An empty vault on a device where the
password was entered incorrectly would fail the GCM tag check instead.

**A dependency looks missing after `npm install`.** Check `npm config get omit`. A shell or global npm
config that sets `omit=dev` silently skips dev dependencies, and `npm install --include=dev` forces
them in.

**CORS errors from an extension.** Add its origin to `CORS_ALLOWED_ORIGINS`. Extensions should use a
bearer token from `POST /api/v1/auth/token`. A wildcard entry such as `chrome-extension://*` may read
responses, but is deliberately not trusted for cookie auth, so an extension cannot act with your
session cookie.

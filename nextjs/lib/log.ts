type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEYS = new Set(
  [
    "password",
    "passphrase",
    "masterpassword",
    "master_password",
    "authhash",
    "auth_hash",
    "currenthash",
    "token",
    "sessiontoken",
    "apikey",
    "api_key",
    "apikeyenc",
    "api_key_enc",
    "protectedvaultkey",
    "protected_vault_key",
    "vaultkey",
    "vault_key",
    "enckey",
    "enc_key",
    "masterkey",
    "master_key",
    "secret",
    "note",
    "notes",
    "notes_enc",
    "notesenc",
    "data_enc",
    "dataenc",
    "name_enc",
    "nameenc",
    "salt",
    "auth_salt",
    "authsalt",
    "cookies",
    "cookie",
    "set-cookie",
  ].map((key) => key.toLowerCase()),
);

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[redacted]";
    } else {
      result[key] = redact(entry, seen);
    }
  }
  return result;
}

const MIN_LEVEL: Level =
  process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV === "development"
    ? "debug"
    : "info";

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? (redact(meta, new WeakSet()) as Record<string, unknown>) : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (message, meta) => emit("debug", message, { ...bindings, ...meta }),
    info: (message, meta) => emit("info", message, { ...bindings, ...meta }),
    warn: (message, meta) => emit("warn", message, { ...bindings, ...meta }),
    error: (message, meta) => emit("error", message, { ...bindings, ...meta }),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

export const logger = createLogger();

export const redactForLog = (value: unknown) => redact(value, new WeakSet());

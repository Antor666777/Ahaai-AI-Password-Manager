export const MIN_MASTER_PASSWORD_LENGTH = 12;
export const MAX_MASTER_PASSWORD_LENGTH = 1024;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwerty123",
  "letmein",
  "iloveyou",
  "admin",
  "welcome",
  "monkey",
  "dragon",
  "correcthorsebatterystaple",
  "changeme",
  "passw0rd",
  "p@ssw0rd",
]);

export interface PasswordStrength {
  ok: boolean;
  score: number;
  issues: string[];
}

function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  return classes;
}

/**
 * Evaluates a master password. Deliberately length-biased so passphrases are
 * rewarded over short symbol soup, and rejects a small set of common choices.
 */
export function evaluateMasterPassword(
  password: string,
  options: { email?: string } = {},
): PasswordStrength {
  const issues: string[] = [];

  if (password.length < MIN_MASTER_PASSWORD_LENGTH) {
    issues.push(`Use at least ${MIN_MASTER_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_MASTER_PASSWORD_LENGTH) {
    issues.push(`Use at most ${MAX_MASTER_PASSWORD_LENGTH} characters`);
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    issues.push("This password is too common");
  }
  if (new Set(password).size < 4) {
    issues.push("Avoid repeated or trivial characters");
  }

  if (options.email) {
    const localPart = options.email.split("@")[0]?.toLowerCase() ?? "";
    if (localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
      issues.push("Do not include your email address");
    }
  }

  const classes = characterClasses(password);
  const longEnoughForPassphrase = password.length >= 20;

  let score = 0;
  if (password.length >= MIN_MASTER_PASSWORD_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;
  if (classes >= 3 || longEnoughForPassphrase) score += 1;
  score = Math.min(4, score);

  return { ok: issues.length === 0, score, issues };
}

export function isStrongMasterPassword(
  password: string,
  options: { email?: string } = {},
): boolean {
  return evaluateMasterPassword(password, options).ok;
}

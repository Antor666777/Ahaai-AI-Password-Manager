"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { SessionRetry } from "@/components/app/shell/SessionRetry";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { SegmentedControl } from "@/components/ui/controls";
import { MonoValue, StrengthMeter } from "@/components/ui/data";
import { PasswordField, TextInput } from "@/components/ui/field";
import { Callout, InlineError } from "@/components/ui/feedback";
import { ApiError } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { evaluateMasterPassword } from "@/lib/crypto/password-policy";
import { AuthNotice } from "./AuthNotice";

type AuthMode = "signup" | "signin";
type Step = 1 | 2;

interface FieldErrors {
  email?: string;
  password?: string;
  acknowledgement?: string;
}

const MODES: { value: AuthMode; label: string }[] = [
  { value: "signup", label: "Create account" },
  { value: "signin", label: "Sign in" },
];

/** Deliberately loose: the server is the authority, this catches typos. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "Enter the email you will use for this vault.";
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "That does not look like an email. Use a form like name@example.com.";
  }
  if (trimmed.length > 254) {
    return "That email runs past 254 characters. Use a shorter address.";
  }
  return undefined;
}

function codeOf(caught: unknown): string | null {
  if (caught instanceof ApiError) return caught.code;
  if (typeof caught === "object" && caught !== null && "code" in caught) {
    const value = (caught as { code?: unknown }).code;
    if (typeof value === "string") return value;
  }
  return null;
}

function rateLimitMessage(caught: unknown): string {
  const details = caught instanceof ApiError ? caught.details : undefined;
  const raw =
    typeof details === "object" && details !== null && "retryAfterSeconds" in details
      ? (details as { retryAfterSeconds?: unknown }).retryAfterSeconds
      : undefined;
  const seconds =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.max(1, Math.ceil(raw))
      : null;

  return seconds === null
    ? "Too many attempts came from this device. Wait a minute, then try again."
    : `Too many attempts came from this device. Wait ${seconds} seconds, then try again.`;
}

/** Turns a failure into the field it belongs to plus the next move. */
function describeFailure(
  caught: unknown,
  mode: AuthMode,
): { form?: string; email?: string; password?: string } {
  switch (codeOf(caught)) {
    case "UNAUTHORIZED":
      return mode === "signin"
        ? {
            password:
              "That master password did not match this email. Check it and try again, or use Change email to correct the address.",
          }
        : {
            form: "The server did not take that sign up request, so nothing was created. Try again in a moment.",
          };
    case "CONFLICT":
      return {
        email:
          "This email already has an account. Switch to Sign in and use the master password for it.",
      };
    case "RATE_LIMITED":
      return { form: rateLimitMessage(caught) };
    case "BAD_REQUEST":
      return {
        form: "The server could not read that request. Check the email address, then try again.",
      };
    case "FORBIDDEN":
      return {
        form: "The server turned this browser away. Reload the page, then try again.",
      };
    case "NETWORK":
      return {
        form: "Could not reach the server. Check your connection, then try again.",
      };
    case "WEAK_PASSWORD":
      return { password: "Use a master password of at least 12 characters." };
    case "DECRYPT_FAILED":
    case "INVALID_ENVELOPE":
      return {
        password:
          "The vault key did not open with that master password. Check it and try again.",
      };
    default:
      return {
        form: "The server could not finish that request. Try again in a moment.",
      };
  }
}

export function AuthPanel({ className }: { className?: string }) {
  const router = useRouter();
  const { status, register, login } = useSession();

  const [mode, setMode] = useState<AuthMode>("signup");
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailInput = useRef<HTMLInputElement>(null);
  const passwordShell = useRef<HTMLDivElement>(null);
  const ackInput = useRef<HTMLInputElement>(null);
  /** Set once this form is driving the navigation, so the guard stays quiet. */
  const handingOff = useRef(false);

  const acknowledgementId = useId();

  useEffect(() => {
    if (status === "authenticated" && !handingOff.current) {
      router.replace("/vault");
    }
  }, [status, router]);

  const strength = evaluateMasterPassword(password, { email: email.trim() });
  const isSignUp = mode === "signup";

  const heading =
    status === "loading"
      ? "Checking this browser"
      : status === "error"
        ? "Could not check this browser"
        : status === "authenticated"
          ? "You are already signed in"
          : isSignUp
            ? "Create your vault"
            : "Open your vault";

  const blurb =
    status === "loading"
      ? "One moment while Ahaai looks for a session left in this browser."
      : status === "error"
        ? "The check did not finish, so nothing here was signed out."
        : status === "authenticated"
          ? "A live session is here, so the vault is yours to open."
          : isSignUp
            ? "Two steps: an email, then the master password that seals everything."
            : "Use the email and the master password you set for this vault.";

  const submitLabel =
    step === 1 ? "Continue" : isSignUp ? "Create account" : "Sign in";

  function focusPassword() {
    passwordShell.current?.querySelector("input")?.focus();
  }

  function focusFirstInvalid(next: FieldErrors) {
    if (next.email) emailInput.current?.focus();
    else if (next.password) focusPassword();
    else if (next.acknowledgement) ackInput.current?.focus();
  }

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setStep(1);
    setPassword("");
    setAcknowledged(false);
    setErrors({});
    setFormError(null);
  }

  function changeEmail() {
    setStep(1);
    setPassword("");
    setErrors((current) => ({
      ...current,
      password: undefined,
      acknowledgement: undefined,
    }));
    setFormError(null);
    window.requestAnimationFrame(() => emailInput.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    if (step === 1) {
      const emailIssue = validateEmail(email);
      if (emailIssue) {
        setErrors({ email: emailIssue });
        focusFirstInvalid({ email: emailIssue });
        return;
      }
      setErrors({});
      setStep(2);
      return;
    }

    const next: FieldErrors = {};
    if (isSignUp) {
      if (!strength.ok) {
        next.password = `${strength.issues[0]}.`;
      }
      if (!acknowledged) {
        next.acknowledgement =
          "Confirm that you understand this password cannot be recovered, then create the account.";
      }
    } else if (password.length === 0) {
      next.password = "Enter the master password for this email.";
    }

    if (next.email || next.password || next.acknowledgement) {
      setErrors(next);
      focusFirstInvalid(next);
      return;
    }

    setSubmitting(true);
    handingOff.current = true;
    try {
      if (isSignUp) await register(email.trim(), password);
      else await login(email.trim(), password);
      router.push("/vault");
    } catch (caught) {
      handingOff.current = false;
      const failure = describeFailure(caught, mode);
      setErrors({ email: failure.email, password: failure.password });
      setFormError(failure.form ?? null);
      if (failure.email) {
        // The email field lives on step 1, so the message has to be shown there.
        setStep(1);
        window.requestAnimationFrame(() => emailInput.current?.focus());
      } else if (failure.password) {
        focusPassword();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="auth-panel"
      aria-labelledby="ahaai-auth-heading"
      className={cn("scroll-mt-20 lg:border-s", className)}
    >
      <div className="border-t border-line py-9 lg:sticky lg:top-[4.5rem] lg:border-t-0 lg:ps-9">
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h2
              id="ahaai-auth-heading"
              className="text-[15px] font-semibold text-ink"
            >
              {heading}
            </h2>
            <p className="max-w-[42ch] text-[13px] leading-relaxed text-ink-muted">
              {blurb}
            </p>
          </div>

          {status === "anonymous" ? (
            <>
              <SegmentedControl
                label="Create an account or sign in"
                name="ahaai-auth-mode"
                value={mode}
                onChange={switchMode}
                options={MODES}
                disabled={submitting}
                className="w-full [&>label]:flex-1 [&>label]:justify-center"
              />

              <form noValidate onSubmit={handleSubmit} className="space-y-6">
                {step === 1 ? (
                  <div className="space-y-4">
                    <p className="mono-data text-[12px] text-ink-faint">
                      Step 1 of 2
                    </p>
                    <TextInput
                      ref={emailInput}
                      label="Email"
                      name="email"
                      type="email"
                      inputMode="email"
                      required
                      spellCheck={false}
                      autoComplete="email"
                      value={email}
                      disabled={submitting}
                      error={errors.email ?? null}
                      hint="Ahaai uses this as your account id. The vault contents stay sealed."
                      onChange={(event) => {
                        const value = event.target.value;
                        setEmail(value);
                        if (errors.email) {
                          setErrors((current) => ({
                            ...current,
                            email: undefined,
                          }));
                        }
                      }}
                      onBlur={() => {
                        if (email.trim().length === 0) return;
                        const issue = validateEmail(email);
                        if (issue) {
                          setErrors((current) => ({ ...current, email: issue }));
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="mono-data text-[12px] text-ink-faint">
                        Step 2 of 2
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={changeEmail}
                        disabled={submitting}
                      >
                        Change email
                      </Button>
                    </div>

                    <div className="min-w-0 border-y border-line py-2.5">
                      <p className="text-[12.5px] text-ink-faint">
                        Account email
                      </p>
                      <MonoValue value={email.trim()} className="mt-0.5" />
                    </div>

                    <div className="space-y-3">
                      <div ref={passwordShell}>
                        <PasswordField
                          label="Master password"
                          name="master-password"
                          value={password}
                          autoComplete={isSignUp ? "new-password" : "current-password"}
                          disabled={submitting}
                          autoFocus
                          error={errors.password ?? null}
                          hint={
                            isSignUp
                              ? "Twelve characters or more. A few words in a row beat a short scramble."
                              : "Ahaai checks this one against the vault key it unlocks."
                          }
                          onChange={(value) => {
                            setPassword(value);
                            if (errors.password) {
                              setErrors((current) => ({
                                ...current,
                                password: undefined,
                              }));
                            }
                          }}
                        />
                      </div>

                      {isSignUp && password.length > 0 ? (
                        <div className="space-y-2">
                          <StrengthMeter score={strength.score} />
                          {strength.issues.length > 0 && !errors.password ? (
                            <ul className="space-y-0.5">
                              {strength.issues.map((issue) => (
                                <li
                                  key={issue}
                                  className="text-[12.5px] text-ink-faint"
                                >
                                  {issue}.
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {isSignUp ? (
                      <div className="space-y-2 border-t border-line pt-4">
                        <div className="flex items-start gap-2.5">
                          <input
                            ref={ackInput}
                            id={acknowledgementId}
                            name="recovery-acknowledgement"
                            type="checkbox"
                            checked={acknowledged}
                            disabled={submitting}
                            aria-invalid={
                              errors.acknowledgement ? true : undefined
                            }
                            aria-describedby={
                              errors.acknowledgement
                                ? `${acknowledgementId}-consequence ${acknowledgementId}-error`
                                : `${acknowledgementId}-consequence`
                            }
                            onChange={(event) => {
                              setAcknowledged(event.target.checked);
                              if (errors.acknowledgement) {
                                setErrors((current) => ({
                                  ...current,
                                  acknowledgement: undefined,
                                }));
                              }
                            }}
                            className="mt-0.5 size-4 shrink-0 rounded-sm accent-primary"
                          />
                          <label
                            htmlFor={acknowledgementId}
                            className="text-[13px] leading-snug font-medium text-ink"
                          >
                            I understand that Ahaai cannot recover this master
                            password
                          </label>
                        </div>
                        <p
                          id={`${acknowledgementId}-consequence`}
                          className="ps-6 text-[12.5px] leading-relaxed text-ink-faint"
                        >
                          There is no reset link and no recovery key. If this
                          password is lost, the vault stays sealed and
                          everything inside it stays unreadable.
                        </p>
                        {errors.acknowledgement ? (
                          <span
                            id={`${acknowledgementId}-error`}
                            className="block ps-6"
                          >
                            <InlineError>
                              {errors.acknowledgement}
                            </InlineError>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}

                {formError ? (
                  <div role="alert">
                    <Callout
                      tone="danger"
                      title={
                        isSignUp
                          ? "Account was not created"
                          : "Sign in did not finish"
                      }
                    >
                      {formError}
                    </Callout>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    loading={submitting}
                  >
                    {submitLabel}
                  </Button>
                  <p className="text-[12.5px] leading-relaxed text-ink-faint">
                    {step === 1
                      ? "Step 2 sets the master password that seals the vault."
                      : "Your master password stays in this browser. The server only receives a derived auth hash."}
                  </p>
                </div>
              </form>
            </>
          ) : status === "error" ? (
            <SessionRetry />
          ) : (
            <AuthNotice
              state={status === "loading" ? "checking" : "authenticated"}
            />
          )}
        </div>
      </div>
    </section>
  );
}

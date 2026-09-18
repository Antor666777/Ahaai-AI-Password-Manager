export interface SecurityHeaderOptions {
  isDevelopment?: boolean;
  /** Emit HSTS. Only meaningful when the deployment is actually HTTPS. */
  isSecure?: boolean;
  /**
   * Origins the page may call. Defaults to same-origin only, which is right
   * when the API serves the frontend itself.
   */
  connectSrc?: string[];
  /**
   * `same-origin` blocks cross-origin resource reads. An API that serves
   * extensions or third-party clients over CORS needs `cross-origin`.
   */
  crossOriginResourcePolicy?: "same-origin" | "cross-origin";
}

export function securityHeaders(
  options: SecurityHeaderOptions = {},
): Record<string, string> {
  const {
    isDevelopment = false,
    isSecure = false,
    connectSrc = ["'self'"],
    crossOriginResourcePolicy = "same-origin",
  } = options;

  // React needs eval() for its development-only debugging features.
  const scriptSrc = isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  const contentSecurityPolicy = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": crossOriginResourcePolicy,
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none",
  };

  if (isSecure) {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}

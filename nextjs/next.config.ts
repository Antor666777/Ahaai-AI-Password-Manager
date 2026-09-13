import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM Postgres. Keep it external so Node loads it at runtime
  // instead of Turbopack bundling the binary. Used only for the zero-setup
  // local development database.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;

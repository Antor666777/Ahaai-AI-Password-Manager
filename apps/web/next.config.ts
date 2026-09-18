import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The frontend is a pure client-side app; the API lives in apps/api. A static
  // export means it can be served from any CDN or from the API container itself.
  output: "export",
  // Emits `route/index.html` instead of `route.html`, so any static host and the
  // API's static handler can resolve directory URLs without extra rules.
  trailingSlash: true,
  // Workspace packages ship TypeScript source, so Next compiles them itself
  // instead of expecting a prebuilt dist folder.
  transpilePackages: ["@ahaai/core", "@ahaai/db"],
};

export default nextConfig;

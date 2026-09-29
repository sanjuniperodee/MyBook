import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Heavy Node-only packages used by PDF generation and image processing.
  serverExternalPackages: ["@react-pdf/renderer", "sharp", "pdf-lib", "hyphen", "pg", "archiver"],
  outputFileTracingIncludes: {
    "/**": ["./assets/**/*", "./drizzle/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

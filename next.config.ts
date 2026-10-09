import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * Версия рисунков обложек: меняется только вместе с их кодом — браузер кэширует SVG-фоны навсегда.
 * Значение вшивается в сборку; без исходников (запуск готовой standalone-сборки) оно не нужно.
 */
function coverArtVersion() {
  try {
    const sources = ["covers", "covers-collection", "cover-kit", "motifs", "formats"].map((f) => readFileSync(`src/lib/book/${f}.ts`, "utf8"));
    return createHash("sha1").update(sources.join("\n")).digest("hex").slice(0, 10);
  } catch {
    return "build";
  }
}

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
  env: { COVER_ART_VERSION: coverArtVersion() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // microphone=(self) — нужен для голосового ввода ответов в редакторе
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

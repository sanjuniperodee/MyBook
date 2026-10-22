import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * Файлы, от которых зависит рисунок обложек: весь каталог src/lib/book/covers и то, что он импортирует
 * (геометрия формата, рамка фото, шаблон на снимке, мотивы, реестр шаблонов из CRM), и маршрут, который
 * растрирует и обрезает фоны (/api/covers). Полноту списка сверяет tests/cover-art-version.test.ts по графу импортов.
 */
export function coverArtSources() {
  const covers = readdirSync("src/lib/book/covers", { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((f) => `src/lib/book/covers/${f}`);
  return [...covers, ...["cover-registry", "formats", "motifs", "photo-cover", "photo-frame"].map((f) => `src/lib/book/${f}.ts`), "src/app/api/covers/[file]/route.ts"];
}

/**
 * Версия рисунков обложек: меняется только вместе с их кодом — браузер кэширует SVG-фоны навсегда.
 * Значение вшивается в сборку; без исходников (запуск готовой standalone-сборки) оно не нужно.
 */
function coverArtVersion() {
  try {
    const sources = coverArtSources().map((f) => readFileSync(f, "utf8"));
    return createHash("sha1").update(sources.join("\n")).digest("hex").slice(0, 10);
  } catch {
    return "build";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Heavy Node-only packages used by PDF generation and image processing.
  serverExternalPackages: ["@react-pdf/renderer", "sharp", "pdf-lib", "hyphen", "pg", "archiver", "hunspell-asm"],
  outputFileTracingIncludes: {
    "/**": ["./assets/**/*", "./drizzle/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Клиентский кэш страниц: возврат и повторный заход в течение 30 секунд — мгновенно, без заготовки и запроса (как в приложении).
    // Изменения через серверные действия сбрасывают кэш сами, поэтому устаревшего после правок не видно.
    staleTimes: { dynamic: 30, static: 30 },
  },
  // На сервере деплоя (2 ядра, 4 ГБ, рядом работающий сайт) проверка типов Next не помещается в память и роняет сборку;
  // типы проверяются до пуша (npx tsc), поэтому deploy/deploy.sh её пропускает (MYBOOK_SKIP_TYPECHECK=1).
  typescript: { ignoreBuildErrors: process.env.MYBOOK_SKIP_TYPECHECK === "1" },
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

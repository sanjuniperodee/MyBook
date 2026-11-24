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

const PUBLIC_IMAGE_CACHE = "public, max-age=604800, stale-while-revalidate=2592000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Heavy Node-only packages used by PDF generation and image processing.
  // heic-decode (libheif в wasm) читает HEIC с iPhone; поток раскодирования подключает его по имени, поэтому пакет едет в релиз как есть.
  serverExternalPackages: ["@react-pdf/renderer", "@react-pdf/layout", "sharp", "pdf-lib", "hyphen", "pg", "archiver", "hunspell-asm", "heic-decode", "libheif-js"],
  outputFileTracingIncludes: {
    "/**": ["./assets/**/*", "./drizzle/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Переписанные на mybook-files запросы (/files/*) — это и видео с перемоткой: не обрывать через 30 с (по умолчанию).
    proxyTimeout: 60 * 60 * 1000,
    // Клиентский кэш страниц: возврат и повторный заход в течение 30 секунд — мгновенно, без заготовки и запроса (как в приложении).
    // Изменения через серверные действия сбрасывают кэш сами, поэтому устаревшего после правок не видно.
    staleTimes: { dynamic: 30, static: 30 },
  },
  // На сервере деплоя (2 ядра, 4 ГБ, рядом работающий сайт) проверка типов Next не помещается в память и роняет сборку;
  // типы проверяются до пуша (npx tsc), поэтому deploy/deploy.sh её пропускает (MYBOOK_SKIP_TYPECHECK=1).
  typescript: { ignoreBuildErrors: process.env.MYBOOK_SKIP_TYPECHECK === "1" },
  poweredByHeader: false,
  env: { COVER_ART_VERSION: coverArtVersion() },
  // Файлы хранилища по подписанной ссылке сайта — Go-сервису mybook-files на 127.0.0.1 (services/files, пилот G3,
  // src/server/files-service.ts, режим redirect). Строка nginx из docs/microservices/06-operations.md отдаёт их мимо Next.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/files/:token", destination: `http://127.0.0.1:${Number(process.env.FILES_PORT) || 3050}/files/:token` },
        // API v1 (ADR 0012, apps/api) — процесс mybook-api; на проде nginx отдаёт /api/v1/ ему напрямую, мимо Next.
        { source: "/api/v1/:path*", destination: `http://127.0.0.1:${Number(process.env.API_PORT) || 3044}/api/v1/:path*` },
      ],
    };
  },
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
      // Картинки сайта из public/ (лого, значки, лендинг): без хэша в имени, поэтому не immutable — неделя и ещё месяц
      // отдаются из кэша (браузер, Cloudflare), пока проверяется новая. Next по умолчанию ставит max-age=0 — каждый заход
      // спрашивал сервер. Служебный воркер CRM, манифесты и worklet звонков — как были (обновления должны доходить сразу).
      { source: "/:file(logo|mark|icon-192|icon-512|crm-icon-192|crm-icon-512|crm-icon-maskable-512|crm-badge-96).:ext(png|webp)", headers: [{ key: "Cache-Control", value: PUBLIC_IMAGE_CACHE }] },
      { source: "/lp/:path*", headers: [{ key: "Cache-Control", value: PUBLIC_IMAGE_CACHE }] },
    ];
  },
};

export default nextConfig;

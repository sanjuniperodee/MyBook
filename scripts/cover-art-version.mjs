// Версия рисунков обложек (COVER_ART_VERSION): хеш файлов, от которых зависит рисунок, — весь каталог src/lib/book/covers
// и то, что он импортирует (геометрия формата, рамка фото, шаблон на снимке, мотивы, реестр шаблонов из CRM). Меняется
// только вместе с их кодом: по ней сбрасываются кэши обложек (src/server/cover-image.ts, lib/book/cover-image-version.ts)
// и адреса SVG-фонов (lib/urls.ts). Сборка бэкенда вшивает её в бандлы (scripts/node-bundle.mjs); веб считает тот же хеш
// по копии в shared/src (next.config.ts mybook-web). Полноту списка сверяет tests/cover-art-version.test.ts.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

export function coverArtSources() {
  const covers = readdirSync("src/lib/book/covers", { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((f) => `src/lib/book/covers/${f}`);
  return [...covers, ...["cover-registry", "formats", "motifs", "photo-cover", "photo-frame"].map((f) => `src/lib/book/${f}.ts`)];
}

export function coverArtVersion() {
  const sources = coverArtSources().map((f) => readFileSync(f, "utf8"));
  return createHash("sha1").update(sources.join("\n")).digest("hex").slice(0, 10);
}

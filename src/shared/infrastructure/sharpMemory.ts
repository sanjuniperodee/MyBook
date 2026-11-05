import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Память sharp/libvips (ADR 0010). Кэш операций libvips (по умолчанию до 50 МБ и 100 операций) держит в процессе
 * расшифрованные снимки обложек и страниц; повторов одних и тех же операций у нас почти нет — растры кэшируем сами
 * (LRU обложек, уменьшенные снимки). Замер 05.11 на сервере: прогрев фото-обложек оставлял процессу ~600 МБ, без кэша
 * libvips и с jemalloc (deploy/ecosystem.config.cjs) — ~80 МБ.
 *
 * Тонкость: у sharp две сборки, CommonJS и ES-модуль, и каждая при первой загрузке включает кэш libvips заново
 * (`cache(true)` в dist/utility.cjs). Настройка libvips общая на процесс, поэтому здесь загружаются обе сборки, а уже
 * потом кэш выключается: более поздняя загрузка (оптимизатор картинок Next, наш код) его больше не включит.
 * Вызывать при старте каждого JS-окружения, где есть sharp: сайт — instrumentation, mybook-worker — src/worker/main.ts,
 * поток вёрстки PDF — pdf/worker.ts (поток грузит sharp заново).
 */
type SharpCache = { cache(options?: boolean): { memory: { max: number }; items: { max: number } } };

export async function configureSharpMemory(cwd = process.cwd()): Promise<void> {
  const req = createRequire(path.join(cwd, "package.json"));
  let cjsFile: string;
  try {
    cjsFile = req.resolve("sharp");
  } catch {
    return; // sharp не установлен — нечего настраивать
  }
  const cjs = req(cjsFile) as SharpCache;
  try {
    const esm = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ pathToFileURL(path.join(path.dirname(cjsFile), "index.mjs")).href)) as {
      default: SharpCache;
    };
    esm.default.cache(false);
  } catch {
    /* сборки ES-модуля нет (старый sharp) — хватает CommonJS */
  }
  cjs.cache(false);
}

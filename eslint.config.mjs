import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Архитектурные границы (docs/architecture.md):
 *  - домен чист: без БД, Next.js и инфраструктуры;
 *  - слой приложения не знает о БД и фреймворке;
 *  - модуль не импортирует другие модули вообще, даже фасад: общение — порты в application, адаптеры подставляет container;
 *  - модуль не знает о server, components и app; общее ядро (shared) — о модулях и слое представления;
 *  - слой представления (src/app, src/components) и src/server работают с модулями через фасады, domain и ui;
 *    страницы, действия и роуты не обращаются к БД.
 * Границы «по пути» (кто кого может импортировать) проверяет import/no-restricted-paths: он разрешает пути до файла,
 * поэтому видит и «@/…», и относительные импорты, import() и реэкспорты. Запреты «по имени» (drizzle, next, infrastructure
 * внутри модуля) — no-restricted-imports. Те же границы по графу импортов держит tests/architecture.test.ts.
 */
const modules = readdirSync(new URL("./src/modules", import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const infraImports = [
  { group: ["drizzle-orm", "drizzle-orm/*", "pg"], message: "Домен и сценарии не работают с БД напрямую — только через репозитории (порты)." },
  { group: ["@/shared/infrastructure/**", "**/shared/infrastructure/**"], message: "Схема, клиент БД и адаптеры — детали инфраструктуры." },
  { group: ["next", "next/*", "react", "react-dom"], message: "Домен и сценарии не зависят от фреймворка." },
];

const domainOnly = { group: ["server-only", "**/infrastructure/**", "**/application/**", "@/server/*"], message: "Домен не зависит от внешних слоёв." };
const applicationOnly = { group: ["**/infrastructure/**", "@/server/*"], message: "Сценарии зависят от портов, а не от реализаций." };
const restrict = (patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const src = (path) => `./src/${path}`;
const presentation = [src("server"), src("components"), src("app")];
const zones = [
  // Модуль видит только себя. Нужное от соседа потребитель объявляет портом в application, адаптер подставляет container.
  ...modules.map((name) => ({
    target: src(`modules/${name}`),
    from: src("modules"),
    except: [`./${name}`],
    message: "Модуль не импортирует другие модули, даже их фасад: нужное от соседа объявите портом в application, адаптер подставит container.",
  })),
  { target: src("modules"), from: presentation, message: "Модуль не знает о server, components и app: зависимости направлены внутрь." },
  { target: src("shared"), from: [src("modules"), ...presentation], message: "Общее ядро не знает ни модулей, ни слоя представления: общий словарь — в shared/domain." },
  // src/lib — чистые библиотеки: ни бизнес-модулей, ни слоя представления.
  { target: src("lib"), from: [src("modules"), ...presentation], message: "src/lib — чистые библиотеки без бизнес-модулей и слоя представления." },
  // src/server — корень композиции и веб-адаптеры: слой представления стоит над ним.
  { target: src("server"), from: [src("components"), src("app")], message: "src/server не зависит от слоя представления: страницы и компоненты используют его, а не наоборот." },
  // Страницы, компоненты и src/server видят модуль через фасад (index.ts), domain и ui.
  {
    target: [...presentation],
    from: [src("modules/*/application/**"), src("modules/*/infrastructure/**")],
    message: "Слой представления и src/server работают с модулями через их фасады (@/modules/<имя>), domain и ui.",
  },
];

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "storage/**", "drizzle/**", "next-env.d.ts", ".claude/**", "mobile/**"] },
  { files: ["src/**/*.{ts,tsx}"], rules: { "import/no-restricted-paths": ["error", { basePath: fileURLToPath(new URL(".", import.meta.url)), zones }] } },
  // В flat config одноимённое правило из более позднего блока заменяет раннее, поэтому для каждого слоя
  // собираем полный список ограничений в одном блоке.
  { files: ["src/modules/*/application/**/*.ts"], rules: restrict([...infraImports, applicationOnly]) },
  { files: ["src/modules/*/domain/**/*.ts"], rules: restrict([...infraImports, domainOnly]) },
  { files: ["src/shared/domain/**/*.ts"], rules: restrict([...infraImports, domainOnly]) },
  { files: ["src/shared/application/**/*.ts"], rules: restrict([...infraImports, applicationOnly]) },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.tsx"],
    rules: restrict([
      { group: ["drizzle-orm", "drizzle-orm/*", "pg", "@/shared/infrastructure/**"], message: "Страницы, действия и роуты не ходят в БД: команды — через сервисы модулей, чтения — через их read-модели (queries, reporting)." },
    ]),
  },
  {
    // src/lib — чистые библиотеки (вёрстка книги, контент, помощники UI): без БД и ввода-вывода.
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: restrict([
      { group: ["drizzle-orm", "drizzle-orm/*", "pg", "server-only"], message: "src/lib — чистые библиотеки без БД." },
      { regex: "^@/shared/infrastructure/(?!db/schema$)", message: "src/lib — чистые библиотеки без БД (типы строк из схемы — можно)." },
    ]),
  },
];

export default config;

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Архитектурные границы (docs/architecture.md):
 *  - домен чист: без БД, Next.js и инфраструктуры;
 *  - слой приложения не знает о БД и фреймворке;
 *  - модуль не импортирует другие модули вообще, даже фасад: общение — порты в application, адаптеры подставляет container;
 *  - модуль не знает о server и виде книги (src/book-view); общее ядро (shared) — о модулях и слое представления;
 *  - src/server и src/book-view работают с модулями через фасады, domain и ui. Страницы сайта — в mybook-web.
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
// С 27.11 страниц и компонентов сайта здесь нет (они в mybook-web); остался вид книги для сверки превью с PDF (src/book-view).
const presentation = [src("server"), src("book-view")];
const zones = [
  // Модуль видит только себя. Нужное от соседа потребитель объявляет портом в application, адаптер подставляет container.
  ...modules.map((name) => ({
    target: src(`modules/${name}`),
    from: src("modules"),
    except: [`./${name}`],
    message: "Модуль не импортирует другие модули, даже их фасад: нужное от соседа объявите портом в application, адаптер подставит container.",
  })),
  { target: src("modules"), from: presentation, message: "Модуль не знает о server и виде книги: зависимости направлены внутрь." },
  { target: src("shared"), from: [src("modules"), ...presentation], message: "Общее ядро не знает ни модулей, ни слоя представления: общий словарь — в shared/domain." },
  // src/lib — чистые библиотеки: ни бизнес-модулей, ни слоя представления.
  { target: src("lib"), from: [src("modules"), ...presentation], message: "src/lib — чистые библиотеки без бизнес-модулей и слоя представления." },
  // src/server — корень композиции и веб-адаптеры: слой представления стоит над ним.
  { target: src("server"), from: [src("book-view")], message: "src/server не зависит от вида книги (src/book-view): вид использует общий код, а не наоборот." },
  // Страницы, компоненты и src/server видят модуль через фасад (index.ts), domain и ui.
  {
    target: [...presentation],
    from: [src("modules/*/application/**"), src("modules/*/infrastructure/**")],
    message: "Слой представления и src/server работают с модулями через их фасады (@/modules/<имя>), domain и ui.",
  },
];

/**
 * src/server — корень композиции и веб-адаптеры, не место для запросов к БД: новые таблицы и запросы — в модулях.
 * Корень композиции (container, планировщик с advisory-блокировками) — исключение по смыслу. Ниже — храповик:
 * файлы, которые ходили в БД мимо модулей до правила (ADR 0009, P2). Список только убывает: перенесли файл в модуль —
 * уберите его отсюда (tests/server-db-boundary.test.ts напомнит). Типы строк из схемы (import type) — можно везде.
 */
export const serverDbRoots = ["src/server/container.ts", "src/server/scheduler.ts"];
export const serverDbLegacy = [];

const config = [
  ...nextVitals,
  ...nextTs,
  // promo/**/dist — собранные бандлы роликов, .cc — локальные черновики (исключены из git): не наш исходный код.
  // Страниц Next здесь нет (сайт — mybook-web): правило про ссылки на pages/ не к чему применять.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  { ignores: [".next/**", "build/**", "node_modules/**", "storage/**", "drizzle/**", "next-env.d.ts", ".claude/**", "mobile/**", "promo/**/dist/**", ".cc/**"] },
  { files: ["src/**/*.{ts,tsx}"], rules: { "import/no-restricted-paths": ["error", { basePath: fileURLToPath(new URL(".", import.meta.url)), zones }] } },
  // В flat config одноимённое правило из более позднего блока заменяет раннее, поэтому для каждого слоя
  // собираем полный список ограничений в одном блоке.
  { files: ["src/modules/*/application/**/*.ts"], rules: restrict([...infraImports, applicationOnly]) },
  { files: ["src/modules/*/domain/**/*.ts"], rules: restrict([...infraImports, domainOnly]) },
  { files: ["src/shared/domain/**/*.ts"], rules: restrict([...infraImports, domainOnly]) },
  { files: ["src/shared/application/**/*.ts"], rules: restrict([...infraImports, applicationOnly]) },
  {
    files: ["src/book-view/**/*.{ts,tsx}"],
    rules: restrict([
      { group: ["drizzle-orm", "drizzle-orm/*", "pg", "@/shared/infrastructure/**"], allowTypeImports: true, message: "Вид книги не ходит в БД: данные ему дают сборщики (src/server, модули)." },
    ]),
  },
  {
    // Lookbehind «(?<=…)», «(?<!…)» Safari до 16.4 не знает: литерал роняет при разборе весь чанк, new RegExp — бросает ошибку.
    // Так на iPhone с iOS 16.3 редактор вопросов перестал сохранять ответы. Что стоит перед совпадением — проверяйте кодом
    // (см. matches в src/lib/proofread/rules.ts). Исключение — понимание сообщений бота: оно работает только на сервере,
    // а что в браузер оно не попало, после сборки проверяет scripts/check-browser-support.mjs в mybook-web.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/modules/messaging/domain/{bot,botNlu,botParse,botEngine,botSeller,botWeekday}.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["Literal[regex.pattern=/\\(\\?<[=!]/]", "Literal[value=/\\(\\?<[=!]/]", "TemplateElement[value.raw=/\\(\\?<[=!]/]"].map((selector) => ({
          selector,
          message: "Lookbehind (?<= / (?<! не работает в Safari до 16.4 (iOS 16.3): проверьте знак перед совпадением кодом.",
        })),
      ],
    },
  },
  {
    files: ["src/server/**/*.{ts,tsx}"],
    ignores: [...serverDbRoots, ...serverDbLegacy],
    rules: restrict([
      {
        group: ["drizzle-orm", "drizzle-orm/*", "pg", "@/shared/infrastructure/db", "@/shared/infrastructure/db/*", "@/shared/infrastructure/database"],
        allowTypeImports: true,
        message: "src/server не ходит в БД: запросы и таблицы — в модуле (репозиторий/queries), сюда — через фасад и container(). Типы строк (import type) — можно.",
      },
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

import { readdirSync } from "node:fs";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Архитектурные границы (docs/architecture.md):
 *  - домен чист: без БД, Next.js и инфраструктуры;
 *  - слой приложения не знает о БД и фреймворке;
 *  - модули общаются только через публичный фасад (index.ts) или доменные типы;
 *  - слой представления (src/app) не лезет во внутренности модулей.
 */
const modules = readdirSync(new URL("./src/modules", import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const infraImports = [
  { group: ["drizzle-orm", "drizzle-orm/*", "pg"], message: "Домен и сценарии не работают с БД напрямую — только через репозитории (порты)." },
  { group: ["@/lib/db", "@/lib/db/*", "**/lib/db", "**/lib/db/*"], message: "Схема и клиент БД — детали инфраструктуры." },
  { group: ["next", "next/*", "react", "react-dom"], message: "Домен и сценарии не зависят от фреймворка." },
];

const domainOnly = { group: ["server-only", "**/infrastructure/*", "**/application/*", "@/server/*"], message: "Домен не зависит от внешних слоёв." };
const applicationOnly = { group: ["**/infrastructure/*", "@/server/*"], message: "Сценарии зависят от портов, а не от реализаций." };
const foreignModule = (name) => ({
  group: ["@/modules/*/infrastructure/*", "@/modules/*/application/*", `!@/modules/${name}/**`],
  message: "Другой модуль доступен только через его фасад (@/modules/<имя>) или доменные типы.",
});
const restrict = (patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "storage/**", "drizzle/**", "next-env.d.ts"] },
  // В flat config одноимённое правило из более позднего блока заменяет раннее, поэтому для каждого
  // модуля и слоя собираем полный список ограничений в одном блоке.
  ...modules.flatMap((name) => [
    { files: [`src/modules/${name}/**/*.{ts,tsx}`], rules: restrict([foreignModule(name)]) },
    { files: [`src/modules/${name}/application/**/*.ts`], rules: restrict([...infraImports, applicationOnly, foreignModule(name)]) },
    { files: [`src/modules/${name}/domain/**/*.ts`], rules: restrict([...infraImports, domainOnly, foreignModule(name)]) },
  ]),
  { files: ["src/shared/domain/**/*.ts"], rules: restrict([...infraImports, domainOnly]) },
  { files: ["src/shared/application/**/*.ts"], rules: restrict([...infraImports, applicationOnly]) },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.tsx"],
    rules: restrict([{ group: ["@/modules/*/infrastructure/*", "@/modules/*/application/*", "@/shared/infrastructure/*"], message: "Слой представления работает с модулями через container() и их фасады." }]),
  },
];

export default config;

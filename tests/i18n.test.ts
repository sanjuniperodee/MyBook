import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { alternates } from "@/i18n/seo";
import { localizePath, splitLocale } from "@/i18n/config";
import { landings } from "@/lib/content/landings";

/** Форма словаря: ключи, типы значений и длины массивов, без самих текстов. */
function shape(v: unknown, at = "", out: string[] = []): string[] {
  if (Array.isArray(v)) {
    out.push(`${at}[${v.length}]`);
    v.forEach((x, i) => shape(x, `${at}[${i}]`, out));
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v).sort()) shape((v as Record<string, unknown>)[k], `${at}.${k}`, out);
  } else out.push(`${at}:${typeof v}`);
  return out;
}

function emptyStrings(v: unknown, at = "", out: string[] = []): string[] {
  if (typeof v === "string" && !v.trim()) out.push(at);
  else if (Array.isArray(v)) v.forEach((x, i) => emptyStrings(x, `${at}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) emptyStrings(x, `${at}.${k}`, out);
  return out;
}

describe("словари", () => {
  const ru = messagesFor("ru");
  const kk = messagesFor("kk");

  it("казахский словарь повторяет русский ключ в ключ (включая длины списков)", () => {
    // Типы TypeScript ловят пропуски на этапе сборки, этот тест — ещё и Record<string, …> и массивы.
    expect(shape(kk)).toEqual(shape(ru));
  });

  it("нет пустых строк", () => {
    expect(emptyStrings(ru)).toEqual([]);
    expect(emptyStrings(kk)).toEqual([]);
  });

  it("функции словаря возвращают строки на обоих языках", () => {
    const d = new Date(2027, 1, 14);
    for (const m of [ru, kk]) {
      expect(m.common.date(d)).toMatch(/14/);
      expect(m.common.until(d)).toMatch(/14/);
      expect(m.common.inDays(3)).toMatch(/3/);
      expect(m.book.chapter(2)).toMatch(/2/);
    }
    // Казахский: дательный падеж месяца в «до …» и отсутствие окончаний множественного числа после числа.
    expect(kk.common.until(d)).toBe("14 ақпанға дейін");
    expect(kk.common.count.answers(5)).toBe("5 жауап");
    expect(ru.common.count.answers(5)).toBe("5 ответов");
  });

  it("в казахском словаре нет недопереведённых строк", () => {
    // Буквы ё/щ/ъ в казахском почти не встречаются (э — бывает в заимствованиях: эпиграф, электрондық).
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (typeof v === "function") {
        try {
          const r = (v as (...a: unknown[]) => unknown)(1, 1, 1, 1);
          if (typeof r === "string") strings.push(r);
        } catch {}
      } else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(kk);
    expect(strings.filter((s) => /[ёщъ]/i.test(s))).toEqual([]);
  });
});

describe("адреса", () => {
  it("localizePath и splitLocale — взаимно обратны", () => {
    for (const p of ["/", "/books", "/books/1/questions?q=2", "/gift#faq"]) {
      const kk = localizePath(p, "kk");
      expect(kk.startsWith("/kk")).toBe(true);
      expect(splitLocale(kk.split(/[?#]/)[0]).path).toBe(p.split(/[?#]/)[0]);
      expect(localizePath(p, "ru")).toBe(p);
    }
  });
  it("служебные адреса не получают префикс", () => {
    for (const p of ["/api/books", "/admin", "/print/orders/1", "/mark.png", "https://wa.me/1", "#faq"]) expect(localizePath(p, "kk")).toBe(p);
    expect(localizePath("/kk/books", "kk")).toBe("/kk/books");
  });
  it("hreflang: обе версии ссылаются друг на друга", () => {
    expect(alternates("/gift", "kk")).toEqual({ canonical: "/kk/gift", languages: { ru: "/gift", kk: "/kk/gift", "x-default": "/gift" } });
  });
  it("у каждой посадочной страницы есть тексты на обоих языках", () => {
    for (const l of landings) for (const c of [l.content.ru, l.content.kk]) expect(c.label && c.h1 && c.metaTitle && c.faq.length).toBeTruthy();
  });
});

/**
 * Страж: в клиентском коде не должно быть русских строк вне словарей — иначе на казахской версии «дырка».
 * Исключения: CRM и служебные страницы (внутренний инструмент на русском), словари и банк вопросов,
 * а также строки для команды (журнал заказа, письма менеджеру, техзадание типографии) — они помечены ниже.
 */
describe("нет русских строк вне словарей", () => {
  const root = path.join(__dirname, "..", "src");
  // CRM и вебхуки интеграций — внутренние инструменты команды, они на русском.
  const skipDirs = [/^i18n\//, /^app\/admin\//, /^app\/admin-denied\//, /^app\/api\/admin\//, /^app\/api\/integrations\//, /^app\/print\//, /^components\/admin\//, /^lib\/content\//, /^lib\/crm\//];
  // Файлы, где кириллица допустима целиком: внутренние инструменты и сам механизм языков.
  const skipFiles = new Set([
    "lib/crm.ts",
    "lib/crm-filters.ts",
    "lib/crm-clients.ts",
    "lib/pdf/render.tsx", // техзадание для типографии — на русском
    "components/LanguageSwitch.tsx", // двуязычная подпись «Тіл / Язык»
    "lib/db/schema.ts",
    "lib/book/hyphen-kk.ts", // алфавит для слоговых правил
  ]);
  // Строки для команды, а не для клиента.
  const internalLine = /legalName:|Заказ создан|книга почти готова \(|советы, как начать книгу|addOrderEvent\(|ordersNotifyEmail|crmNotes|console\.|logToCrm|return `напоминание|reason:|Автописьмо|Платёж |Оплата подтверждена|Отменён клиентом|Клиент сообщил|Неуспешная оплата|без причины|Подарочный сертификат №\$\{current\.number\}|Оплачен (заказ|сертификат)|Новый заказ|Открыть в админке|Проверьте (оплату|поступление)|Клиент оплатил|Сертификаты"|Тариф: \$\{planName|Сумма: \$\{format|Сертификат №\$\{gift\.number\} оплачен|оплачен\?|→ \$\{escapeHtml/;

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);

  it("клиентские файлы используют словари", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (skipDirs.some((r) => r.test(f)) || skipFiles.has(f)) continue;
      const lines = readFileSync(path.join(root, f), "utf8").split("\n");
      let inBlockComment = false;
      lines.forEach((raw, i) => {
        let line = raw;
        if (inBlockComment) {
          if (!line.includes("*/")) return;
          line = line.slice(line.indexOf("*/") + 2);
          inBlockComment = false;
        }
        line = line.replace(/\/\*.*?\*\//g, "").replace(/\{\/\*.*?\*\/\}/g, "");
        if (line.includes("/*")) {
          inBlockComment = !line.includes("*/");
          line = line.slice(0, line.indexOf("/*"));
        }
        line = line.replace(/(^|[^:"'`])\/\/.*$/, "$1");
        if (/^\s*\*/.test(line)) return;
        if (!/[А-Яа-яЁё]/.test(line) || internalLine.test(line)) return;
        offenders.push(`${f}:${i + 1}: ${raw.trim().slice(0, 100)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

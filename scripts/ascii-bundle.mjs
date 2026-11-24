// Делает бандл esbuild чистым ASCII: экранирует то, что esbuild с charset ascii оставляет как есть, — не-ASCII в
// регулярных выражениях (/[…»]/) и в именах. Зачем: исходник модуля V8 держит в куче строкой, и один символ вне
// Latin-1 делает двухбайтной всю строку — у mybook-worker это 30 МБ вместо 11 (замер G4, docs/microservices/perf.md).
// Смысл кода не меняется: \uXXXX в регулярном выражении и в имени значит тот же символ (с флагом u и без).
// Шаблонные строки с тегом в общем случае не трогаем (у String.raw`ж` экранирование меняет значение) — кроме sql`…`
// drizzle: он собирает запрос из «готовых» строк шаблона (strings[i]), а не из .raw, и там \uXXXX — тот же символ.
// Без тега шаблоны esbuild экранирует сам.
import { readFileSync, writeFileSync } from "node:fs";
import { tokenizer } from "acorn";

const NON_ASCII = /[^\x00-\x7f]/;
const hex = (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;

/** Экранировать не-ASCII в тексте токена; в регулярном выражении «\…» (лишняя обратная косая без флага u) → «…». */
function escapeToken(text) {
  return text.replace(/(\\*)([^\x00-\x7f])/g, (_, slashes, ch) => {
    const kept = slashes.length % 2 ? slashes.slice(1) : slashes;
    // Символ вне BMP — две половины суррогатной пары: в регулярном выражении с u это снова один символ, без u — две.
    return kept + [...ch].map((u) => (u.length === 2 ? hex(u[0]) + hex(u[1]) : hex(u))).join("");
  });
}

/** Теги шаблонов, у которых значение — «готовые» строки (strings[i]): экранировать можно. */
const COOKED_TAGS = new Set(["sql"]);

/** Вернуть код без не-ASCII, кроме шаблонов с чужим тегом; left — сколько таких токенов оставлено. */
export function asciiSource(src) {
  if (!NON_ASCII.test(src)) return { code: src, escaped: 0, left: 0 };
  let code = "";
  let last = 0;
  let escaped = 0;
  let left = 0;
  // Вложенность шаблонов: тег и где мы — в тексте шаблона или внутри ${…} (depth — свои { } внутри подстановки).
  const stack = [];
  let prev = null;
  for (const t of tokenizer(src, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true, allowAwaitOutsideFunction: true })) {
    const label = t.type.label;
    const top = stack[stack.length - 1];
    if (label === "`") {
      if (top?.text) stack.pop();
      else stack.push({ tag: prev?.type.label === "name" ? prev.value : null, text: true, depth: 0 });
    } else if (label === "${" && top) {
      top.text = false;
      top.depth = 0;
    } else if (label === "{" && top && !top.text) top.depth++;
    else if (label === "}" && top && !top.text) {
      if (top.depth === 0) top.text = true;
      else top.depth--;
    }
    prev = t;
    const text = src.slice(t.start, t.end);
    if (!NON_ASCII.test(text)) continue;
    const cookedTemplate = label === "template" && top?.text && (top.tag === null || COOKED_TAGS.has(top.tag));
    if (label === "regexp" || label === "name" || label === "string" || label === "privateId" || cookedTemplate) {
      code += src.slice(last, t.start) + escapeToken(text);
      last = t.end;
      escaped++;
    } else left++;
  }
  code += src.slice(last);
  return { code, escaped, left };
}

/** Переписать файл бандла на месте; MYBOOK_ASCII_BUNDLE=off — не трогать. */
export function asciiBundle(file) {
  if (process.env.MYBOOK_ASCII_BUNDLE === "off") return;
  const { code, escaped, left } = asciiSource(readFileSync(file, "utf8"));
  if (escaped) writeFileSync(file, code);
  if (left) console.warn(`${file}: не-ASCII остался в ${left} шаблонных строках — исходник в памяти двухбайтный`);
}

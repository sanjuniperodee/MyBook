/**
 * Промпты ИИ-дизайнера. Системная часть — справочник (что и какими значениями можно менять) и правила; она одна для всех
 * книг и кэшируется у Anthropic, поэтому меняется только вместе с каталогами. Пользовательская часть — книга, текущее
 * оформление и просьба клиента.
 */
import type { Locale } from "@/i18n/config";
import { coverTemplates } from "../covers";
import { DECOR_IDS, safeArea, stockGroups, stockPhotos } from "../cover-design";
import { fontFaces, fontKeys, fontWeights } from "../fonts";
import type { BookFormat } from "../formats";
import { interiorDesigns, interiorDirection, interiorStyleOptions as O, LIMITS } from "../interiors";
import type { DesignTarget } from "./ops";

const list = (xs: readonly string[]) => xs.join(", ");

function fontsRef() {
  return fontKeys
    .map((k) => {
      const f = fontFaces[k];
      const w = fontWeights(k);
      return `- ${k}: ${f.name} — ${f.category}${f.body ? ", годится для основного текста" : ", только заголовки и надписи"}; веса ${w.weights.join("/")}${w.italic ? ", есть курсив" : ""}`;
    })
    .join("\n");
}

const RULES = `Правила:
- Отвечай только JSON по схеме: reply — одна-две фразы клиенту на его языке (что изменено), ops — операции.
- Меняй только то, о чём просит клиент; остальное не трогай. Если просьба расплывчатая («сделай красивее», «как в романе») —
  выбери цельное решение: стиль или пару шрифтов, интервалы и цвета, которые сочетаются.
- value — JSON-литерал строкой: строки в кавычках ("\\"literata\\""), числа и true/false без кавычек ("11.5", "true"), объекты — "{...}".
- Используй только перечисленные значения. Чего нет в справочнике — того сделать нельзя: скажи об этом в reply и не придумывай.
- Печать: текст должен читаться (тёмный текст на светлой бумаге или наоборот), основной текст — только шрифтами для основного текста.
- Просьбы, не связанные с оформлением книги, не выполняй: ops пустой, в reply — вежливо, что ты помогаешь только с оформлением.`;

/** Справочник для оформления страниц. */
export function pagesSystemPrompt(): string {
  const styles = interiorDesigns.map((d) => `- ${d.id} (${interiorDirection(d)}): шрифты ${d.display.font}/${d.type.body}`).join("\n");
  return `Ты — дизайнер книжной вёрстки в сервисе печати книг-воспоминаний. Ты меняешь оформление страниц книги по просьбе клиента.

Оформление = стиль (interior) + настройки поверх него (style). Операции:
- set_interior, value = id стиля: сменить стиль целиком (свои настройки при этом сбрасываются, кроме оформления глав).
- set, path = путь в style, value = значение; unset, path — вернуть «как в стиле».

Стили (id, направление, шрифты):
${styles}

Пути style и значения:
- fonts.<роль> = {"font": ключ, "weight"?: число, "italic"?: bool}; роли: display (название книги и глав), heading (заголовки разделов), body (основной текст), quote (цитаты, эпиграфы, посвящение), label (служебные надписи, колонтитулы), numeral (номер главы цифрой), initial (буквица), caption (подписи к фото).
- body.size (pt, ${LIMITS.bodySize[0]}–${LIMITS.bodySize[1]}), body.lineHeight (${LIMITS.lineHeight[0]}–${LIMITS.lineHeight[1]}), body.tracking (em, ${LIMITS.bodyTracking[0]}–${LIMITS.bodyTracking[1]}), body.align (${list(O.aligns)}), body.indent (красная строка, em, 0–4), body.paraGap (отбивка абзацев, em, 0–2), body.measure (ширина колонки, доля, ${LIMITS.measure[0]}–1), body.weight (300–800).
- heading.size (× основного кегля, ${LIMITS.headingSize[0]}–${LIMITS.headingSize[1]}), heading.align (left, center), heading.upper, heading.tracking (em, 0–0.4), heading.accent (цвет акцента), heading.bar (линейка над заголовком).
- display.size (кегль названия главы, pt, ${LIMITS.displaySize[0]}–${LIMITS.displaySize[1]}), display.titleSize (название на титуле, pt, ${LIMITS.titleSize[0]}–${LIMITS.titleSize[1]}), display.upper, display.tracking (0–0.4), display.align (center, left), display.top (высота блока главы, доля полосы, ${LIMITS.displayTop[0]}–${LIMITS.displayTop[1]}).
- label.size (pt, ${LIMITS.labelSize[0]}–${LIMITS.labelSize[1]}), label.upper, label.tracking (0–0.5).
- colors.ink (текст), colors.muted (подписи), colors.accent, colors.rule (тонкие линии), colors.ornament, colors.paper (тон бумаги, светлый), colors.opener (заливка начальных полос глав, "#RRGGBB" или null — без заливки). Цвета — "#RRGGBB".
- elements.dropCap (none, drop, raised), elements.dropLines (2–4), elements.leadIn (первые слова главы капителью), elements.number (${list(O.numbers)}), elements.ornament (${list(O.glyphs)}), elements.vignette (bool), elements.divider (${list(O.dividers)}), elements.frame (${list(O.frames)}), elements.art (${list(O.arts)} или null), elements.runningHead (none, plain, ruled), elements.folio (center, outer, none), elements.folioDashes, elements.quote (${list(O.quotes)}), elements.titlePage (${list(O.titles)}), elements.photoFrame (${list(O.photoFrames)}), elements.caption (${list(O.captions)}).
- chapters.<ключ главы> = {"align"?, "number"?, "ornament"?, "dropCap"?: {"style": "drop"|"raised", "lines": 2–4} | null, "leadIn"?, "accent"?: "#RRGGBB", "fill"?: "#RRGGBB" | null, "art"?: рисунок | null} — оформление одной главы.

Шрифты (ключ: название — группа):
${fontsRef()}

${RULES}

Пример. Просьба «сделай как классический роман с буквицей»:
{"reply":"Поставил стиль «Роман»: Garamond, красная строка и буквица на три строки.","ops":[{"op":"set_interior","path":"","value":"\\"novel\\""}]}
Пример. «шрифт покрупнее и тёплый бордовый акцент»:
{"reply":"Увеличил текст до 11.5 pt и сделал акцент бордовым.","ops":[{"op":"set","path":"body.size","value":"11.5"},{"op":"set","path":"colors.accent","value":"\\"#7A1F2B\\""},{"op":"set","path":"colors.ornament","value":"\\"#9A3A45\\""}]}`;
}

/** Справочник для обложки из слоёв. */
export function coverSystemPrompt(): string {
  const templates = coverTemplates.map((t) => `${t.id} (${t.mood}${t.requiresPhoto ? ", с фото книги" : t.photo ? ", на снимке" : ""})`).join(", ");
  const stock = stockGroups.map((g) => `${g}: ${Object.keys(stockPhotos).filter((k) => stockPhotos[k] === g).join(", ")}`).join("; ");
  return `Ты — дизайнер обложек в сервисе печати книг-воспоминаний. Ты меняешь обложку из слоёв по просьбе клиента.

Обложка = фон + слои по порядку (первый — нижний). Координаты слоя x, y, w, h — доли лицевой крышки (0…1, левый верхний угол);
можно немного заходить за край (до −0.2 и 1.2) — это уходит в загиб. Размеры текста и толщины — доли ширины крышки.

Операции:
- set / unset, path «background» или «background.<поле>»: фон {"kind":"template"} (рисунок шаблона), {"kind":"color","color":"#RRGGBB"}, {"kind":"gradient","from":"#RRGGBB","to":"#RRGGBB","angle":0–360}.
- set / unset, path «layers.<id>.<поле>» или «layers.<id>.style.<поле>»: изменить свойство слоя (id и kind менять нельзя).
- add_layer, value = слой целиком (path "" — наверх, "back" — под остальные).
- remove_layer, path = id; move_layer, path = id, value = "front" | "back" | "up" | "down".
- set_template, value = id шаблона (его рисунок — фон при background {"kind":"template"}).

Поля слоёв:
- Общие: id (латиница/цифры), kind, x, y, w, h, rotate (−180…180), opacity (0–1), locked, hidden, name.
- text: bind ("title" | "subtitle" | "names" — текст из книги; без bind — свой text), text (свой текст, \\n — перенос), style: {font, weight, italic, underline, upper, size (0.012–0.4), color, tracking (em), lineHeight (0.7–2.5), align (left, center, right), valign (top, middle, bottom), shadow?: {color, x, y (em, −0.3…0.3), opacity}, outline?: {color, width (em, 0–0.12)}, plate?: {color, opacity, radius, pad}}.
- image: photoId (фото книги из списка ниже), stock (снимок коллекции), mask (rect, rounded, circle, arch), radius, border?: {color, width (0–0.05)}, mono (ч/б), overlay?: {color, opacity}.
- shape: shape (rect, ellipse, line, frame, double, corners, arch), fill ("#RRGGBB" или null), gradient?: {to, angle}, stroke, strokeWidth (0–0.06), radius.
- decor: motif (${list(DECOR_IDS)}), color.

Снимки коллекции (stock): ${stock}.
Шаблоны (id): ${templates}.

Шрифты (ключ: название — группа):
${fontsRef()}

${RULES}
- Важный текст (название, имена) держи в безопасной зоне — её границы даны в запросе. Название — крупно и контрастно к фону.
- Новые слои — с понятными id: "title2", "tagline", "frame1".

Пример. «название крупнее и золотом, фон тёмно-синий»:
{"reply":"Сделал фон тёмно-синим, а название — крупнее и золотым.","ops":[{"op":"set","path":"background","value":"{\\"kind\\":\\"color\\",\\"color\\":\\"#1D2A44\\"}"},{"op":"set","path":"layers.title.style.size","value":"0.11"},{"op":"set","path":"layers.title.style.color","value":"\\"#D8B46A\\""}]}`;
}

export function systemPrompt(target: DesignTarget) {
  return target === "pages" ? pagesSystemPrompt() : coverSystemPrompt();
}

export interface DesignBookContext {
  title: string;
  kind: string;
  /** Язык книги — на нём тексты книги. */
  language: Locale;
  format: BookFormat;
  /** Язык интерфейса — на нём reply. */
  ui: Locale;
  /** Главы книги (ключ и название) — для оформления отдельной главы. */
  chapters?: { key: string; title: string }[];
  /** Фото книги — для слоёв обложки. */
  photos?: { id: string; width: number; height: number }[];
}

const replyLanguage: Record<Locale, string> = { ru: "по-русски", kk: "по-казахски" };

/** Пользовательская часть: книга, текущее оформление, просьба; при исправлении — прошлый ответ и замечания. */
export function userPrompt(target: DesignTarget, book: DesignBookContext, state: unknown, request: string, retry?: { ops: unknown; errors: string[] }) {
  const s = safeArea(book.format);
  const lines = [
    `Книга: «${book.title}» (${book.kind}), формат ${book.format.id}, язык книги ${book.language}. reply пиши ${replyLanguage[book.ui]}.`,
    target === "cover" ? `Безопасная зона крышки: x ${s.x.toFixed(3)}–${(s.x + s.w).toFixed(3)}, y ${s.y.toFixed(3)}–${(s.y + s.h).toFixed(3)}.` : "",
    target === "pages" && book.chapters?.length ? `Главы (ключ: название): ${book.chapters.map((c) => `${c.key}: ${c.title}`).join("; ")}.` : "",
    target === "cover" && book.photos?.length ? `Фото книги (photoId, ширина×высота): ${book.photos.map((p) => `${p.id} ${p.width}×${p.height}`).join("; ")}.` : target === "cover" ? "Своих фото в книге нет — для снимков используй stock." : "",
    `Текущее оформление:\n${JSON.stringify(state)}`,
    `Просьба клиента:\n<request>\n${request}\n</request>`,
    retry ? `Твой прошлый ответ применился не полностью:\n${retry.errors.map((e) => `- ${e}`).join("\n")}\nПрошлые операции: ${JSON.stringify(retry.ops)}\nВерни полный исправленный ответ (все операции заново).` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

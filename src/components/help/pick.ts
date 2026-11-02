/**
 * «Спросить про это место»: что клиент нажал на экране — подпись элемента, что это (кнопка, вкладка, фото…),
 * состояние, блок и открытые вкладки — коротко, словами интерфейса. Это уходит помощнику вместе с вопросом
 * (сервер ещё раз режет длины: parseHelpPlace). Значения полей ввода не берём: это тексты клиента, а не место.
 */

export interface PickedPlace {
  path: string;
  tabs: string[];
  section: string;
  label: string;
  role: string;
  state: string;
  anchor: string;
}

/** Элементы управления и картинки. */
const CONTROLS =
  'button, a[href], summary, label, input, select, textarea, img, canvas, video, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [role="menuitem"], [role="option"], [role="link"]';
/** Что на странице можно выбрать: элементы управления, картинки и всё с меткой data-help. */
const PICKABLE = `${CONTROLS}, [data-help]`;

const ROLE: Record<string, string> = {
  button: "кнопка",
  a: "ссылка",
  link: "ссылка",
  summary: "раскрывающийся блок",
  tab: "вкладка",
  switch: "переключатель",
  checkbox: "флажок",
  radio: "вариант выбора",
  slider: "ползунок",
  range: "ползунок",
  menuitem: "пункт меню",
  option: "вариант",
  select: "список",
  textarea: "поле для текста",
  input: "поле",
  img: "картинка",
  canvas: "рисунок",
  video: "видео",
  label: "подпись",
};

const clean = (s: string | null | undefined, max = 120) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Видимый текст элемента без вложенных полей ввода (их значения — тексты клиента); куски текста — через пробел. */
function textOf(el: Element, max = 120): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return "";
  const parts: string[] = [];
  let size = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("input, textarea, select, [contenteditable], script, style, .sr-only") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n && size < max; n = walker.nextNode()) {
    const t = clean(n.textContent);
    if (t) {
      parts.push(t);
      size += t.length + 1;
    }
  }
  return clean(parts.join(" "), max);
}

function byIds(ids: string | null): string {
  if (!ids) return "";
  return clean(
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" "),
  );
}

/** Подпись элемента: aria-label, связанные подписи, title, alt, подпись поля, текст. */
export function labelOf(el: Element): string {
  const aria = clean(el.getAttribute("aria-label")) || byIds(el.getAttribute("aria-labelledby"));
  if (aria) return aria;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const own = el.labels?.[0] ? textOf(el.labels[0]) : "";
    if (own) return own;
    const wrap = el.closest("label");
    if (wrap) return textOf(wrap);
    return clean(el.getAttribute("placeholder")) || clean(el.getAttribute("title")) || clean(el.getAttribute("name"));
  }
  if (el instanceof HTMLImageElement) return clean(el.alt) || clean(el.title);
  // Кнопка-переключатель внутри подписи: подпись — текст строки.
  const labels = (el as HTMLButtonElement).labels;
  if (labels?.[0]) return textOf(labels[0]);
  return clean(el.getAttribute("title")) || textOf(el) || clean(el.getAttribute("data-help-label"));
}

function roleOf(el: Element): string {
  const role = el.getAttribute("role");
  if (role && ROLE[role]) return ROLE[role];
  if (el instanceof HTMLInputElement) return el.type === "checkbox" ? ROLE.checkbox : el.type === "radio" ? ROLE.radio : el.type === "range" ? ROLE.range : el.type === "file" ? "выбор файла" : ROLE.input;
  const tag = el.tagName.toLowerCase();
  if (ROLE[tag]) return ROLE[tag];
  if (el.hasAttribute("data-help")) {
    const kind = el.getAttribute("data-help")!.split(":")[0];
    return kind === "photo" ? "фото" : kind === "page" ? "страница макета" : kind === "question" ? "вопрос и ответ" : "блок";
  }
  return "текст";
}

function stateOf(el: Element): string {
  const checked = el.getAttribute("aria-checked") ?? el.getAttribute("aria-pressed");
  if (checked === "true") return "включено";
  if (checked === "false") return "выключено";
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked ? "включено" : "выключено";
    if (el.type === "range") return `значение ${el.value}`;
  }
  if (el instanceof HTMLSelectElement) return clean(el.selectedOptions[0]?.textContent, 60);
  const now = el.getAttribute("aria-valuenow");
  if (now) return `значение ${clean(el.getAttribute("aria-valuetext")) || now}`;
  if (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-current") === "page") return "открыто";
  if (el.getAttribute("aria-disabled") === "true" || (el as HTMLButtonElement).disabled) return "недоступно";
  return "";
}

const HEADINGS = ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > header h2, :scope > header h3, :scope > div > h2, :scope > div > h3, :scope > div > h4";

/** Заголовок блока, в котором элемент: data-help-section, подпись области или ближайший заголовок выше по разметке. */
export function sectionOf(el: Element): string {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 12; depth++, node = node.parentElement) {
    const own = node.getAttribute("data-help-section");
    if (own) return clean(own, 120);
    if (/^(section|fieldset|form|dialog|aside)$/i.test(node.tagName) || /^(region|dialog|tabpanel|group)$/.test(node.getAttribute("role") ?? "")) {
      const named = clean(node.getAttribute("aria-label")) || byIds(node.getAttribute("aria-labelledby"));
      if (named) return named;
    }
    const heading = [...node.querySelectorAll(HEADINGS)].reverse().find((h) => h !== el && !h.contains(el) && h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (heading) return textOf(heading, 120);
    if (node.tagName === "MAIN") break;
  }
  return "";
}

/** Открытые вкладки внутри раздела (не вкладки книги — раздел уже понятен по адресу). */
function openTabs(el: Element): string[] {
  const out: string[] = [];
  for (const tab of document.querySelectorAll('main [role="tab"][aria-selected="true"]')) {
    const t = labelOf(tab);
    if (t && !out.includes(t) && tab !== el) out.push(t.slice(0, 60));
  }
  return out.slice(0, 3);
}

/** Элемент, о котором вопрос: ближайший выбираемый к точке нажатия (не сам виджет помощника). */
export function pickTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element) || target.closest("[data-help-widget]")) return null;
  const hit = target.closest(PICKABLE);
  // Нажали на текст внутри большой карточки с меткой (ответ, фото) — вопрос о самом тексте, метка возьмётся у карточки.
  if (hit && hit !== target && !hit.matches(CONTROLS) && textOf(target, 40)) return target;
  return hit ?? target;
}

/** Описание места нажатия для помощника. */
export function describe(el: Element, path: string): PickedPlace {
  const anchorEl = el.closest("[data-help]");
  const anchor = anchorEl?.getAttribute("data-help") ?? "";
  // Подпись с переключателем внутри: подпись — текст строки, что это и состояние — у самого переключателя.
  const control = el instanceof HTMLLabelElement && el.control ? el.control : el;
  // Нажали на обёртку ответа без подписи — подпись берём у карточки (заголовок вопроса); у фото и страниц подробности даст сервер по метке.
  const label = labelOf(el) || (anchorEl && anchor.startsWith("question:") ? textOf(anchorEl, 80) : "");
  const role = anchor.startsWith("photo:") && el instanceof HTMLImageElement ? "фото" : roleOf(control);
  return { path, tabs: openTabs(el), section: sectionOf(el), label, role, state: stateOf(control), anchor: /^[a-z]+:[\w-]{1,64}$/.test(anchor) ? anchor : "" };
}

/** Короткая подпись выбранного места для чипа в чате: «элемент · блок». */
export const placeChip = (p: PickedPlace) => [p.label ? `«${p.label.slice(0, 50)}»` : p.role, p.section].filter(Boolean).join(" · ");

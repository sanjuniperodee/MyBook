/**
 * Плейбук ИИ-дизайнера: проверенные сочетания, из которых модель собирает решение, а не придумывает с нуля. Настроение →
 * палитра (бумага, текст, акцент, украшения; для обложки — фон, название, акцент), пары шрифтов (заголовки/текст),
 * подходящие стили страниц, макеты и шаблоны обложки, мотивы украшений. Плюс правила вёрстки и типографики. Все ключи —
 * из каталогов (тест сверяет), поэтому совет модели всегда выполним.
 */
import type { FontKey } from "../fonts";

export interface Mood {
  id: string;
  /** Когда это настроение уместно (для модели). */
  when: string;
  pages: { paper: string; ink: string; muted: string; accent: string; ornament: string };
  cover: { background: string; title: string; accent: string; gradient?: [string, string] };
  /** Пары [заголовки, основной текст]: первая — лучшая. */
  fonts: [FontKey, FontKey][];
  interiors: string[];
  layouts: string[];
  templates: string[];
  decor: string[];
}

export const MOODS: Mood[] = [
  {
    id: "romantic",
    when: "любовь, свадьба, годовщина, «нежно», «романтично»",
    pages: { paper: "#FBF5EF", ink: "#2B2024", muted: "#8A7378", accent: "#9C3D54", ornament: "#C58A96" },
    cover: { background: "#F4E4E1", title: "#7A2E43", accent: "#C9A26A", gradient: ["#F7E8E4", "#E8C9C7"] },
    fonts: [["cormorant", "lora"], ["alice", "lora"], ["playfair", "ebgaramond"], ["badscript", "lora"]],
    interiors: ["amour", "romance", "herbarium"],
    layouts: ["romance-arch", "romance-script", "gift-ribbon"],
    templates: ["peony", "roses", "velvet", "constellation", "letter"],
    decor: ["hearts", "rings", "flourish", "botanical", "sprig"],
  },
  {
    id: "classic",
    when: "серьёзная книга, мемуары, «как настоящая книга», «классика», «роман»",
    pages: { paper: "#FAF6EE", ink: "#1F1B16", muted: "#7C7264", accent: "#7A1F2B", ornament: "#A88B5A" },
    cover: { background: "#1F2A3A", title: "#E7D3A8", accent: "#C8A86A" },
    fonts: [["ebgaramond", "ebgaramond"], ["cormorant", "ptserif"], ["cormorantsc", "spectral"], ["playfair", "literata"]],
    interiors: ["novel", "classic", "journal"],
    layouts: ["fiction-type", "biography-portrait", "premium-deco"],
    templates: ["linen", "leather", "flax", "marble"],
    decor: ["fleuron", "laurel", "vignette", "hedera"],
  },
  {
    id: "vintage",
    when: "ретро, «как старинная книга», семейная история, бабушки и дедушки, архивные фото",
    pages: { paper: "#F4EBD8", ink: "#2E241A", muted: "#7D6B54", accent: "#8A4B2A", ornament: "#9E7A4E" },
    cover: { background: "#E9DCC2", title: "#4A2F1C", accent: "#8A4B2A", gradient: ["#EFE3CB", "#D8C3A0"] },
    fonts: [["oldstandard", "oldstandard"], ["cormorantsc", "ebgaramond"], ["prata", "alegreya"]],
    interiors: ["antique", "vintage", "shanyrak", "airmail"],
    layouts: ["family-heritage", "biography-band", "photo-film"],
    templates: ["leather", "postcards", "letter", "saddle"],
    decor: ["fleuron", "hedera", "flourish", "shanyrak"],
  },
  {
    id: "luxury",
    when: "премиально, дорого, юбилей, «золото», «элегантно», тёмный фон",
    pages: { paper: "#FBF8F1", ink: "#1C1A17", muted: "#7A7166", accent: "#9A7B3F", ornament: "#B8975A" },
    cover: { background: "#151A22", title: "#D9BC7C", accent: "#B8975A", gradient: ["#1D2430", "#0E1117"] },
    fonts: [["forum", "spectral"], ["cormorantsc", "spectral"], ["notodisplay", "literata"], ["yeseva", "ebgaramond"]],
    interiors: ["luxe", "oyu", "deco"],
    layouts: ["premium-deco", "premium-oyu", "minimal-circle"],
    templates: ["midnight", "oyu", "deco", "velvet"],
    decor: ["laurel", "diamond", "sunburst", "fleuron"],
  },
  {
    id: "minimal",
    when: "современно, строго, «без лишнего», «скандинавский», без засечек",
    pages: { paper: "#FFFFFF", ink: "#16181D", muted: "#6F737C", accent: "#2F5D8C", ornament: "#9AA3AE" },
    cover: { background: "#F2F0EC", title: "#16181D", accent: "#2F5D8C" },
    fonts: [["intertight", "intertight"], ["raleway", "intertight"], ["geologica", "onest"], ["montserrat", "montserrat"]],
    interiors: ["airy", "minimal", "contemporary", "lens"],
    layouts: ["minimal-swiss", "minimal-circle", "art-bauhaus"],
    templates: ["minimal", "mono", "mist", "linen"],
    decor: ["dots", "diamond", "wave"],
  },
  {
    id: "editorial",
    when: "как журнал, дерзко, крупные заголовки, фото-история, путешествия",
    pages: { paper: "#FBFAF7", ink: "#141414", muted: "#6B6B6B", accent: "#C2412D", ornament: "#C2412D" },
    cover: { background: "#141414", title: "#FFFFFF", accent: "#E4573D" },
    fonts: [["oswald", "spectral"], ["playfair", "lora"], ["notodisplay", "literata"], ["yeseva", "alegreya"]],
    interiors: ["magazine", "editorial", "modern", "cinema"],
    layouts: ["fiction-duotone", "bigphoto-full", "photo-grid"],
    templates: ["magazine", "duotone", "film", "mono"],
    decor: ["star", "dots", "sunburst"],
  },
  {
    id: "tender",
    when: "маме, бабушке, мягко, пастель, цветы, «уютно»",
    pages: { paper: "#FBF7F2", ink: "#2C2724", muted: "#8C8079", accent: "#7E8F6A", ornament: "#B4A48C" },
    cover: { background: "#EEF0E6", title: "#4D5A3C", accent: "#B58C6A", gradient: ["#F3F1E8", "#DDE3D0"] },
    fonts: [["lora", "lora"], ["cormorant", "lora"], ["alice", "ptserif"], ["caveat", "alegreya"]],
    interiors: ["herbarium", "watercolor", "romance", "memories"],
    layouts: ["art-botanical", "gift-tag", "family-polaroids"],
    templates: ["tenderness", "eucalyptus", "lavender", "meadow", "herbarium", "dried"],
    decor: ["botanical", "sprig", "hedera", "flourish"],
  },
  {
    id: "warm-family",
    when: "семья, друзья, праздник, тёплые фото, альбом, «весело», «по-домашнему»",
    pages: { paper: "#FFF9F0", ink: "#2A221B", muted: "#8A7A69", accent: "#D0702E", ornament: "#E0A15A" },
    cover: { background: "#F6E3C8", title: "#6B3417", accent: "#D0702E", gradient: ["#FBEBD3", "#F1CFA4"] },
    fonts: [["caveat", "alegreya"], ["kurale", "alegreya"], ["playfair", "lora"], ["badscript", "ptserif"]],
    interiors: ["scrapbook", "album", "memories", "photobook"],
    layouts: ["family-polaroids", "collage-scatter", "collage-mosaic"],
    templates: ["party", "autumn", "lemons", "postcards", "sunrise"],
    decor: ["sparkle", "stars", "heart", "sunburst"],
  },
  {
    id: "kids",
    when: "детская книга, ребёнку, ярко, игриво",
    pages: { paper: "#FFFDF7", ink: "#24262E", muted: "#7A7F8C", accent: "#3B82C4", ornament: "#F2A93B" },
    cover: { background: "#DDEFFB", title: "#1F4E7A", accent: "#F2A93B", gradient: ["#E6F4FD", "#FDF0D5"] },
    fonts: [["comfortaa", "nunito"], ["pangolin", "nunito"], ["montalt", "nunito"]],
    interiors: ["kids", "confetti"],
    layouts: ["kids-bubbles", "kids-sky"],
    templates: ["clouds", "party", "lemons", "surf", "sakura"],
    decor: ["confetti", "stars", "sparkle", "crescent"],
  },
  {
    id: "nature",
    when: "горы, Алматы, путешествия, природа, море, степь, «спокойно»",
    pages: { paper: "#F7F6F1", ink: "#1E2522", muted: "#6E7A74", accent: "#2E6A5A", ornament: "#8DA399" },
    cover: { background: "#1F3A36", title: "#F1EAD8", accent: "#C8B27A", gradient: ["#2A4A44", "#14272A"] },
    fonts: [["geologica", "literata"], ["cormorant", "ptserif"], ["raleway", "spectral"]],
    interiors: ["mountains", "sea", "lens", "stars"],
    layouts: ["bigphoto-print", "photo-film", "minimal-circle"],
    templates: ["alatau", "peaks", "steppe", "surf", "mist", "milkyway"],
    decor: ["peaks", "wave", "sprig", "star"],
  },
  {
    id: "kazakh",
    when: "казахские мотивы, той, шанырак, традиции, «национально»",
    pages: { paper: "#FAF4E8", ink: "#1F1D1A", muted: "#7B7366", accent: "#1E5B8C", ornament: "#C99A3B" },
    cover: { background: "#163A5F", title: "#F0D58C", accent: "#C99A3B" },
    fonts: [["cormorant", "ptserif"], ["forum", "spectral"], ["philosopher", "philosopher"]],
    interiors: ["shanyrak", "oyu"],
    layouts: ["premium-oyu", "family-heritage"],
    templates: ["oyu", "steppe", "indigo"],
    decor: ["ram", "shanyrak", "sunburst", "diamond"],
  },
  {
    id: "night",
    when: "звёзды, ночь, космос, мечты, тёмно и глубоко",
    pages: { paper: "#F7F7FA", ink: "#1A1C2A", muted: "#6D7088", accent: "#3D4A8C", ornament: "#B9A36A" },
    cover: { background: "#121735", title: "#EDE3C4", accent: "#C9B36E", gradient: ["#1D2350", "#0B0E22"] },
    fonts: [["cormorant", "ptserif"], ["notodisplay", "literata"], ["raleway", "spectral"]],
    interiors: ["stars", "luna"],
    layouts: ["kids-sky", "minimal-circle", "premium-deco"],
    templates: ["milkyway", "constellation", "midnight", "dusk", "lights"],
    decor: ["stars", "crescent", "sparkle", "star"],
  },
];

/** Тема книги → настроения, с которых стоит начинать. */
export const THEME_MOODS: Record<string, string[]> = {
  love: ["romantic", "luxury", "night"],
  mom: ["tender", "romantic", "warm-family"],
  dad: ["classic", "nature", "luxury"],
  friend: ["warm-family", "editorial", "minimal"],
  teacher: ["classic", "tender", "editorial"],
  autobiography: ["vintage", "classic", "nature"],
  blank: ["classic", "minimal", "tender"],
};

const RULES = `Принципы хорошего дизайна книги:
- Цельность: одно настроение на всё — палитра 3–4 цвета, 2 семейства шрифтов (третье — только рукописное для акцента).
- Иерархия: название книги — самое крупное и контрастное; подзаголовок и имена — заметно мельче (в 2–3 раза).
- Контраст: текст к фону не меньше 4.5:1, название на обложке — не меньше 3:1. Светлый текст — только на тёмном фоне.
- Основной текст: шрифт для чтения (книжный или без засечек), 10–12 pt для A5, интерлиньяж 1.35–1.6, красная строка
  или отбивка абзацев — что-то одно. Рукописные и декоративные шрифты — только для заголовков и надписей.
- Воздух: поля и отступы не трогай без просьбы; на обложке оставляй пустое пространство, не больше 6–8 слоёв.
- Украшения поддерживают текст, а не спорят с ним: один мотив, акцентный цвет, приглушённая прозрачность.
- Фото клиента — главное на обложке с фото: не закрывай лица, текст ставь на спокойную часть или на плашку.`;

/** Плейбук текстом для системного промпта (цели: страницы или обложка). */
export function playbookText(target: "pages" | "cover"): string {
  const moods = MOODS.map((m) => {
    const fonts = m.fonts.map(([d, b]) => `${d}+${b}`).join(", ");
    if (target === "pages")
      return `- ${m.id} (${m.when}): бумага ${m.pages.paper}, текст ${m.pages.ink}, подписи ${m.pages.muted}, акцент ${m.pages.accent}, украшения ${m.pages.ornament}; шрифты ${fonts}; стили ${m.interiors.join(", ")}`;
    const bg = m.cover.gradient ? `фон ${m.cover.background} или градиент ${m.cover.gradient.join("→")}` : `фон ${m.cover.background}`;
    return `- ${m.id} (${m.when}): ${bg}, название ${m.cover.title}, акцент ${m.cover.accent}; шрифты ${fonts}; макеты ${m.layouts.join(", ")}; шаблоны ${m.templates.join(", ")}; мотивы ${m.decor.join(", ")}`;
  }).join("\n");
  return `${RULES}

Настроения (проверенные сочетания — опирайся на них, подстраивая под просьбу и фото):
${moods}`;
}

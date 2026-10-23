/**
 * Справочник «как рисовать» для ИИ-дизайнера: описание языка рисунков и проверенные образцы. Образцы собирает тест
 * (ни один не даёт замечаний), поэтому модель видит только работающие описания. Стабильный текст — он попадает в
 * кэшируемую часть запроса.
 */
import { ART_ITEMS } from "./compile";
import { BORDERS, PATTERNS, SCENES } from "./library";

/** Описание языка рисунков — общее для обложки (add_art) и страниц (set_emblem). */
export const ART_REFERENCE = `Рисунки. Ты умеешь рисовать: описание рисунка — холст и список элементов, код превращает его в векторный рисунок, одинаковый на экране и в печати.
{"w":300,"h":200,"items":[ … ]} — w и h задают холст, координаты элементов — в его системе (начало слева сверху, y вниз). Углы — градусы: 0 — вверх, по часовой стрелке.
Цвета: "main" и "accent" — роли (подставятся цвета слоя или книги, рисунок потом перекрашивается одним выбором цвета) либо "#RRGGBB". Без fill и stroke фигура закрашивается main; только stroke — контур; общие поля: fill, stroke, width (толщина линии), opacity (0–1), sharp: true (острые углы линий).
Фигуры: circle {cx,cy,r}; ellipse {cx,cy,rx,ry,rot}; rect {x,y,w,h,r,rot}; line {x1,y1,x2,y2}; poly {cx,cy,r,n,rot}; star {cx,cy,r,n,inner,rot}; leaf {x,y,len,angle,wide} — лист или лепесток от точки; flower {cx,cy,r,petals,wide,core,coreSize}; arc {cx,cy,r,from,to}; wave {x0,x1,y,amp,len,rows,gap}; path {d} — свой путь SVG (команды M L H V C S Q T A Z).
Повторы и симметрия: ring {cx,cy,count,start,of} — копии элемента of вокруг центра (of нарисуй в положении «на 12 часов»); row {count,dx,dy,turn,of}; grid {cols,rows,dx,dy,stagger,of}; mirror {axis:"x",at,items} — добавляет зеркальные копии (axis "x" — зеркало относительно вертикали x=at); group {items,dx,dy,rot,scale,about,opacity} — сдвиг, поворот, масштаб группы. of и items — элемент или список элементов.
Готовые сцены (проще и красивее, чем рисовать самому): ${SCENES.map((s) => s).join(", ")} —
  mountains {x,y,w,h,peaks,layers,seed,snow}: горы в несколько слоёв (дальние бледнее), snow — цвет снежных шапок; hills {x,y,w,h,layers,seed}: холмы; sun {cx,cy,r,rays,rayColor}; moon {cx,cy,r}: серп; cloud {cx,cy,w}; stars {x,y,w,h,count,seed,size}: звёздное небо; tree {x,y,h,kind:"pine"|"round"|"birch",trunk}: x,y — низ ствола; tulip {x,y,h,leaf}; yurt {cx,y,w,door}: юрта, y — земля; bird {cx,cy,w}.
Тонкая графика (основа профессионального вида): contour {kind:"flow"|"island",x,y,w,h,cx,cy,r,lines,seed} — топографические линии; guilloche {cx,cy,r,petals,layers,depth} — розетка-гильош; fan {cx,cy,r,inner,from,to,count} — веер тонких лучей; arches {cx,y,w,h,count,gap} — вложенные арки; wreath {cx,cy,r,leaves,open} — лавровый венок из узких листьев; divider {cx,cy,w,kind:"diamond"|"dots"|"dot"} — разделитель с украшением. Горы можно вычертить тонкой линией: mountains {line:true, fill:<цвет фона, закрывает дальние хребты>, stroke}.
Узоры и рамки: pattern {kind,x,y,w,h,size} — полоса узора в прямоугольнике, kind: ${PATTERNS.join(", ")} (meander — греческий меандр, koshkar — казахский «қошқар мүйіз»); border {kind,inset,size,corners} — рамка по краям холста, kind: ${BORDERS.join(", ")} (chamfer — строгая двойная рамка со срезанными углами, brackets — угловые метки); size — толщина полосы, inset — отступ от края.
Как рисовать профессионально — как в изданиях Penguin, Taschen, Folio: линия и сдержанность, а не картинка. Тонкая линия (width 0.5–1.2 на холсте 300, по умолчанию уже тонко) и один-два цвета; глубина — прозрачностью и слоями одного тона; воздух: рисунок занимает не больше трети полосы либо работает фоном-узором, название всегда на спокойном поле; один главный мотив. Мультяшные сцены (tulip, yurt, cloud, tree, bird, sun с лучами) — только для детских и тёплых семейных книг, в строгих — тонкая графика, горы линией, звёзды, гильош, меандр, арки. Не больше 20 элементов, всё внутри холста.`;

/** Рисунок в виде, в каком его описывает модель (холст и элементы) — для образцов в справочнике. */
export interface ArtExample {
  /** Что за рисунок и когда уместен. */
  about: string;
  spec: { w: number; h: number; items: Record<string, unknown>[] };
}

export const ART_EXAMPLES: ArtExample[] = [
  {
    about: "горный пейзаж под названием (горы, холмы, луна): на нижнюю треть обложки или на фон",
    spec: {
      w: 300,
      h: 200,
      items: [
        { t: "stars", x: 0, y: 0, w: 300, h: 90, count: 36, seed: 4, fill: "accent" },
        { t: "moon", cx: 225, cy: 52, r: 20, fill: "accent" },
        { t: "mountains", y: 70, h: 130, peaks: 4, layers: 3, seed: 7, fill: "main", snow: "#E8EEF3" },
        { t: "hills", y: 150, h: 50, layers: 2, seed: 3, fill: "main" },
      ],
    },
  },
  {
    about: "орнаментальная рамка на всю обложку (пропорции крышки): меандр и тонкая двойная линия",
    spec: {
      w: 300,
      h: 425,
      items: [
        { t: "border", kind: "double", inset: 10, stroke: "main" },
        { t: "border", kind: "meander", inset: 18, size: 14, stroke: "main" },
      ],
    },
  },
  {
    about: "казахский узор: полоса из кошкар-мүйіз с линиями; ложится под или над названием",
    spec: {
      w: 300,
      h: 60,
      items: [
        { t: "line", x1: 10, y1: 6, x2: 290, y2: 6, stroke: "main", width: 1.2 },
        { t: "pattern", kind: "koshkar", x: 10, y: 10, w: 280, h: 40, stroke: "main" },
        { t: "line", x1: 10, y1: 54, x2: 290, y2: 54, stroke: "main", width: 1.2 },
      ],
    },
  },
  {
    about: "эмблема для титула и глав: тонкий лавровый венок вокруг розетки-гильоша",
    spec: {
      w: 240,
      h: 240,
      items: [
        { t: "wreath", cx: 120, cy: 120, r: 98, leaves: 11, open: 40, fill: "main" },
        { t: "guilloche", cx: 120, cy: 120, r: 52, petals: 8, layers: 2, stroke: "accent" },
        { t: "circle", cx: 120, cy: 120, r: 4, fill: "main" },
      ],
    },
  },
  {
    about: "иллюстративный стиль (только детская и тёплая семейная тема): степь, юрта, тюльпаны и солнце",
    spec: {
      w: 300,
      h: 200,
      items: [
        { t: "sun", cx: 230, cy: 58, r: 22, rays: 14, fill: "accent" },
        { t: "hills", y: 120, h: 80, layers: 2, seed: 9, fill: "main" },
        { t: "yurt", cx: 120, y: 168, w: 96, fill: "#F3E8D2", door: "accent" },
        { t: "tulip", x: 215, y: 190, h: 52, fill: "accent", leaf: "main" },
        { t: "tulip", x: 238, y: 192, h: 40, fill: "accent", leaf: "main" },
      ],
    },
  },
  {
    about: "угловой завиток-украшение: две симметричные ветви и ромб — для угла обложки или разделителя",
    spec: {
      w: 200,
      h: 60,
      items: [
        { t: "mirror", axis: "x", at: 100, items: [{ t: "path", d: "M100,30 C80,6 48,6 30,30 C48,22 66,28 70,36", stroke: "main", width: 2.2 }, { t: "leaf", x: 66, y: 22, len: 18, angle: -40, fill: "accent" }] },
        { t: "poly", cx: 100, cy: 30, r: 6, n: 4, fill: "main" },
      ],
    },
  },
];

/** Образцы в виде текста для промпта: пара «что это» и компактный JSON. */
export function artExamplesText(): string {
  return ART_EXAMPLES.map((e) => `- ${e.about}:\n  ${JSON.stringify(e.spec)}`).join("\n");
}

export const ART_ITEM_NAMES: readonly string[] = ART_ITEMS;

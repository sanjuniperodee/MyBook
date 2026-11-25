import type { Drawing, Shape } from "./index";

/** Перевод фигур interior-art (Shape[]) в чистый SVG-фрагмент для значков и мотивов в приложении. */
export function shapeToSvgTag(s: Shape): string {
  const op = (attr: string) =>
    s.opacity !== undefined ? ` ${attr}="${s.opacity}"` : "";
  switch (s.kind) {
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"${op("fill-opacity")}/>`;
    case "rect": {
      const fill = s.fill ?? "none";
      const stroke = s.stroke
        ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 1}"${op("stroke-opacity")}`
        : "";
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fill}"${s.fill ? op("fill-opacity") : ""}${stroke}/>`;
    }
    case "path": {
      const fill = s.fill ?? "none";
      const stroke = s.stroke
        ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 1}"${op("stroke-opacity")}`
        : "";
      const cap = s.round
        ? ` stroke-linecap="round" stroke-linejoin="round"`
        : "";
      const tr = s.transform ? ` transform="${s.transform}"` : "";
      return `<path d="${s.d}" fill="${fill}"${s.fill ? op("fill-opacity") : ""}${stroke}${cap}${tr}/>`;
    }
  }
}

/** Рисунок interior-art целиком — SVG для значков в приложении (декор обложки, орнаменты и разделители страниц). */
export function drawingToSvg(d: Drawing): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}">${d.shapes.map(shapeToSvgTag).join("")}</svg>`;
}

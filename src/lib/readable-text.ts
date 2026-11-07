/**
 * Цвет текста на плашке произвольного цвета (этап воронки — цвет выбирает руководитель): чёрный или белый, у кого
 * контраст с фоном выше (WCAG 2). Худший случай — средний тон, у обоих ≈ 4,6:1, так что текст читается всегда.
 */
export function textOn(background: string): "#000000" | "#ffffff" {
  const l = luminance(background);
  if (l === null) return "#ffffff";
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}

/** Относительная яркость цвета #rgb / #rrggbb по WCAG; не цвет — null. */
export function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

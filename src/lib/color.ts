/** Цвет #RRGGBB и прозрачность → rgba() для CSS. */
export function hexAlpha(hex: string, a: number) {
  return `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},${a})`;
}

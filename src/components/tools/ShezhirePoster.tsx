import { ancestorLine, GENERATIONS, posterDepth, type Shezhire } from "@/lib/tools/shezhire";
import type { ShezhireUi } from "@/lib/content/tools/ui";

/** Размер холста плаката, px: пропорции вертикального листа A4. */
export const POSTER_W = 800;

const FONT = "Georgia, 'Times New Roman', serif";
const WINE = "#7a1f2b";
const INK = "#2a1a1f";
const PAPER = "#fbf6ee";
const LINE = "#c9a99a";

/** Размер шрифта по длине имени: длинное имя не выходит за табличку. */
const nameSize = (name: string, plateW: number) => Math.max(15, Math.min(26, Math.floor((plateW - 28) / Math.max(1, name.length * 0.55))));

interface Props {
  data: Shezhire;
  ui: ShezhireUi;
}

/**
 * Плакат шежіре: имена по линиям отца и матери столбцами снизу вверх сходятся к владельцу внизу. Рисуется как SVG без внешних
 * шрифтов и картинок, поэтому одинаково выглядит на экране, при печати и в скачанном PNG.
 */
export function posterHeight(data: Shezhire): number {
  const depth = Math.max(posterDepth(data.father), posterDepth(data.mother), 1);
  return 330 + depth * 92 + 150;
}

export function ShezhirePoster({ data, ui }: Props) {
  const fd = posterDepth(data.father);
  const md = posterDepth(data.mother);
  const depth = Math.max(fd, md, 1);
  const both = fd > 0 && md > 0;
  const cols = both ? ([{ line: "father" as const, x: 235 }, { line: "mother" as const, x: 565 }] as const) : ([{ line: (md > 0 ? "mother" : "father") as "father" | "mother", x: POSTER_W / 2 }] as const);
  const plateW = both ? 300 : 360;
  const top = 250;
  const step = 92;
  const H = posterHeight(data);
  // Самое старшее колено — сверху: индекс i рисуется на позиции depth-1-i.
  const yOf = (i: number) => top + (depth - 1 - i) * step;
  const ownerY = top + depth * step + 22;
  const owner = data.owner.trim();

  return (
    <svg viewBox={`0 0 ${POSTER_W} ${H}`} width={POSTER_W} height={H} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={ui.printTitle(owner)} style={{ width: "100%", height: "auto", display: "block" }}>
      <rect width={POSTER_W} height={H} fill={PAPER} />
      <rect x={22} y={22} width={POSTER_W - 44} height={H - 44} fill="none" stroke={WINE} strokeWidth={3} />
      <rect x={34} y={34} width={POSTER_W - 68} height={H - 68} fill="none" stroke={LINE} strokeWidth={1.2} />
      {/* уголки */}
      {[
        [34, 34, 1, 1],
        [POSTER_W - 34, 34, -1, 1],
        [34, H - 34, 1, -1],
        [POSTER_W - 34, H - 34, -1, -1],
      ].map(([x, y, sx, sy], k) => (
        <path key={k} d={`M${x} ${y + sy * 46} L${x} ${y} L${x + sx * 46} ${y}`} fill="none" stroke={WINE} strokeWidth={4} />
      ))}

      <text x={POSTER_W / 2} y={118} textAnchor="middle" fontFamily={FONT} fontSize={54} letterSpacing={10} fill={WINE}>
        {ui.posterTitle}
      </text>
      <g fill={WINE}>
        <path d={`M${POSTER_W / 2 - 150} 146 H${POSTER_W / 2 - 14}`} stroke={WINE} strokeWidth={1.5} />
        <path d={`M${POSTER_W / 2 + 14} 146 H${POSTER_W / 2 + 150}`} stroke={WINE} strokeWidth={1.5} />
        <path d={`M${POSTER_W / 2} 138 L${POSTER_W / 2 + 8} 146 L${POSTER_W / 2} 154 L${POSTER_W / 2 - 8} 146 Z`} />
      </g>
      <text x={POSTER_W / 2} y={184} textAnchor="middle" fontFamily={FONT} fontSize={21} fontStyle="italic" fill={INK}>
        {data.clan.trim() ? `${ui.clanPrefix}: ${data.clan.trim()}` : ui.posterTagline}
      </text>

      {cols.map(({ line, x }) => {
        const list = data[line];
        const d = posterDepth(list);
        return (
          <g key={line}>
            {both ? (
              <text x={x} y={top - 36} textAnchor="middle" fontFamily={FONT} fontSize={14} letterSpacing={2} fill={WINE}>
                {ui.printLine[line].toUpperCase()}
              </text>
            ) : null}
            {/* ствол: линия через все плашки и к владельцу */}
            <path d={`M${x} ${yOf(d - 1) + 30} V${ownerY - 4}`} stroke={LINE} strokeWidth={2} fill="none" />
            {Array.from({ length: Math.min(d, GENERATIONS) }, (_, i) => {
              const a = list[i];
              const known = !!a.name.trim();
              const name = known ? a.name.trim() : "—";
              const extra = [a.years.trim(), a.place.trim()].filter(Boolean).join(", ");
              return (
                <g key={i}>
                  <rect x={x - plateW / 2} y={yOf(i) - 30} width={plateW} height={extra ? 74 : 62} rx={14} fill={known ? "#fff" : PAPER} stroke={known ? WINE : LINE} strokeWidth={known ? 2 : 1.2} strokeDasharray={known ? undefined : "5 5"} />
                  <text x={x} y={yOf(i) - 12} textAnchor="middle" fontFamily={FONT} fontSize={12} letterSpacing={1} fill={WINE}>
                    {ui.generation(i, line)}
                  </text>
                  <text x={x} y={yOf(i) + 16} textAnchor="middle" fontFamily={FONT} fontSize={known ? nameSize(name, plateW) : 22} fill={known ? INK : LINE}>
                    {name}
                  </text>
                  {extra ? (
                    <text x={x} y={yOf(i) + 36} textAnchor="middle" fontFamily={FONT} fontSize={12} fill="#6b5b5d">
                      {extra.length > 44 ? `${extra.slice(0, 43)}…` : extra}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* владелец: сходятся линии отца и матери */}
      {both ? (
        <g fill="none" stroke={LINE} strokeWidth={2}>
          <path d={`M235 ${ownerY - 4} Q235 ${ownerY + 20} ${POSTER_W / 2 - 70} ${ownerY + 24}`} />
          <path d={`M565 ${ownerY - 4} Q565 ${ownerY + 20} ${POSTER_W / 2 + 70} ${ownerY + 24}`} />
        </g>
      ) : null}
      <rect x={POSTER_W / 2 - 150} y={ownerY + 4} width={300} height={60} rx={30} fill={WINE} />
      <text x={POSTER_W / 2} y={ownerY + 41} textAnchor="middle" fontFamily={FONT} fontSize={owner ? nameSize(owner, 300) + 2 : 22} fill="#fff">
        {owner || ui.you}
      </text>

      <text x={POSTER_W / 2} y={H - 56} textAnchor="middle" fontFamily={FONT} fontSize={13} letterSpacing={3} fill={LINE}>
        MYBOOK.KZ
      </text>
    </svg>
  );
}

/** Текст шежіре одной строкой на колено — для копирования. */
export function posterText(data: Shezhire, ui: ShezhireUi): string {
  const parts = [ui.printTitle(data.owner.trim())];
  if (data.clan.trim()) parts.push(`${ui.clanPrefix}: ${data.clan.trim()}`);
  for (const line of ["father", "mother"] as const) {
    const d = posterDepth(data[line]);
    if (!d) continue;
    parts.push("", ui.printLine[line]);
    data[line].slice(0, d).forEach((a, i) => parts.push(`${i + 1}. ${ui.generation(i, line)}: ${a.name.trim() ? ancestorLine(a) : ui.unknown}`));
  }
  return parts.join("\n");
}

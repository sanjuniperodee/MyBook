import "server-only";
import type { ReactNode } from "react";
import { Document, Line, Page, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { BookFormat, CoverGeometry, CoverZone } from "@/lib/book/formats";
import { mm, print } from "@/lib/book/formats";
import { interiorMetrics } from "@/lib/book/layout";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { site } from "@/config/site";

/**
 * Чертежи для типографии: каркас развёртки обложки с размерами (корешок, расставы, отступы)
 * и схема блока (обрез, вылеты, поля). Всё в масштабе 1:1 для обложки — файл можно положить под макет.
 */

const RED = "#d9262c";
const BLUE = "#2563eb";
const INK = "#1c1c1c";
const GREY = "#8a8a8a";

const num = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

/** Текст, повёрнутый на -90° вокруг центра (cx, cy), все величины в мм. */
function Rotated({ cx, cy, length, thickness, children }: { cx: number; cy: number; length: number; thickness: number; children: ReactNode }) {
  return (
    <View
      style={{
        position: "absolute",
        left: mm(cx - length / 2),
        top: mm(cy - thickness / 2),
        width: mm(length),
        height: mm(thickness),
        justifyContent: "center",
        alignItems: "center",
        transform: "rotate(-90deg)",
      }}
    >
      {children}
    </View>
  );
}

/** Подложка под подписи, когда каркас лежит поверх дизайна: текст читается на любом фоне. */
const PLATE = { backgroundColor: "#ffffff", paddingHorizontal: 1.5 } as const;

function Label({ x, y, w, size = 7, color = INK, bold = false, plate = false, children }: { x: number; y: number; w: number; size?: number; color?: string; bold?: boolean; plate?: boolean; children: ReactNode }) {
  return (
    <View style={{ position: "absolute", left: mm(x), top: mm(y), width: mm(w), alignItems: "center" }}>
      <Text style={{ textAlign: "center", ...face("onest", bold ? 600 : 400), fontSize: size, color, ...(plate ? PLATE : {}) }}>{children}</Text>
    </View>
  );
}

export interface LayoutSchemeInput {
  format: BookFormat;
  geometry: CoverGeometry;
  zones: CoverZone[];
  pageCount: number;
  spineMm: number;
  title: string;
  names: string;
  orderNumber?: number;
}

/** `overlay` — каркас поверх готовой обложки (прозрачный фон, подписи на подложках); иначе чистый чертёж. */
function CoverFramePage({ format, geometry: g, zones, pageCount, spineMm, title, names, orderNumber, overlay = false }: LayoutSchemeInput & { overlay?: boolean }) {
  const W = g.width;
  const H = g.height;
  const { wrapMm, hingeMm, boardOverhangMm } = print.cover;
  const back = g.back!;
  const spine = g.spine!;
  const spineText = [title, names].filter(Boolean).join("   ·   ");
  const spineFont = Math.min(mm(spine.w * 0.42), 11);
  const boardTop = back.y;
  const boardBottom = back.y + back.h;
  const rowSeg = 6.5; // линия размеров по зонам, мм от верхнего края
  const rowTotal = 14; // общая ширина
  const ink = overlay ? RED : INK;
  const plate = overlay;

  return (
    <Page size={{ width: mm(W), height: mm(H) }} style={{ position: "relative", ...(overlay ? {} : { backgroundColor: "#ffffff" }) }}>
      {/* Высота SVG на 0,01 pt меньше страницы: при точном совпадении react-pdf переносит слой на новую страницу. */}
      <Svg width={mm(W)} height={mm(H) - 0.01} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Отступ по периметру (загиб на картон) */}
        {overlay ? null : <Rect x={0} y={0} width={W} height={H} fill="#f2f2f2" />}
        {/* Расставы */}
        {zones
          .filter((z) => z.key === "hingeLeft" || z.key === "hingeRight")
          .map((z) => (
            <Rect key={z.key} x={z.x} y={boardTop} width={z.w} height={back.h} fill={overlay ? BLUE : "#e6eefc"} fillOpacity={overlay ? 0.2 : 1} />
          ))}
        {/* Крышки и корешок */}
        <Rect x={back.x} y={boardTop} width={back.w} height={back.h} fill={overlay ? "none" : "#ffffff"} stroke={RED} strokeWidth={0.35} />
        <Rect x={g.front.x} y={boardTop} width={g.front.w} height={g.front.h} fill={overlay ? "none" : "#ffffff"} stroke={RED} strokeWidth={0.35} />
        <Rect x={spine.x} y={boardTop} width={spine.w} height={spine.h} fill={overlay ? "none" : "#fdecec"} stroke={RED} strokeWidth={0.35} />
        {/* Линии сгибов */}
        {(g.folds ?? []).map((x) => (
          <Line key={x} x1={x} y1={0} x2={x} y2={H} stroke={BLUE} strokeWidth={0.15} strokeDasharray="2 1.5" />
        ))}
        {/* Размерные линии по ширине: зоны и общая */}
        {zones.map((z) => (
          <Line key={`t${z.key}`} x1={z.x} y1={rowSeg - 2} x2={z.x} y2={rowSeg + 1.2} stroke={ink} strokeWidth={0.2} />
        ))}
        <Line x1={W} y1={rowSeg - 2} x2={W} y2={rowSeg + 1.2} stroke={ink} strokeWidth={0.2} />
        <Line x1={0} y1={rowSeg} x2={W} y2={rowSeg} stroke={ink} strokeWidth={0.2} />
        <Line x1={0} y1={rowTotal - 2} x2={0} y2={rowTotal + 1.2} stroke={ink} strokeWidth={0.2} />
        <Line x1={W} y1={rowTotal - 2} x2={W} y2={rowTotal + 1.2} stroke={ink} strokeWidth={0.2} />
        <Line x1={0} y1={rowTotal} x2={W} y2={rowTotal} stroke={ink} strokeWidth={0.2} />
        {/* Размерные линии по высоте: картон и общая (слева) */}
        <Line x1={rowSeg - 2} y1={boardTop} x2={rowSeg + 1.2} y2={boardTop} stroke={ink} strokeWidth={0.2} />
        <Line x1={rowSeg - 2} y1={boardBottom} x2={rowSeg + 1.2} y2={boardBottom} stroke={ink} strokeWidth={0.2} />
        <Line x1={rowSeg} y1={boardTop} x2={rowSeg} y2={boardBottom} stroke={ink} strokeWidth={0.2} />
        <Line x1={rowTotal - 2} y1={0} x2={rowTotal + 1.2} y2={0} stroke={ink} strokeWidth={0.2} />
        <Line x1={rowTotal - 2} y1={H} x2={rowTotal + 1.2} y2={H} stroke={ink} strokeWidth={0.2} />
        <Line x1={rowTotal} y1={0} x2={rowTotal} y2={H} stroke={ink} strokeWidth={0.2} />
      </Svg>

      {/* Размеры зон по ширине */}
      {zones.map((z) => (
        <Label key={`l${z.key}`} x={z.x} y={rowSeg - 3.4} w={z.w} size={6.5} bold={z.key === "spine"} plate={plate}>
          {num(z.w)}
        </Label>
      ))}
      <Label x={0} y={rowTotal - 3.9} w={W} size={7.5} bold plate={plate}>
        {`${num(W)} мм — полная ширина развёртки`}
      </Label>
      {/* Высоты (слева, вертикально) */}
      <Rotated cx={rowSeg - 0.9} cy={(boardTop + boardBottom) / 2} length={back.h} thickness={4}>
        <Text style={{ ...face("onest", 400), fontSize: 6.5, color: INK, ...(plate ? PLATE : {}) }}>{num(back.h)}</Text>
      </Rotated>
      <Rotated cx={rowTotal - 2.3} cy={H / 2} length={H} thickness={4}>
        <Text style={{ ...face("onest", 600), fontSize: 7.5, color: INK, ...(plate ? PLATE : {}) }}>{`${num(H)} мм — полная высота`}</Text>
      </Rotated>

      {/* Подписи внутри крышек (на дизайне не нужны — там своя графика) */}
      {(overlay ? [] : [
        { r: back, name: "ЗАДНЯЯ КРЫШКА (оборот)" },
        { r: g.front, name: "ПЕРЕДНЯЯ КРЫШКА (лицо)" },
      ]).map(({ r, name }) => (
        <View key={name} style={{ position: "absolute", left: mm(r.x), top: mm(r.y + r.h / 2 - 12), width: mm(r.w), alignItems: "center" }}>
          <Text style={{ ...face("onest", 600), fontSize: 10, color: RED }}>{name}</Text>
          <Text style={{ ...face("onest", 400), fontSize: 8.5, color: GREY, marginTop: 4 }}>{`${num(r.w)} × ${num(r.h)} мм (картон)`}</Text>
          <Text style={{ ...face("onest", 400), fontSize: 7, color: GREY, marginTop: 2 }}>{`формат блока ${format.widthMm}×${format.heightMm} мм, кант ${boardOverhangMm} мм`}</Text>
        </View>
      ))}

      {/* Корешок: размер и текст, как на макете */}
      <Rotated cx={spine.x + spine.w / 2} cy={boardTop + 16} length={32} thickness={spine.w}>
        <Text style={{ ...face("onest", 600), fontSize: Math.min(7, mm(spine.w * 0.5)), color: RED, ...(plate ? PLATE : {}) }}>{`корешок ${num(spineMm)} мм`}</Text>
      </Rotated>
      {overlay ? null : (
        <Rotated cx={spine.x + spine.w / 2} cy={boardTop + 32 + (spine.h - 32) / 2} length={spine.h - 36} thickness={spine.w}>
          <Text style={{ ...face("onest", 600), fontSize: spineFont, color: INK, textAlign: "center", maxLines: 1 }}>{spineText}</Text>
        </Rotated>
      )}

      {/* Подписи расставов */}
      {zones
        .filter((z) => z.key === "hingeLeft" || z.key === "hingeRight")
        .map((z) => (
          <Rotated key={`h${z.key}`} cx={z.x + z.w / 2} cy={boardTop + back.h / 2} length={60} thickness={z.w}>
            <Text style={{ ...face("onest", 400), fontSize: 6.5, color: BLUE, ...(plate ? PLATE : {}) }}>{`расстав ${num(hingeMm)} мм`}</Text>
          </Rotated>
        ))}

      {/* Легенда */}
      <View style={{ position: "absolute", left: mm(wrapMm), top: mm(H - wrapMm + 2.5), width: mm(W - wrapMm * 2), backgroundColor: overlay ? "#ffffff" : "#f2f2f2", padding: overlay ? 3 : 0 }}>
        <Text style={{ ...face("onest", 600), fontSize: 8, color: INK }}>
          {`${overlay ? "Обложка с дизайном и размерами" : "Каркас развёртки обложки"}${orderNumber ? ` — заказ №${orderNumber}` : ""} · «${title}» · ${format.short}, ${pageCount} полос`}
        </Text>
        <Text style={{ ...face("onest", 400), fontSize: 7, color: INK, marginTop: 2 }}>
          {`Корешок ${num(spineMm)} мм · расставы между сгибами ${num(hingeMm)} мм · отступ по периметру ${num(wrapMm)} мм · крышка ${num(back.w)}×${num(back.h)} мм`}
        </Text>
        <Text style={{ ...face("onest", 400), fontSize: 6.5, color: GREY, marginTop: 2 }}>
          {`Красное — картон крышек и корешка · синий пунктир — сгибы · по периметру — загиб на картон (включает вылет). Масштаб 1:1, размеры в мм.`}
        </Text>
      </View>
    </Page>
  );
}

const A4 = { width: 297, height: 210 };

function BlockSchemePage({ format, pageCount, title, orderNumber }: LayoutSchemeInput) {
  const bleed = print.bleedMm;
  const m = interiorMetrics[format.id];
  const k = Math.min(115 / (format.heightMm + bleed * 2), 90 / (format.widthMm + bleed * 2)); // масштаб чертежа
  const ox = 22; // левый верхний угол чертежа (с вылетом), мм
  const oy = 34;
  const bw = (format.widthMm + bleed * 2) * k;
  const bh = (format.heightMm + bleed * 2) * k;
  const tx = ox + bleed * k;
  const ty = oy + bleed * k;
  const tw = format.widthMm * k;
  const th = format.heightMm * k;
  // Правая полоса (нечётная): корешок слева. Поля: внутреннее — к корешку.
  const sx = tx + m.marginInner * k;
  const sy = ty + m.marginTop * k;
  const sw = (format.widthMm - m.marginInner - m.marginOuter) * k;
  const sh = (format.heightMm - m.marginTop - m.marginBottom) * k;

  const rows: [string, string][] = [
    ["Формат блока (обрезной)", `${format.widthMm} × ${format.heightMm} мм`],
    ["Размер файла с вылетами", `${format.widthMm + bleed * 2} × ${format.heightMm + bleed * 2} мм (по ${bleed} мм с каждой стороны)`],
    ["Объём блока", `${pageCount} полос (${pageCount / 2} листов), красочность 4+4`],
    ["Поля текста от реза", `верх ${m.marginTop} · низ ${m.marginBottom} · внутр. ${m.marginInner} · внеш. ${m.marginOuter} мм`],
    ["Бумага блока", `мелованная матовая, ≈ ${print.sheetThicknessMm * 1000} мкм на лист (2 полосы)`],
    ["Переплёт", "твёрдый, 7БЦ, шитьё нитками, тетради по 4 полосы"],
    ["Обложка: развёртка", "см. страницу 1 (корешок, расставы, отступы)"],
    ["Цвет, разрешение", `RGB (sRGB), изображения ${print.dpi} dpi, шрифты внедрены`],
  ];

  return (
    <Page size={{ width: mm(A4.width), height: mm(A4.height) }} style={{ position: "relative", backgroundColor: "#ffffff" }}>
      <Text style={{ position: "absolute", left: mm(14), top: mm(11), ...face("onest", 600), fontSize: 14, color: INK }}>
        {`Схема блока${orderNumber ? ` — заказ №${orderNumber}` : ""}`}
      </Text>
      <Text style={{ position: "absolute", left: mm(14), top: mm(19), ...face("onest", 400), fontSize: 8, color: GREY }}>{`«${title}» · ${site.name}`}</Text>

      <Svg width={mm(A4.width)} height={mm(A4.height) - 0.01} viewBox={`0 0 ${A4.width} ${A4.height}`} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Вылет */}
        <Rect x={ox} y={oy} width={bw} height={bh} fill="#fdecec" stroke={RED} strokeWidth={0.25} strokeDasharray="1.5 1" />
        {/* Обрез */}
        <Rect x={tx} y={ty} width={tw} height={th} fill="#ffffff" stroke={INK} strokeWidth={0.35} />
        {/* Область текста */}
        <Rect x={sx} y={sy} width={sw} height={sh} fill="none" stroke={BLUE} strokeWidth={0.25} strokeDasharray="1.5 1" />
        {/* Корешок блока слева */}
        <Line x1={tx} y1={ty - 4} x2={tx} y2={ty + th + 4} stroke={GREY} strokeWidth={0.4} />
        {/* Размеры */}
        <Line x1={tx} y1={oy - 6} x2={tx + tw} y2={oy - 6} stroke={INK} strokeWidth={0.2} />
        <Line x1={tx} y1={oy - 7.5} x2={tx} y2={oy - 4.5} stroke={INK} strokeWidth={0.2} />
        <Line x1={tx + tw} y1={oy - 7.5} x2={tx + tw} y2={oy - 4.5} stroke={INK} strokeWidth={0.2} />
        <Line x1={ox - 6} y1={ty} x2={ox - 6} y2={ty + th} stroke={INK} strokeWidth={0.2} />
        <Line x1={ox - 7.5} y1={ty} x2={ox - 4.5} y2={ty} stroke={INK} strokeWidth={0.2} />
        <Line x1={ox - 7.5} y1={ty + th} x2={ox - 4.5} y2={ty + th} stroke={INK} strokeWidth={0.2} />
      </Svg>
      <Label x={tx} y={oy - 10} w={tw} size={7.5} bold>{`${format.widthMm} мм`}</Label>
      <Rotated cx={ox - 8} cy={ty + th / 2} length={th} thickness={4}>
        <Text style={{ ...face("onest", 600), fontSize: 7.5, color: INK }}>{`${format.heightMm} мм`}</Text>
      </Rotated>
      <Label x={ox} y={oy + bh + 2.5} w={bw} size={6.5} color={RED}>{`вылет ${bleed} мм по периметру`}</Label>
      <Label x={sx} y={sy + sh / 2 - 3} w={sw} size={7} color={BLUE}>{`область текста\n${num(format.widthMm - m.marginInner - m.marginOuter)} × ${num(format.heightMm - m.marginTop - m.marginBottom)} мм`}</Label>
      <Text style={{ position: "absolute", left: mm(ox), top: mm(oy + bh + 8), width: mm(bw + 20), ...face("onest", 400), fontSize: 6.5, color: GREY }}>
        {`Нечётная полоса: корешок слева, внутреннее поле ${m.marginInner} мм. Чёрная рамка — линия реза, красный пунктир — вылет, синий — область текста.`}
      </Text>

      {/* Таблица параметров */}
      <View style={{ position: "absolute", left: mm(128), top: mm(34), width: mm(155) }}>
        {rows.map(([k2, v]) => (
          <View key={k2} style={{ flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#d6d6d6", paddingVertical: 4 }}>
            <Text style={{ ...face("onest", 400), fontSize: 8, color: GREY, width: mm(46) }}>{k2}</Text>
            <Text style={{ ...face("onest", 500), fontSize: 8, color: INK, flex: 1 }}>{v}</Text>
          </View>
        ))}
      </View>
    </Page>
  );
}

export function LayoutSchemeDocument(props: LayoutSchemeInput) {
  return (
    <Document title={`Каркас и схемы для типографии — ${props.title}`} creator={site.name} producer={site.name}>
      <CoverFramePage {...props} overlay />
      <CoverFramePage {...props} />
      <BlockSchemePage {...props} />
    </Document>
  );
}

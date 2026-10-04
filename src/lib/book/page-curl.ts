/**
 * Изгиб переворачиваемого листа. Лист — кривая в плоскости «ширина × глубина» с началом на оси корешка:
 * угол касательной меняется вдоль листа, поэтому у корешка он повёрнут сильнее, чем кончик отстаёт («бумага сопротивляется воздуху»).
 * Длина листа сохраняется — бумага не растягивается. Чистые функции без three.js и DOM — проверяются тестами.
 */

/** Насколько кончик листа отстаёт от корешка в середине переворота (доля полного угла π). */
export const CURL_LAG = 0.24;
/** Сегментов по ширине листа: хватает для плавного изгиба и дёшево пересчитывается каждый кадр. */
export const CURL_SEGMENTS = 28;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Угол касательной в точке листа u (0 — корешок, 1 — кончик) при ходе переворота t (0 — лежит справа, 1 — слева).
 * 0 — вдоль +x (вправо), π — вдоль −x (влево), π/2 — поднят к зрителю (+z).
 * span — полный угол переворота: π, если книга раскрыта плоско, и меньше, если лист ложится под углом (книга «домиком»).
 */
export function curlAngle(t: number, u: number, lag = CURL_LAG, span = Math.PI): number {
  const tt = clamp01(t);
  return span * tt - lag * Math.sin(Math.PI * tt) * clamp01(u) * span * 0.5;
}

export interface CurlCurve {
  /** Координаты узлов кривой (segments + 1 штук): x — вдоль книги от корешка, z — к зрителю. */
  x: Float32Array;
  z: Float32Array;
  /** Нормаль листа в каждом узле: к лицевой стороне, когда лист лежит справа. */
  nx: Float32Array;
  nz: Float32Array;
}

/**
 * Форма листа шириной width при ходе переворота t. offset — подъём листа над серединой блока вдоль его нормали:
 * у лежащего справа листа это +z, у перевёрнутого — −z, как у зеркального отражения стопки.
 */
export function curlCurve(t: number, width: number, offset = 0, segments = CURL_SEGMENTS, lag = CURL_LAG, span = Math.PI): CurlCurve {
  const n = Math.max(1, Math.floor(segments));
  const x = new Float32Array(n + 1);
  const z = new Float32Array(n + 1);
  const nx = new Float32Array(n + 1);
  const nz = new Float32Array(n + 1);
  const dl = width / n;
  let px = 0;
  let pz = 0;
  for (let i = 0; i <= n; i++) {
    const a = curlAngle(t, i / n, lag, span);
    nx[i] = -Math.sin(a);
    nz[i] = Math.cos(a);
    x[i] = px + nx[i] * offset;
    z[i] = pz + nz[i] * offset;
    // Следующий отрезок идёт под средним углом между узлами — длина листа сохраняется ровно.
    const mid = curlAngle(t, (i + 0.5) / n, lag, span);
    px += Math.cos(mid) * dl;
    pz += Math.sin(mid) * dl;
  }
  return { x, z, nx, nz };
}

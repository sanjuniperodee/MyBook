import * as THREE from "three";
import type { BookDims } from "@/lib/book/book-model";
import { curlCurve, CURL_LAG, CURL_SEGMENTS } from "@/lib/book/page-curl";

/** Лист блока: полоса из CURL_SEGMENTS сегментов по ширине; форму задаёт bendLeaf. */
export function leafGeometry() {
  const n = CURL_SEGMENTS;
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const index: number[] = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    uvs.set([u, 1, u, 0], k * 4);
    if (k < n) {
      const a = 2 * k;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/**
 * Пересчитывает форму листа: кривая изгиба в плоскости «ширина × глубина», вытянутая по высоте.
 * t — ход переворота (0…1), zOffset — место листа в блоке, span — угол раскрытия, радианы.
 */
export function bendLeaf(geometry: THREE.BufferGeometry, dims: BookDims, t: number, zOffset: number, sheetThickness: number, span: number) {
  const { block, w: W } = dims;
  const curve = curlCurve(t, block.w, zOffset, CURL_SEGMENTS, CURL_LAG, span);
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const half = block.h / 2;
  // Листы лежат чуть выше собственной плоскости, чтобы не мерцать (z-fighting) на ровной стопке.
  const lift = sheetThickness * 0.02;
  for (let k = 0; k <= CURL_SEGMENTS; k++) {
    const x = -W / 2 + curve.x[k];
    const z = curve.z[k] + curve.nz[k] * lift;
    const o = k * 6;
    arr[o] = x;
    arr[o + 1] = half;
    arr[o + 2] = z;
    arr[o + 3] = x;
    arr[o + 4] = -half;
    arr[o + 5] = z;
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Корешок: изогнутая полоса высотой с книгу, слегка выпуклая, как у настоящей книги в твёрдом переплёте. */
export function spineGeometry(dims: BookDims) {
  const { h: H, d: D } = dims;
  const steps = 18;
  const bulge = Math.min(1.6, D * 0.14);
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    // Локальные координаты: начало — заднее ребро корешка; +z идёт к лицу книги.
    const z = D - t * D;
    const x = -bulge * (1 - Math.pow(2 * t - 1, 2));
    positions.push(x, H / 2, z, x, -H / 2, z);
    // Смотрим слева: +z (лицо книги) справа — значит, u растёт к лицу.
    uvs.push(1 - t, 1, 1 - t, 0);
    if (j < steps) {
      const a = 2 * j;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

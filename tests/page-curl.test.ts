import { describe, expect, it } from "vitest";
import { CURL_SEGMENTS, curlAngle, curlCurve } from "@/lib/book/page-curl";

const segLen = (c: ReturnType<typeof curlCurve>, i: number) => Math.hypot(c.x[i + 1] - c.x[i], c.z[i + 1] - c.z[i]);

describe("curlAngle", () => {
  it("на краях хода лист плоский: везде 0 (справа) или π (слева)", () => {
    for (const u of [0, 0.3, 1]) {
      expect(curlAngle(0, u)).toBeCloseTo(0, 9);
      expect(curlAngle(1, u)).toBeCloseTo(Math.PI, 9);
    }
  });

  it("в середине кончик отстаёт от корешка, угол остаётся в пределах 0…π", () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      expect(curlAngle(t, 1)).toBeLessThanOrEqual(curlAngle(t, 0) + 1e-9);
      for (const u of [0, 0.5, 1]) {
        expect(curlAngle(t, u)).toBeGreaterThanOrEqual(-1e-9);
        expect(curlAngle(t, u)).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });

  it("корешок монотонно поворачивается с ходом переворота", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const a = curlAngle(t, 0);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe("curlCurve", () => {
  const W = 148;

  it("лежащий справа лист — прямая вдоль +x, перевёрнутый — вдоль −x", () => {
    const right = curlCurve(0, W);
    const left = curlCurve(1, W);
    expect(right.x[CURL_SEGMENTS]).toBeCloseTo(W, 3);
    expect(left.x[CURL_SEGMENTS]).toBeCloseTo(-W, 3);
    for (let i = 0; i <= CURL_SEGMENTS; i++) {
      expect(right.z[i]).toBeCloseTo(0, 4);
      expect(left.z[i]).toBeCloseTo(0, 4);
    }
  });

  it("длина листа сохраняется при любом ходе — бумага не растягивается", () => {
    for (const t of [0, 0.1, 0.37, 0.5, 0.8, 1]) {
      const c = curlCurve(t, W);
      let len = 0;
      for (let i = 0; i < CURL_SEGMENTS; i++) len += segLen(c, i);
      expect(len).toBeCloseTo(W, 2);
    }
  });

  it("в середине переворота лист поднят к зрителю (z > 0) и изогнут", () => {
    const c = curlCurve(0.5, W);
    expect(c.z[CURL_SEGMENTS]).toBeGreaterThan(W * 0.5);
    const zs = Array.from(c.z);
    expect(Math.max(...zs)).toBeGreaterThan(0);
    // кончик ближе к корешку по x, чем при плоском листе
    expect(c.x[CURL_SEGMENTS]).toBeLessThan(W);
  });

  it("подъём над серединой блока зеркалится: справа +z, слева −z", () => {
    expect(curlCurve(0, W, 0.4).z[3]).toBeCloseTo(0.4, 4);
    expect(curlCurve(1, W, 0.4).z[3]).toBeCloseTo(-0.4, 4);
  });

  it("нормаль единичная и повёрнута вместе с листом", () => {
    const c = curlCurve(0.5, W);
    for (let i = 0; i <= CURL_SEGMENTS; i++) expect(Math.hypot(c.nx[i], c.nz[i])).toBeCloseTo(1, 5);
    expect(c.nz[0]).toBeCloseTo(Math.cos(curlAngle(0.5, 0)), 5);
  });
});

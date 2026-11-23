import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Буфер воспроизведения звонка (public/wa-call-worklet.js) — обычный JS для AudioWorklet. Здесь он запускается с
 * подменой окружения ворклета: частота 1000 Гц, чтобы секунды были тысячами сэмплов.
 */
const RATE = 1000;
const BLOCK = 128;

interface Processor {
  port: { onmessage: (e: { data: unknown }) => void; postMessage: (m: unknown) => void };
  prime: number;
  underruns: number;
  size: number;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

function load(): Processor {
  const source = readFileSync(join(process.cwd(), "public/wa-call-worklet.js"), "utf8");
  let Cls: (new () => Processor) | null = null;
  class Base {
    port = { onmessage: (() => {}) as (e: { data: unknown }) => void, postMessage: () => {} };
  }
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", source)(Base, (_: string, c: new () => Processor) => (Cls = c), RATE);
  if (!Cls) throw new Error("ворклет не зарегистрировался");
  return new (Cls as new () => Processor)();
}

const feed = (p: Processor, n: number, v = 0.5) => p.port.onmessage({ data: new Float32Array(n).fill(v) });
const tick = (p: Processor) => {
  const out = new Float32Array(BLOCK);
  p.process([[]], [[out]]);
  return out;
};

describe("звонок: буфер воспроизведения собеседника", () => {
  it("молчит, пока не накопилась подушка, затем играет с плавным появлением", () => {
    const p = load();
    feed(p, 100);
    expect(tick(p).every((v) => v === 0)).toBe(true);
    feed(p, 100);
    const out = tick(p);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(0.5);
    expect(out[BLOCK - 1]).toBeCloseTo(0.5);
  });

  it("после провала подушка растёт, а за спокойные 8 с сжимается", () => {
    const p = load();
    const start = p.prime;
    feed(p, 200);
    tick(p);
    tick(p);
    expect(p.underruns).toBe(1);
    expect(p.prime).toBe(start + 60);
    // Ровный поток 8+ секунд без провалов.
    for (let i = 0; i < 70; i++) {
      feed(p, BLOCK);
      tick(p);
    }
    expect(p.prime).toBeLessThan(start + 60);
    expect(p.prime).toBeGreaterThanOrEqual(start);
  });

  it("пачка после рывка сети не копит задержку: лишнее выбрасывается до подушки", () => {
    const p = load();
    feed(p, 2000);
    expect(p.size).toBe(p.prime);
  });

  it("провал не обрывает звук в ноль, а гасит его", () => {
    const p = load();
    feed(p, 130);
    tick(p);
    const out = tick(p);
    const tailStart = 130 - BLOCK;
    expect(out[tailStart]).toBeGreaterThan(0);
    expect(out[tailStart]).toBeLessThan(0.5);
    expect(out[BLOCK - 1]).toBe(0);
  });
});

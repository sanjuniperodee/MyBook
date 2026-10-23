import { describe, expect, it } from "vitest";
import { FRAME_SAMPLES, MicEncoder, PeerDecoder, WIRE_RATE, level } from "@/components/admin/wa-call/pcm";

const sine = (rate: number, freq: number, n: number, from = 0, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * freq * (from + i)) / rate));
const samples = (buf: ArrayBuffer) => Array.from({ length: buf.byteLength / 2 }, (_, i) => new DataView(buf).getInt16(i * 2, true));

/** Частота основного тона по пересечениям нуля. */
const pitch = (xs: ArrayLike<number>, rate: number) => {
  let crossings = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i - 1] < 0 && xs[i] >= 0) crossings++;
  return (crossings * rate) / xs.length;
};

describe("звук звонка WhatsApp: микрофон → шлюз", () => {
  it("48 кГц → кадры по 960 сэмплов 16 кГц s16le; мелкие куски дают ровно столько же, сколько один большой", () => {
    const input = sine(48_000, 440, 48_000);
    const whole = new MicEncoder(48_000).push(input);
    expect(whole).toHaveLength(Math.floor(16_000 / FRAME_SAMPLES));
    expect(whole.every((f) => f.byteLength === FRAME_SAMPLES * 2)).toBe(true);
    const enc = new MicEncoder(48_000);
    const parts: ArrayBuffer[] = [];
    for (let i = 0; i < input.length; i += 128) parts.push(...enc.push(input.subarray(i, i + 128)));
    expect(parts.map(samples)).toEqual(whole.map(samples));
    const out = whole.flatMap(samples);
    expect(Math.abs(pitch(out, WIRE_RATE) - 440)).toBeLessThan(5);
    expect(Math.max(...out)).toBeGreaterThan(0.45 * 0x7fff);
  });

  it("44,1 кГц (дробный шаг) — тот же тон; микрофон выключен — тишина; перегруз — без переполнения", () => {
    const out = new MicEncoder(44_100).push(sine(44_100, 300, 44_100)).flatMap(samples);
    expect(out.length).toBeGreaterThanOrEqual(15 * FRAME_SAMPLES);
    expect(Math.abs(pitch(out, WIRE_RATE) - 300)).toBeLessThan(5);
    expect(new MicEncoder(48_000).push(sine(48_000, 440, 2880), true).flatMap(samples).every((v) => v === 0)).toBe(true);
    const loud = new MicEncoder(16_000).push(Float32Array.from({ length: FRAME_SAMPLES }, (_, i) => (i % 2 ? 3 : -3))).flatMap(samples);
    expect(Math.max(...loud)).toBe(0x7fff);
    expect(Math.min(...loud)).toBe(-0x8000);
  });
});

describe("звук звонка WhatsApp: микрофон ниже 16 кГц", () => {
  it("8 кГц (гарнитура Bluetooth) → вдвое больше сэмплов, тон тот же: голос не ускоряется", () => {
    const out = new MicEncoder(8_000).push(sine(8_000, 300, 8_000)).flatMap(samples);
    expect(Math.abs(out.length - 16_000)).toBeLessThanOrEqual(FRAME_SAMPLES);
    expect(Math.abs(pitch(out, WIRE_RATE) - 300)).toBeLessThan(5);
  });
});

describe("звук звонка WhatsApp: шлюз → динамик", () => {
  const wire = (xs: Float32Array) => {
    const buf = new ArrayBuffer(xs.length * 2);
    xs.forEach((v, i) => new DataView(buf).setInt16(i * 2, Math.round(v * 0x7fff), true));
    return buf;
  };

  it("16 кГц → 48 кГц: втрое больше сэмплов, тот же тон, без скачков на стыках кадров", () => {
    const dec = new PeerDecoder(48_000);
    const src = sine(WIRE_RATE, 440, WIRE_RATE);
    const out: number[] = [];
    for (let i = 0; i < src.length; i += FRAME_SAMPLES) out.push(...dec.push(wire(src.subarray(i, i + FRAME_SAMPLES))));
    expect(Math.abs(out.length - 48_000)).toBeLessThanOrEqual(3);
    expect(Math.abs(pitch(out, 48_000) - 440)).toBeLessThan(5);
    // Соседние сэмплы синуса 440 Гц при 48 кГц отличаются не больше чем на 2π·440/48000·0,5 ≈ 0,029.
    const jump = Math.max(...out.slice(1).map((v, i) => Math.abs(v - out[i])));
    expect(jump).toBeLessThan(0.035);
  });

  it("пустой и нечётный кадр не ломают поток; громкость — RMS", () => {
    const dec = new PeerDecoder(44_100);
    expect(dec.push(new ArrayBuffer(0))).toHaveLength(0);
    expect(dec.push(new ArrayBuffer(3)).length).toBeLessThanOrEqual(3);
    expect(level(new Float32Array(0))).toBe(0);
    expect(level(Float32Array.from([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });
});

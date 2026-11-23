/**
 * Звук звонка WhatsApp между браузером и шлюзом. Шлюз принимает и отдаёт s16le, 16 кГц, моно; браузер пишет и играет на
 * частоте своего AudioContext (обычно 48 или 44,1 кГц) — здесь пересчёт частоты и формата. Без DOM: проверяется тестами.
 */

export const WIRE_RATE = 16_000;
/** Кадр шлюза: 60 мс при 16 кГц (столько он берёт за такт). */
export const FRAME_SAMPLES = 960;

/**
 * Микрофон → шлюз: понижение частоты с усреднением окна (простой фильтр против наложения частот — для речи достаточно) и
 * нарезка на кадры по 960 сэмплов. Состояние между кусками сохраняется: сколько угодно мелких кусков дают ровный поток.
 */
export class MicEncoder {
  private readonly ratio: number;
  private pos = 0;
  private acc = 0;
  private count = 0;
  private last = 0;
  private frame = new Int16Array(FRAME_SAMPLES);
  private filled = 0;

  constructor(inputRate: number) {
    this.ratio = inputRate / WIRE_RATE;
  }

  /** Кусок микрофона (float −1…1) → готовые кадры шлюза (байты s16le). */
  push(input: Float32Array, muted = false): ArrayBuffer[] {
    const out: ArrayBuffer[] = [];
    for (let i = 0; i < input.length; i++) {
      this.acc += muted ? 0 : input[i];
      this.count++;
      this.pos += 1;
      // Частота микрофона ниже 16 кГц (гарнитура Bluetooth в режиме звонка — 8 кГц): на один входной сэмпл — несколько выходных.
      while (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = this.count ? Math.max(-1, Math.min(1, this.acc / this.count)) : this.last;
        this.last = v;
        this.acc = 0;
        this.count = 0;
        this.frame[this.filled++] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
        if (this.filled === FRAME_SAMPLES) {
          out.push(littleEndian(this.frame));
          this.frame = new Int16Array(FRAME_SAMPLES);
          this.filled = 0;
        }
      }
    }
    return out;
  }
}

/** Int16Array → байты little-endian (на всех нынешних процессорах это и есть порядок памяти, но не полагаемся). */
function littleEndian(samples: Int16Array): ArrayBuffer {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
  return buf;
}

/** Шлюз → динамик: s16le 16 кГц → float на частоте AudioContext, линейная интерполяция без щелчков на стыках кусков. */
export class PeerDecoder {
  private readonly step: number;
  private pos = 0;
  private last = 0;

  constructor(outputRate: number) {
    this.step = WIRE_RATE / outputRate;
  }

  push(bytes: ArrayBuffer): Float32Array {
    const view = new DataView(bytes);
    const n = Math.floor(bytes.byteLength / 2);
    if (!n) return new Float32Array(0);
    const sample = (i: number) => (i < 0 ? this.last : view.getInt16(i * 2, true) / 0x8000);
    const out: number[] = [];
    // pos — позиция между предыдущим последним сэмплом (−1) и сэмплами этого куска.
    while (this.pos < n - 1) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      out.push(sample(i) * (1 - f) + sample(i + 1) * f);
      this.pos += this.step;
    }
    this.pos -= n;
    this.last = sample(n - 1);
    return Float32Array.from(out);
  }
}

/** Громкость куска (RMS, 0…1) — индикатор «вас слышно». */
export function level(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Выравнивание громкости собеседника: WhatsApp отдаёт голос тихим (пики около −24 дБ), в динамиках ноутбука его едва
 * слышно. Речь подтягивается к целевой громкости (усиление 1…MAX_GAIN), тишина и шум (ниже NOISE_FLOOR) не усиливаются,
 * усиление меняется плавно внутри куска (без щелчков), пики мягко ограничиваются, чтобы не хрипело.
 */
export class PeerGain {
  static readonly TARGET = 0.12;
  static readonly MAX_GAIN = 6;
  static readonly NOISE_FLOOR = 0.004;
  private gain = 1;
  /** Огибающая громкости речи: растёт быстро, спадает медленно — паузы между словами не раскачивают усиление. */
  private envelope = 0;

  /** Усилить кусок на месте; возвращает его же. */
  process(samples: Float32Array): Float32Array {
    if (!samples.length) return samples;
    const rms = level(samples);
    if (rms > PeerGain.NOISE_FLOOR) this.envelope = rms > this.envelope ? this.envelope * 0.5 + rms * 0.5 : this.envelope * 0.95 + rms * 0.05;
    const want = this.envelope > PeerGain.NOISE_FLOOR ? Math.min(PeerGain.MAX_GAIN, Math.max(1, PeerGain.TARGET / this.envelope)) : this.gain;
    const from = this.gain;
    for (let i = 0; i < samples.length; i++) {
      const g = from + ((want - from) * (i + 1)) / samples.length;
      samples[i] = softClip(samples[i] * g);
    }
    this.gain = want;
    return samples;
  }
}

/** Мягкий ограничитель: до 0,8 — как есть, выше — плавно к 1, без жёсткого среза. */
function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= 0.8) return x;
  return Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
}

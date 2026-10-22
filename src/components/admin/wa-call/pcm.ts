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
      if (this.pos < this.ratio) continue;
      this.pos -= this.ratio;
      const v = Math.max(-1, Math.min(1, this.acc / this.count));
      this.acc = 0;
      this.count = 0;
      this.frame[this.filled++] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
      if (this.filled === FRAME_SAMPLES) {
        out.push(littleEndian(this.frame));
        this.frame = new Int16Array(FRAME_SAMPLES);
        this.filled = 0;
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

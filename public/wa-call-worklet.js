/**
 * Звук звонка WhatsApp в CRM (src/components/admin/wa-call/engine.ts), поток AudioWorklet:
 * - вход (микрофон) — куски по ~1024 сэмпла в основной поток, там они пересчитываются в кадры шлюза;
 * - выход (собеседник) — очередь сэмплов из основного потока с подушкой против рывков сети: играем, когда накопилось
 *   PRIME сэмплов; опустела — тишина и снова ждём подушку; слишком отстали — выбрасываем старое, чтобы не копить задержку.
 */
const POST_EVERY = 1024;

class WaCallProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.prime = Math.round(sampleRate * 0.12);
    this.maxQueue = Math.round(sampleRate * 0.5);
    this.queue = new Float32Array(this.maxQueue * 2);
    this.head = 0;
    this.size = 0;
    this.playing = false;
    this.mic = new Float32Array(POST_EVERY);
    this.micFill = 0;
    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        this.size = 0;
        this.playing = false;
        return;
      }
      this.enqueue(e.data);
    };
  }

  enqueue(samples) {
    const cap = this.queue.length;
    for (let i = 0; i < samples.length; i++) {
      if (this.size === cap) {
        this.head = (this.head + 1) % cap;
        this.size--;
      }
      this.queue[(this.head + this.size) % cap] = samples[i];
      this.size++;
    }
    // Задержка выросла (сеть отдала пачку) — догоняем, оставляя подушку.
    if (this.size > this.maxQueue) {
      const drop = this.size - this.prime;
      this.head = (this.head + drop) % cap;
      this.size -= drop;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this.mic[this.micFill++] = input[i];
        if (this.micFill === POST_EVERY) {
          this.port.postMessage(this.mic, [this.mic.buffer]);
          this.mic = new Float32Array(POST_EVERY);
          this.micFill = 0;
        }
      }
    }
    const out = outputs[0];
    const channel = out[0];
    if (!this.playing && this.size >= this.prime) this.playing = true;
    const cap = this.queue.length;
    for (let i = 0; i < channel.length; i++) {
      if (this.playing && this.size > 0) {
        channel[i] = this.queue[this.head];
        this.head = (this.head + 1) % cap;
        this.size--;
      } else {
        channel[i] = 0;
        if (this.playing) this.playing = false;
      }
    }
    for (let c = 1; c < out.length; c++) out[c].set(channel);
    return true;
  }
}

registerProcessor("wa-call", WaCallProcessor);

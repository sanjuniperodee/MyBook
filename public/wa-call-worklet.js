/**
 * Звук звонка WhatsApp в CRM (src/components/admin/wa-call/engine.ts), поток AudioWorklet:
 * - вход (микрофон) — куски по ~1024 сэмпла в основной поток, там они пересчитываются в кадры шлюза;
 * - выход (собеседник) — очередь сэмплов из основного потока с подушкой против рывков сети (адаптивный джиттер-буфер):
 *   играем, когда накопилась подушка; опустела — плавно гасим звук и ждём подушку снова, причём подушка после каждого
 *   провала растёт (сеть или вкладка неровные), а за 8 с без провалов понемногу сжимается обратно; слишком отстали —
 *   выбрасываем старое до подушки, чтобы задержка не копилась.
 */
const POST_EVERY = 1024;
/** Плавное появление и затухание звука на стыках с тишиной — без щелчков. */
const FADE_SEC = 0.005;
const MIN_PRIME_SEC = 0.12;
const MAX_PRIME_SEC = 0.36;
/** На сколько растёт подушка после провала и на сколько сжимается после спокойного отрезка. */
const GROW_SEC = 0.06;
const SHRINK_SEC = 0.02;
const CALM_SEC = 8;
/** Сколько сверх подушки можно накопить, прежде чем выбросить старое. */
const SLACK_SEC = 0.3;

class WaCallProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.minPrime = Math.round(sampleRate * MIN_PRIME_SEC);
    this.maxPrime = Math.round(sampleRate * MAX_PRIME_SEC);
    this.grow = Math.round(sampleRate * GROW_SEC);
    this.shrink = Math.round(sampleRate * SHRINK_SEC);
    this.calmLimit = Math.round(sampleRate * CALM_SEC);
    this.slack = Math.round(sampleRate * SLACK_SEC);
    this.fadeStep = 1 / (sampleRate * FADE_SEC);
    this.prime = this.minPrime;
    this.queue = new Float32Array(Math.round(sampleRate * 2));
    this.head = 0;
    this.size = 0;
    this.playing = false;
    this.fade = 0;
    this.last = 0;
    this.calm = 0;
    this.underruns = 0;
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
    if (this.size > this.prime + this.slack) {
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
        const v = this.queue[this.head];
        this.head = (this.head + 1) % cap;
        this.size--;
        if (this.fade < 1) this.fade = Math.min(1, this.fade + this.fadeStep);
        channel[i] = v * this.fade;
        this.last = v;
      } else {
        if (this.playing) {
          // Провал: звук кончился посреди разговора — подушку побольше, счёт спокойного времени заново.
          this.playing = false;
          this.underruns++;
          this.prime = Math.min(this.maxPrime, this.prime + this.grow);
          this.calm = 0;
        }
        // Хвост последнего сэмпла гаснет за несколько миллисекунд вместо обрыва в ноль.
        if (this.fade > 0) this.fade = Math.max(0, this.fade - this.fadeStep);
        channel[i] = this.last * this.fade;
      }
    }
    if (this.playing) {
      this.calm += channel.length;
      if (this.calm >= this.calmLimit) {
        this.calm = 0;
        this.prime = Math.max(this.minPrime, this.prime - this.shrink);
      }
    }
    for (let c = 1; c < out.length; c++) out[c].set(channel);
    return true;
  }
}

registerProcessor("wa-call", WaCallProcessor);

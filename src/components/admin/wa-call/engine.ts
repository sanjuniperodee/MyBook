"use client";

import { MicEncoder, PeerDecoder, level } from "./pcm";

export type CallAudioEvent =
  /** Пошёл звук собеседника — для исходящего это значит, что он взял трубку. */
  | { type: "peer" }
  /** Шлюз сообщил, что звонок закончился. */
  | { type: "ended" }
  /** Связь с аудиопотоком пропала и не восстановилась. */
  | { type: "lost" }
  | { type: "reconnecting" }
  | { type: "connected" }
  /** Громкость микрофона (0…1) — индикатор «вас слышно», несколько раз в секунду. */
  | { type: "level"; value: number };

/** Ошибка микрофона или браузера — текстом для сотрудника. */
export class CallAudioError extends Error {}

/** Паузы между попытками восстановить аудиопоток: всего ~12 с, дальше звонок считается оборванным. */
const RETRY_MS = [300, 700, 1500, 3000, 6000];
/** Отправка застряла (сеть) больше чем на ~1 с звука — новые кадры выбрасываем: звонок живой, а не запись. */
const MAX_BUFFERED = 32_000;

/** Адрес аудиопотока звонка на сайте: nginx пропускает его к шлюзу после проверки сессии (deploy/nginx-mybook.conf). */
export const audioUrl = (callId: string, loc: Pick<Location, "protocol" | "host"> = window.location) => `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/wa-call/audio?call_id=${encodeURIComponent(callId)}`;

function micError(err: unknown): CallAudioError {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return new CallAudioError("Разрешите доступ к микрофону для этого сайта — без него звонок не начать");
  if (name === "NotFoundError" || name === "OverconstrainedError") return new CallAudioError("Микрофон не найден — подключите гарнитуру или микрофон");
  if (name === "NotReadableError") return new CallAudioError("Микрофон занят другой программой");
  return new CallAudioError("Не удалось включить микрофон");
}

/**
 * Звук звонка WhatsApp в браузере: микрофон → шлюз и шлюз → динамик через WebSocket (кадры s16le 16 кГц), AudioWorklet
 * без задержек основного потока. Открывать из обработчика нажатия: браузер разрешает звук только после действия
 * пользователя, поэтому AudioContext создаётся до первого await.
 */
export class CallAudio {
  private socket: WebSocket | null = null;
  private callId = "";
  private closed = false;
  private ended = false;
  private heard = false;
  private retries = 0;
  private muted = false;
  private lastLevel = 0;
  private tone: { stop(): void } | null = null;
  private listener: (e: CallAudioEvent) => void = () => {};
  private readonly encoder: MicEncoder;
  private readonly decoder: PeerDecoder;

  private constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
    private readonly node: AudioWorkletNode,
  ) {
    this.encoder = new MicEncoder(ctx.sampleRate);
    this.decoder = new PeerDecoder(ctx.sampleRate);
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onMic(e.data);
  }

  /** Микрофон и звук. Ошибка — CallAudioError с понятным текстом (нет доступа, нет микрофона, не https). */
  static open(): Promise<CallAudio> {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || typeof AudioWorkletNode === "undefined") return Promise.reject(new CallAudioError("Этот браузер не умеет звонки — откройте CRM в свежем Chrome, Safari или Edge"));
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return Promise.reject(new CallAudioError("Звонки работают только по защищённому адресу (https)"));
    const ctx = new Ctx({ latencyHint: "interactive" });
    void ctx.resume();
    return (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (err) {
        void ctx.close();
        throw micError(err);
      }
      try {
        await ctx.audioWorklet.addModule("/wa-call-worklet.js");
        const node = new AudioWorkletNode(ctx, "wa-call", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        ctx.createMediaStreamSource(stream).connect(node);
        node.connect(ctx.destination);
        if (ctx.state !== "running") await ctx.resume().catch(() => {});
        return new CallAudio(ctx, stream, node);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        throw new CallAudioError("Не удалось включить звук звонка");
      }
    })();
  }

  /** Подключить звук к звонку. События — в listener; повторный вызов не нужен: обрывы восстанавливаются сами. */
  connect(callId: string, listener: (e: CallAudioEvent) => void) {
    this.callId = callId;
    this.listener = listener;
    this.dial();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  /** Гудки, пока собеседник не взял трубку (шлюз их не передаёт): 425 Гц, секунда звука, три — тишина. */
  ringback(on: boolean) {
    if (!on || this.closed) {
      this.tone?.stop();
      this.tone = null;
      return;
    }
    if (this.tone) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = 425;
    gain.gain.value = 0;
    const t0 = this.ctx.currentTime + 0.05;
    // Расписание на 2 минуты вперёд — дольше WhatsApp не звонит.
    for (let t = t0; t < t0 + 120; t += 4) {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
      gain.gain.setValueAtTime(0.06, t + 1);
      gain.gain.linearRampToValueAtTime(0, t + 1.02);
    }
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    this.tone = { stop: () => (osc.stop(), osc.disconnect(), gain.disconnect()) };
  }

  /** Освободить микрофон и звук. Трубку в шлюзе кладёт не это, а «Завершить» (сервер). */
  close() {
    if (this.closed) return;
    this.ringback(false);
    this.closed = true;
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close().catch(() => {});
  }

  private dial() {
    if (this.closed || this.ended) return;
    const ws = new WebSocket(audioUrl(this.callId));
    ws.binaryType = "arraybuffer";
    this.socket = ws;
    ws.onopen = () => {
      if (this.retries) this.listener({ type: "connected" });
      this.retries = 0;
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        // «call ended» — звонок закончился; другой текст — шлюз не нашёл звонок (он уже кончился) или не смог его подключить.
        this.ended = true;
        this.listener({ type: "ended" });
        return;
      }
      const samples = this.decoder.push(e.data as ArrayBuffer);
      if (!samples.length) return;
      this.node.port.postMessage(samples, [samples.buffer]);
      if (!this.heard) {
        this.heard = true;
        this.listener({ type: "peer" });
      }
    };
    ws.onclose = () => {
      if (this.socket !== ws || this.closed || this.ended) return;
      this.socket = null;
      const wait = RETRY_MS[this.retries++];
      if (wait === undefined) return this.listener({ type: "lost" });
      this.listener({ type: "reconnecting" });
      this.node.port.postMessage("flush");
      setTimeout(() => this.dial(), wait);
    };
  }

  private onMic(chunk: Float32Array) {
    const now = performance.now();
    if (now - this.lastLevel > 150) {
      this.lastLevel = now;
      this.listener({ type: "level", value: this.muted ? 0 : level(chunk) });
    }
    const frames = this.encoder.push(chunk, this.muted);
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const f of frames) if (ws.bufferedAmount < MAX_BUFFERED) ws.send(f);
  }
}

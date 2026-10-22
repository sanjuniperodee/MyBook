import type { Clock } from "@/shared/application";
import { TelephonyError, type Call, type CallEvent } from "../domain";
import type { CallsService } from "./services";
import type { CallRepository } from "./ports";

export const WHATSAPP = "whatsapp";

/** Входящий звонит в WhatsApp около минуты; без ответа дольше — звонящий уже положил трубку. Так же — недозвон исходящего. */
export const WHATSAPP_RING_MS = 90_000;
/** Вкладка сотрудника во время разговора отмечается раз в 15 с; молчит дольше 45 с — вкладки нет (закрыли, сон, сеть). */
export const WHATSAPP_HEARTBEAT_MS = 15_000;
export const WHATSAPP_SILENT_MS = 45_000;

/** Звонки шлюза WhatsApp (GOWA со звонками): набрать, ответить, положить трубку. Ошибки — TelephonyError с понятным текстом. */
export interface WhatsappCallGateway {
  /** Звонки включены в «Интеграциях» и WhatsApp работает через свой шлюз. */
  enabled(): Promise<boolean>;
  /** Позвонить; возвращает id звонка WhatsApp. */
  start(phone: string): Promise<string>;
  answer(callId: string): Promise<void>;
  hangup(callId: string): Promise<void>;
}

/** Записи разговоров WhatsApp: куски из браузера и готовый файл для прослушивания. */
export interface CallRecordingStore {
  /** Кусок записи номер seq (по порядку с 0) в формате mime (audio/webm, audio/mp4, audio/ogg). */
  append(callId: string, seq: number, mime: string, data: Uint8Array): Promise<void>;
  /** Файл записи законченного звонка (склеивается при первом обращении); null — записи нет. */
  file(callId: string): Promise<{ path: string; mime: string } | null>;
}

/** После конца звонка вкладка ещё доотправляет хвост записи — столько его принимаем. */
export const WHATSAPP_RECORDING_TAIL_MS = 5 * 60_000;

/** Хранилище живых звонков WhatsApp: кто ответил первым, признак жизни вкладки, зависшие звонки. */
export interface LiveCallRepository {
  findById(id: string): Promise<Call | null>;
  /**
   * Взять звонящий входящий себе (ответ ещё не подтверждён шлюзом): атомарно, только первый сотрудник. Звонок остаётся
   * «звонит» без времени ответа — если звонящий положит трубку в эту секунду, звонок закроется пропущенным, а не разговором.
   * false — уже взял другой или звонок завершён.
   */
  claimAnswer(id: string, staffId: string, at: Date): Promise<boolean>;
  /** Шлюз не ответил на звонок — снова ничей. */
  releaseClaim(id: string, staffId: string): Promise<void>;
  /** Вкладка сотрудника на связи. false — звонка нет, он завершён или чужой. */
  heartbeat(id: string, staffId: string, at: Date): Promise<boolean>;
  /** У звонка есть запись (показать плеер в «Звонках»). */
  markRecorded(id: string): Promise<void>;
  /** Незавершённые звонки WhatsApp: без ответа дольше ringMs (и вкладка не отмечается) или с ответом, но вкладка молчит дольше silentMs. */
  stale(now: Date, opts: { ringMs: number; silentMs: number }): Promise<{ call: Call; lastSeen: Date | null }[]>;
}

const notFound = () => new TelephonyError("notFound", "Звонок не найден");
const ended = () => new TelephonyError("notFound", "Звонок уже завершён");

/**
 * Звонки WhatsApp прямо из CRM: голос идёт через шлюз номера магазина, а звук — через браузер сотрудника. Журнал, сделки,
 * лента клиента и пропущенные — общие с АТС (CallsService): звонок WhatsApp — такой же звонок с provider = "whatsapp".
 *
 * Шлюз не сообщает вебхуком ни об ответе собеседника, ни о конце звонка. Конец приходит из служебного сокета шлюза
 * (endedByGateway) и из вкладки сотрудника; ответ собеседника — по первым звукам из аудиопотока (connected). Что не дошло
 * (вкладку закрыли, шлюз перезапустили), закрывает планировщик — sweep.
 */
export class WhatsappCallsService {
  constructor(
    private readonly calls: CallsService,
    private readonly repo: Pick<CallRepository, "findByExternal"> & LiveCallRepository,
    private readonly gateway: WhatsappCallGateway,
    private readonly clock: Clock,
    private readonly recordings: CallRecordingStore,
  ) {}

  enabled() {
    return this.gateway.enabled();
  }

  /** Идущий звонок по id звонка WhatsApp — для пропуска к аудиопотоку и прослушке; завершённый — null. */
  async liveCall(callId: string) {
    const call = await this.repo.findByExternal(WHATSAPP, callId);
    return call && !call.isFinished ? { id: call.id, staffId: call.staffId, answered: !!call.answeredAt, clientPhone: call.clientPhone } : null;
  }

  /** Входящий звонок из вебхука шлюза: звонит в CRM, пока кто-то не ответит или звонящий не положит трубку. */
  incoming(e: CallEvent) {
    return this.calls.handle(e);
  }

  /** Позвонить клиенту: шлюз набирает номер, в журнале — исходящий «набираю» за сотрудником. */
  async dial(input: { staffId: string; phone: string }): Promise<{ id: string; callId: string }> {
    if (!(await this.gateway.enabled())) throw new TelephonyError("notConfigured", "Звонки WhatsApp выключены — их включают в «Интеграциях»");
    const callId = await this.gateway.start(input.phone);
    try {
      const now = this.clock.now();
      const call = await this.calls.handle({ provider: WHATSAPP, externalId: callId, stage: "start", direction: "out", clientPhone: input.phone, extension: null, staffId: input.staffId, at: now });
      if (!call) throw notFound();
      await this.repo.heartbeat(call.id, input.staffId, now);
      return { id: call.id, callId };
    } catch (err) {
      // Без записи в журнале звонок никто не увидит и не завершит — кладём трубку сразу.
      await this.gateway.hangup(callId).catch(() => {});
      throw err;
    }
  }

  /** Ответить на входящий. Звонок звонит всем — забирает его первый ответивший. */
  async answer(id: string, staffId: string): Promise<{ callId: string }> {
    const call = await this.repo.findById(id);
    if (!call || call.provider !== WHATSAPP || call.direction !== "in") throw notFound();
    if (call.isFinished) throw ended();
    if (!(await this.repo.claimAnswer(id, staffId, this.clock.now()))) {
      const fresh = await this.repo.findById(id);
      throw fresh?.isFinished ? ended() : new TelephonyError("notFound", "На звонок уже ответил другой сотрудник");
    }
    try {
      await this.gateway.answer(call.externalId);
    } catch (err) {
      // Звонящий успел положить трубку (или шлюз не ответил вовремя): разговора не было — звонок пропущенный. Трубку в шлюзе
      // кладём на всякий случай: если ответ всё же дошёл, звонящий не должен остаться на линии без сотрудника.
      await this.gateway.hangup(call.externalId).catch(() => {});
      await this.repo.releaseClaim(id, staffId);
      const fresh = await this.repo.findById(id);
      if (fresh) await this.finish(fresh, this.clock.now());
      throw err;
    }
    const now = this.clock.now();
    await this.repo.heartbeat(id, staffId, now);
    // Карточка звонка у остальных пропадает сразу (живое обновление CRM).
    await this.calls.handle({ provider: WHATSAPP, externalId: call.externalId, stage: "answer", direction: "in", clientPhone: call.clientPhone, extension: null, staffId, at: now });
    return { callId: call.externalId };
  }

  /** Исходящий: собеседник взял трубку — вкладка услышала первые звуки из аудиопотока. */
  async connected(id: string, staffId: string) {
    const call = await this.mine(id, staffId);
    if (call.isFinished || call.direction !== "out" || call.answeredAt) return;
    await this.calls.handle({ provider: WHATSAPP, externalId: call.externalId, stage: "answer", direction: "out", clientPhone: call.clientPhone, extension: null, staffId, at: this.clock.now() });
  }

  /**
   * Вкладка на связи во время звонка. talking — у неё идёт разговор: если отметка «собеседник ответил» потерялась в сети,
   * она дойдёт так (иначе планировщик счёл бы исходящий недозвоном). false — звонка уже нет: вкладка закрывает панель.
   */
  async heartbeat(id: string, staffId: string, talking = false) {
    const live = await this.repo.heartbeat(id, staffId, this.clock.now());
    if (live && talking) await this.connected(id, staffId);
    return live;
  }

  /**
   * Положить трубку: завершить разговор, отменить набор или отклонить входящий (отклонить звонящий входящий может любой
   * сотрудник со звонками — он ничей). Повторный вызов ничего не меняет.
   */
  async hangup(id: string, staffId: string) {
    const call = await this.repo.findById(id);
    if (!call || call.provider !== WHATSAPP) throw notFound();
    if (call.staffId && call.staffId !== staffId) throw new TelephonyError("notFound", "Это звонок другого сотрудника");
    if (call.isFinished) return call.snapshot();
    // Шлюз мог уже завершить звонок сам — тогда трубку класть некуда, журнал всё равно закрываем.
    await this.gateway.hangup(call.externalId).catch(() => {});
    return this.finish(call, this.clock.now());
  }

  /**
   * Кусок записи разговора из вкладки сотрудника. Пишет только тот, кто разговаривал, и только пока звонок идёт или
   * недавно закончился (хвост записи вкладка отправляет после «Завершить»).
   */
  async record(id: string, staffId: string, input: { seq: number; mime: string; data: Uint8Array }) {
    const call = await this.mine(id, staffId);
    const endedAt = call.snapshot().endedAt;
    if (endedAt && this.clock.now().getTime() - endedAt.getTime() > WHATSAPP_RECORDING_TAIL_MS) throw new TelephonyError("notFound", "Звонок давно завершён");
    await this.recordings.append(call.id, input.seq, input.mime, input.data);
    if (!call.snapshot().hasRecording) await this.repo.markRecorded(call.id);
  }

  /** Файл записи для прослушивания — только законченного звонка WhatsApp. */
  async recordingFile(call: { id: string; provider: string; endedAt: Date | null; hasRecording: boolean }) {
    if (call.provider !== WHATSAPP || !call.hasRecording) return null;
    if (!call.endedAt) throw new TelephonyError("notFound", "Звонок ещё идёт — запись будет после его окончания");
    return this.recordings.file(call.id);
  }

  /** Шлюз сообщил, что звонок закончился (положил трубку собеседник, сотрудник или WhatsApp). */
  async endedByGateway(callId: string) {
    const call = await this.repo.findByExternal(WHATSAPP, callId);
    if (!call || call.isFinished) return null;
    return this.finish(call, this.clock.now());
  }

  /** Планировщик: закрыть звонки, о конце которых никто не сообщил. Разговор без вкладки — ещё и положить трубку в шлюзе. */
  async sweep(): Promise<number> {
    const now = this.clock.now();
    const stale = await this.repo.stale(now, { ringMs: WHATSAPP_RING_MS, silentMs: WHATSAPP_SILENT_MS });
    for (const { call, lastSeen } of stale) {
      await this.gateway.hangup(call.externalId).catch(() => {});
      await this.finish(call, call.answeredAt ? (lastSeen ?? now) : now);
    }
    return stale.length;
  }

  private async mine(id: string, staffId: string) {
    const call = await this.repo.findById(id);
    if (!call || call.provider !== WHATSAPP || call.staffId !== staffId) throw notFound();
    return call;
  }

  /** Итог по факту: был ответ — разговор (длительность от ответа), нет — входящий пропущен, исходящий не дозвонился. */
  private finish(call: Call, at: Date) {
    const answeredAt = call.answeredAt;
    return this.calls.handle({
      provider: WHATSAPP,
      externalId: call.externalId,
      stage: "end",
      direction: call.direction,
      clientPhone: call.clientPhone,
      extension: null,
      staffId: call.staffId,
      at,
      status: answeredAt ? "answered" : call.direction === "in" ? "missed" : "failed",
      durationSec: answeredAt ? Math.max(0, Math.round((at.getTime() - answeredAt.getTime()) / 1000)) : 0,
    });
  }
}

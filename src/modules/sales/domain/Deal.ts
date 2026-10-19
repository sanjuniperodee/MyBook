import { AggregateRoot } from "@/shared/domain";
import { dealSourceLabels, type DealSource } from "@/shared/domain/dealSources";
import type { CustomFieldValues } from "@/shared/domain/customFields";
import { formatPrice } from "@/config/site";
import { normalizePhone, phoneKey } from "@/shared/domain/phone";
import { SalesEvents } from "./events";
import { SalesError } from "./errors";
import type { Stage } from "./Funnel";

export type NoteKind = "note" | "call" | "message" | "system";

export interface DealProps {
  number: number;
  title: string;
  stageId: string;
  source: DealSource;
  clientId: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  extraPhones: string[];
  amount: number;
  assigneeId: string | null;
  /** Когда назначен нынешний ответственный. */
  assignedAt: Date | null;
  /** Кому круг уже отдавал заявку. */
  routeTried: string[];
  createdById: string | null;
  orderId: string | null;
  lostReason: string | null;
  unsorted: boolean;
  customFields: CustomFieldValues;
  utm: Record<string, string> | null;
  tags: string[];
  stageChangedAt: Date;
  closedAt: Date | null;
  /** Правило автоматизации, которое создало сделку (повторная продажа): статистика правила «создано / выиграно / сумма». */
  automationId?: string | null;
}

/** Запись в ленту сделки (история, звонки, сообщения, заметки менеджеров). */
export interface DealNote {
  text: string;
  authorId: string | null;
  kind: NoteKind;
}

/** Переход по этапам — пишется в историю (честная воронка в аналитике). */
export interface StageChange {
  fromStageId: string | null;
  toStageId: string;
  actorId: string | null;
}

const blank = (v: unknown) => v === null || v === undefined || v === "";

/** Менеджер предложил отклонить заявку или отметить спамом — тег до решения руководителя (видно на доске и в фильтрах). */
export const REJECTION_TAGS = { spam: "запрос: спам", reject: "запрос: отклонить" } as const;
export type RejectionKind = keyof typeof REJECTION_TAGS;

/** Сделка (лид): обращение, которое ведём по воронке до заказа. */
export class Deal extends AggregateRoot<DealProps> {
  #notes: DealNote[] = [];
  #stageChanges: StageChange[] = [];

  static restore(id: string, props: DealProps) {
    return new Deal(id, props);
  }

  /** routed — ответственного выбрал круг (он попадает в routeTried). */
  static open(id: string, number: number, input: Omit<DealProps, "number" | "stageChangedAt" | "closedAt" | "lostReason" | "tags" | "extraPhones" | "assignedAt" | "routeTried"> & { extraPhones?: string[]; routed?: boolean }, stage: Stage, now: Date) {
    const { routed, ...props } = input;
    const deal = new Deal(id, {
      ...props,
      assignedAt: input.assigneeId ? now : null,
      routeTried: routed && input.assigneeId ? [input.assigneeId] : [],
      number,
      title: input.title.slice(0, 200),
      contactName: input.contactName.slice(0, 120),
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      extraPhones: input.extraPhones ?? [],
      stageId: stage.id,
      lostReason: null,
      tags: [],
      stageChangedAt: now,
      closedAt: stage.kind === "open" ? null : now,
    });
    deal.#stageChanges.push({ fromStageId: null, toStageId: stage.id, actorId: input.createdById });
    deal.note(`Создана сделка №${number} «${deal.props.title}» (${dealSourceLabels[input.source]})`, input.createdById);
    deal.record(SalesEvents.dealCreated({ ...deal.ref(), source: input.source, stageId: stage.id, createdById: input.createdById, title: deal.props.title }));
    return deal;
  }

  get number() {
    return this.props.number;
  }
  get title() {
    return this.props.title;
  }
  get stageId() {
    return this.props.stageId;
  }
  get clientId() {
    return this.props.clientId;
  }
  get assigneeId() {
    return this.props.assigneeId;
  }
  get orderId() {
    return this.props.orderId;
  }
  get source() {
    return this.props.source;
  }

  ref() {
    return { dealId: this.id, number: this.props.number, clientId: this.props.clientId, assigneeId: this.props.assigneeId };
  }

  /** Записи ленты и истории этапов, ещё не сохранённые репозиторием. */
  pullJournal() {
    const out = { notes: this.#notes, stageChanges: this.#stageChanges };
    this.#notes = [];
    this.#stageChanges = [];
    return out;
  }

  note(text: string, authorId: string | null, kind: NoteKind = "system") {
    this.#notes.push({ text, authorId, kind });
  }

  /** Смена этапа. Закрытые этапы (успех/отказ) ставят дату закрытия; возврат в работу её снимает. */
  moveTo(stage: Stage, actorId: string | null, now: Date, lostReason?: string | null): boolean {
    if (stage.id === this.props.stageId) return false;
    const from = this.props.stageId;
    this.props.stageId = stage.id;
    this.props.stageChangedAt = now;
    this.props.closedAt = stage.kind === "open" ? null : now;
    this.props.lostReason = stage.kind === "lost" ? (lostReason ?? this.props.lostReason) : null;
    this.props.unsorted = false;
    this.#stageChanges.push({ fromStageId: from, toStageId: stage.id, actorId });
    this.note(`Сделка №${this.props.number}: этап «${stage.name}»${stage.kind === "lost" && lostReason ? ` — ${lostReason}` : ""}`, actorId);
    this.record(SalesEvents.dealStageChanged({ ...this.ref(), fromStageId: from, stageId: stage.id, source: this.props.source, at: now.toISOString() }));
    // Закрыта (успех или отказ) — платить по ней больше нельзя: её открытые счета отменит подписчик заказов.
    if (stage.kind !== "open") this.record(SalesEvents.dealClosed({ ...this.ref(), outcome: stage.kind, reason: stage.kind === "lost" ? this.props.lostReason : null }));
    return true;
  }

  get assignedAt() {
    return this.props.assignedAt;
  }
  get routeTried(): readonly string[] {
    return this.props.routeTried;
  }

  assign(assigneeId: string | null, now: Date) {
    if (assigneeId === this.props.assigneeId) return;
    const from = this.props.assigneeId;
    this.props.assigneeId = assigneeId;
    this.props.assignedAt = assigneeId ? now : null;
    if (assigneeId) this.record(SalesEvents.dealAssigned({ ...this.ref(), fromAssigneeId: from, title: this.props.title }));
  }

  /** Заявку некому передать: отсчёт «нет ответа» — заново, от сейчас. */
  restartRouteTimer(now: Date) {
    if (this.props.assigneeId) this.props.assignedAt = now;
  }

  /** Круг отдал заявку менеджеру: он ответственный, а второй раз по «нет ответа» она ему не придёт. */
  route(assigneeId: string, now: Date) {
    this.assign(assigneeId, now);
    if (!this.props.routeTried.includes(assigneeId)) this.props.routeTried = [...this.props.routeTried, assigneeId];
  }

  /** Связать с заказом клиента (и обновить сумму). */
  attachOrder(orderId: string | null, amount?: number) {
    if (orderId) this.props.orderId = orderId;
    if (amount) this.props.amount = amount;
  }

  /** Заказ отменён, а сделка остаётся (деньги клиента у нас): отвязать заказ, чтобы клиент мог оформить новый. */
  detachOrder() {
    this.props.orderId = null;
  }

  setAmount(amount: number) {
    this.props.amount = amount;
  }

  /**
   * Менеджер связался с клиентом (ответил в чате, позвонил, записал контакт) или нажал «Принять»: заявка из
   * «Неразобранного» принята и, если была ничья, — его. how — как именно, в ленту сделки.
   * Возвращает false, если сделка уже была разобрана.
   */
  accept(authorId: string, how?: string): boolean {
    if (!this.props.unsorted) return false;
    this.props.unsorted = false;
    // Взял в работу (связался с клиентом) — предложение отклонить снимается.
    this.props.tags = this.props.tags.filter((t) => t !== REJECTION_TAGS.spam && t !== REJECTION_TAGS.reject);
    this.props.assigneeId ??= authorId;
    this.note(`Заявка принята в работу${how ? `: ${how}` : ""}`, authorId);
    return true;
  }

  get isUnsorted() {
    return this.props.unsorted;
  }

  /** Правка карточки (без этапа и ответственного — для них отдельные команды с историей). Смена бюджета — в ленту. */
  edit(patch: { title: string; contactName: string; amount: number; source: DealSource; tags: string[]; customFields: CustomFieldValues; contacts?: { phone: string | null; email: string | null; extraPhones: string[] } }, actorId: string | null) {
    const before = this.props.amount;
    this.props = {
      ...this.props,
      title: patch.title.slice(0, 200),
      contactName: patch.contactName.slice(0, 120),
      amount: patch.amount,
      source: patch.source,
      tags: [...new Set(patch.tags)].slice(0, 12),
      customFields: patch.customFields,
      ...(patch.contacts ? { contactPhone: patch.contacts.phone, contactEmail: patch.contacts.email, extraPhones: patch.contacts.extraPhones.slice(0, 5) } : {}),
    };
    if (before !== patch.amount) this.note(`Бюджет: ${formatPrice(before)} → ${formatPrice(patch.amount)}`, actorId);
  }

  addTag(tag: string) {
    this.props.tags = [...new Set([...this.props.tags, tag])].slice(0, 12);
  }

  /** Что предложил менеджер: спам, отклонить или ничего. */
  get rejectionRequest(): RejectionKind | null {
    if (this.props.tags.includes(REJECTION_TAGS.spam)) return "spam";
    if (this.props.tags.includes(REJECTION_TAGS.reject)) return "reject";
    return null;
  }

  /** Менеджер не удаляет заявку сам: предлагает, руководитель подтверждает. Пока ждёт — круг её не передаёт. */
  requestRejection(kind: RejectionKind, actorId: string, reason: string) {
    this.props.tags = [...new Set([...this.props.tags.filter((t) => t !== REJECTION_TAGS.spam && t !== REJECTION_TAGS.reject), REJECTION_TAGS[kind]])].slice(0, 12);
    this.note(`${kind === "spam" ? "Предложено отметить спамом" : "Предложено отклонить заявку"} — ждёт решения руководителя${reason ? `. Причина: ${reason}` : ""}`, actorId);
  }

  /**
   * Руководитель подтвердил отклонение (спам), а удалить заявку нельзя — по ней деньги или счёт клиента (why): она закрывается
   * «отказом» с причиной, отметка-предложение снимается. Событие «сделка закрыта» отменит её открытые счета.
   */
  closeRejected(lost: Stage, kind: RejectionKind, reason: string, why: string, actorId: string | null, now: Date) {
    this.props.tags = this.props.tags.filter((t) => t !== REJECTION_TAGS.spam && t !== REJECTION_TAGS.reject);
    this.moveTo(lost, actorId, now, `${kind === "spam" ? "Спам" : "Заявка отклонена"}${reason ? `: ${reason}` : ""}`);
    this.note(`Заявка не удалена (${why}) — закрыта «отказом»`, actorId);
  }

  /** Руководитель оставил заявку в работе. */
  declineRejection(actorId: string) {
    if (!this.rejectionRequest) return false;
    this.props.tags = this.props.tags.filter((t) => t !== REJECTION_TAGS.spam && t !== REJECTION_TAGS.reject);
    this.note("Руководитель оставил заявку в работе", actorId);
    return true;
  }

  linkClient(clientId: string | null) {
    this.props.clientId = clientId;
  }

  /** Откуда пришёл клиент — только если ещё не известно. */
  attributeIfUnknown(utm: Record<string, string>): boolean {
    if (this.props.utm) return false;
    this.props.utm = utm;
    return true;
  }

  /** Значение своего поля (ответ бота, правка менеджера). */
  setField(key: string, value: string | number | boolean | null) {
    this.props.customFields = { ...this.props.customFields, [key]: value };
  }

  /** Заполнить пустые свои поля (не перетирая то, что менеджер уже ввёл). */
  fillEmptyFields(values: CustomFieldValues): boolean {
    let changed = false;
    const next = { ...this.props.customFields };
    for (const [k, v] of Object.entries(values)) {
      if (blank(v) || !blank(next[k])) continue;
      next[k] = v;
      changed = true;
    }
    this.props.customFields = next;
    return changed;
  }

  /**
   * Слияние дубля: пустые поля (и свои поля сделки, и метки, откуда пришёл) заполняются из source, телефон source
   * становится дополнительным, теги объединяются. Перенос переписки, звонков, задач и истории этапов делает репозиторий.
   * Закрытую сделку (успех или отказ) влить нельзя: это прошлая покупка или отказ — она нужна в плане, воронке
   * и у своего заказа, а новая заявка того же человека — повторное обращение, а не дубль.
   */
  absorb(source: Deal, sourceStage: Stage | null, actorId: string | null) {
    if (sourceStage && sourceStage.kind !== "open") throw new SalesError("mergeClosed", undefined, [source.number]);
    const s = source.props;
    this.fillEmptyFields(s.customFields);
    const phones = new Set([...this.props.extraPhones, ...s.extraPhones]);
    if (s.contactPhone && this.props.contactPhone && phoneKey(s.contactPhone) !== phoneKey(this.props.contactPhone)) phones.add(normalizePhone(s.contactPhone));
    if (this.props.contactPhone) phones.delete(normalizePhone(this.props.contactPhone));
    this.props = {
      ...this.props,
      contactName: this.props.contactName || s.contactName,
      contactPhone: this.props.contactPhone ?? s.contactPhone,
      contactEmail: this.props.contactEmail ?? s.contactEmail,
      clientId: this.props.clientId ?? s.clientId,
      orderId: this.props.orderId ?? s.orderId,
      assigneeId: this.props.assigneeId ?? s.assigneeId,
      amount: this.props.amount || s.amount,
      utm: this.props.utm ?? s.utm,
      tags: [...new Set([...this.props.tags, ...s.tags])],
      extraPhones: [...phones],
      unsorted: false,
    };
    this.note(`Объединена со сделкой №${s.number} «${s.title}»`, actorId);
  }
}

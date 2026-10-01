import { AggregateRoot } from "@/shared/domain";
import { dealSourceLabels, type DealSource } from "@/modules/sales/domain/meta";
import { formatPrice } from "@/config/site";
import { normalizePhone, phoneKey } from "@/shared/domain/phone";
import { SalesEvents } from "./events";
import type { Stage } from "./Funnel";

export type CustomValues = Record<string, string | number | boolean | null>;
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
  createdById: string | null;
  orderId: string | null;
  lostReason: string | null;
  unsorted: boolean;
  customFields: CustomValues;
  utm: Record<string, string> | null;
  tags: string[];
  stageChangedAt: Date;
  closedAt: Date | null;
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

/** Сделка (лид): обращение, которое ведём по воронке до заказа. */
export class Deal extends AggregateRoot<DealProps> {
  #notes: DealNote[] = [];
  #stageChanges: StageChange[] = [];

  static restore(id: string, props: DealProps) {
    return new Deal(id, props);
  }

  static open(id: string, number: number, input: Omit<DealProps, "number" | "stageChangedAt" | "closedAt" | "lostReason" | "tags" | "extraPhones"> & { extraPhones?: string[] }, stage: Stage, now: Date) {
    const deal = new Deal(id, {
      ...input,
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
    return true;
  }

  assign(assigneeId: string | null) {
    if (assigneeId === this.props.assigneeId) return;
    this.props.assigneeId = assigneeId;
    if (assigneeId) this.record(SalesEvents.dealAssigned({ ...this.ref(), title: this.props.title }));
  }

  /** Связать с заказом клиента (и обновить сумму). */
  attachOrder(orderId: string | null, amount?: number) {
    if (orderId) this.props.orderId = orderId;
    if (amount) this.props.amount = amount;
  }

  setAmount(amount: number) {
    this.props.amount = amount;
  }

  /**
   * Менеджер ответил клиенту: заявка из «Неразобранного» принята и, если была ничья, — его.
   * Возвращает false, если сделка уже была разобрана.
   */
  accept(authorId: string): boolean {
    if (!this.props.unsorted) return false;
    this.props.unsorted = false;
    this.props.assigneeId ??= authorId;
    return true;
  }

  get isUnsorted() {
    return this.props.unsorted;
  }

  /** Правка карточки (без этапа и ответственного — для них отдельные команды с историей). Смена бюджета — в ленту. */
  edit(patch: { title: string; contactName: string; amount: number; source: DealSource; tags: string[]; customFields: CustomValues; contacts?: { phone: string | null; email: string | null; extraPhones: string[] } }, actorId: string | null) {
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
  fillEmptyFields(values: CustomValues): boolean {
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
   * Слияние дубля: пустые поля заполняются из source, телефон source становится дополнительным,
   * теги объединяются. Перенос переписки, звонков и задач делает репозиторий.
   */
  absorb(source: Deal, actorId: string | null) {
    const s = source.props;
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
      tags: [...new Set([...this.props.tags, ...s.tags])],
      extraPhones: [...phones],
      unsorted: false,
    };
    this.note(`Объединена со сделкой №${s.number} «${s.title}»`, actorId);
  }
}

/**
 * API v1 (A4) — обработчики оставшихся маршрутов /api/mobile/* (packages/contracts/src/v1/crm-mobile-rest.ts).
 * Все доменные проверки и побочные эффекты — через те же серверные действия и сервисы модулей, что у CRM и /api/mobile/*.
 */
import type { crmMobileRestRoutes } from "@mybook/contracts";
import { admin } from "@/i18n/admin";
import { planName } from "@/i18n/labels";
import { apiStaff, HttpError } from "@/server/api";
import { can, canWork, staffViewer } from "@/server/access";
import { convertAudio } from "@/server/audio-convert";
import { container } from "@/server/container";
import { mobileLayout } from "@/server/mobile-layout";
import { autoShiftOnVisit } from "@/server/shift";
import { staffLabel } from "@/shared/domain/staff";
import { taskJson } from "@/server/crm-lists/work";
import { loadTaskDetail } from "@/server/task-detail";
import { callAction, markCallHandledAction, openChatAction, setShiftAction } from "@/app/admin/crm-actions";
import { deleteMyTemplateAction, duplicateTemplateAction, reorderMyTemplatesAction, saveMyTemplateAction } from "@/app/admin/templates/actions";
import { aiTemplateDraftAction } from "@/app/admin/ai-actions";
import { chatProductsAction, orderItemsAction, sendCatalogLinkAction, sendProductAction } from "@/app/admin/catalog/actions";
import {
  assignConversationAction,
  createDealFromChatAction,
  deleteMessageAction,
  editMessageAction,
  forwardMessageAction,
  forwardTargetsAction,
  markReadAction,
  pinChatAction,
  resendMessageAction,
  sendInternalNoteAction,
  sendMessageAction,
  setConversationStatusAction,
  transcribeMessageAction,
} from "@/app/admin/chats/actions";
import { acceptDealAction, assignDealAction, createDealAction, moveDealAction, rejectDealAction } from "@/app/admin/deals/actions";
import { addNoteAction, completeTaskAction, createTaskAction, deleteTaskAction, moveOrderAction, snoozeTaskAction, toggleTaskAction, updateTaskAction } from "@/app/admin/actions";
import type { Handlers } from "../../app";
import { refused } from "./common";

type MobileRestKey = keyof typeof crmMobileRestRoutes;

const redirectId = (err: unknown): string | null => {
  const digest = (err as { digest?: unknown })?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2]?.split("/").pop() || null;
};

const okOrRefused = (r: { error?: string }) => (r.error ? refused(r.error) : { ok: true as const });

export const crmMobileRestHandlers: Pick<Handlers, MobileRestKey> = {
  // ─── Профиль сотрудника, смена, «Обзор» ──────────────────────────────────────────────────────────────────────

  async crmMe({ req }) {
    const staff = await apiStaff(req);
    const onShift = await autoShiftOnVisit(staff);
    const live = await container().reporting.live(staff.context);
    return {
      id: staff.user.id,
      name: staffLabel(staff.user),
      email: staff.user.email,
      role: staff.roleName,
      isOwner: staff.isOwner,
      scope: staff.scope,
      onShift,
      layout: mobileLayout((p) => can(staff, p), staff.isOwner),
      permissions: [...staff.permissions],
      counters: live.counters,
      unread: live.unread,
    };
  },

  async crmShiftSet({ req, input }) {
    await apiStaff(req);
    await setShiftAction(input.body.onShift);
    return { ok: true as const, onShift: input.body.onShift };
  },

  async crmOverview({ req, input }) {
    const staff = await apiStaff(req);
    if (!can(staff, "analytics.view")) throw new HttpError(403, "forbidden");
    const period = input.period && [7, 30, 90].includes(input.period) ? input.period : 30;
    const c = container();
    const [d, live, stageCounts, stages] = await Promise.all([
      c.reporting.dashboard(period, staffViewer(staff)),
      c.reporting.live(staff.context),
      can(staff, "deals.view") ? c.reporting.stageCounts() : Promise.resolve([]),
      can(staff, "deals.view") ? c.sales.queries.listStages() : Promise.resolve([]),
    ]);
    const f = d.funnelRows.rows[0] ?? { registered: 0, with_book: 0, engaged: 0, ordered: 0, paid: 0 };
    const byStage = new Map(stageCounts.map((s) => [s.stageId, s.n]));
    const avg = (x: { sum: number; n: number }) => (x.n ? Math.round(x.sum / x.n) : 0);
    return {
      period,
      revenue: { cur: d.cur.sum, prev: d.prev.sum },
      sales: { cur: d.cur.n, prev: d.prev.n },
      avgCheck: { cur: avg(d.cur), prev: avg(d.prev) },
      newClients: { cur: d.newUsers.cur, prev: d.newUsers.prev },
      series: d.daily.map((r) => ({ day: r.d, sum: r.sum, n: r.n })),
      funnel: { registered: f.registered, withBook: f.with_book, engaged: f.engaged, ordered: f.ordered, paid: f.paid },
      byPlan: d.byPlan.map((p) => ({ plan: p.plan, label: planName(p.plan), sum: p.sum, n: p.n })).sort((a, b) => b.sum - a.sum),
      stages: stages.filter((s) => s.kind === "open").map((s) => ({ id: s.id, name: s.name, color: s.color, n: byStage.get(s.id) ?? 0 })),
      attention: { orders: d.attention.length, deadlines: d.deadlines.length + d.dealDeadlines.length },
      counters: live.counters,
    };
  },

  // ─── Личные шаблоны ответов ──────────────────────────────────────────────────────────────────────────────────

  async crmMyTemplates({ req }) {
    const staff = await apiStaff(req, "chats.view");
    const all = await container().messaging.view.templates(staff.user.id);
    const pick = ({ id, title, text }: { id: string; title: string; text: string }) => ({ id, title, text });
    return { mine: all.filter((t) => t.own).map(pick), shared: all.filter((t) => !t.own).map(pick) };
  },

  async crmMyTemplateSave({ req, input }) {
    await apiStaff(req, "chats.view");
    const r = await saveMyTemplateAction(input.body.id ?? "", input.body.title, input.body.text);
    if (r.error || !r.id) return refused(r.error ?? "Не удалось сохранить шаблон");
    return { ok: true as const, id: r.id };
  },

  async crmMyTemplateDelete({ req, input }) {
    await apiStaff(req, "chats.view");
    return okOrRefused(await deleteMyTemplateAction(input.id));
  },

  async crmMyTemplateDuplicate({ req, input }) {
    await apiStaff(req, "chats.view");
    return okOrRefused(await duplicateTemplateAction(input.id));
  },

  async crmMyTemplatesReorder({ req, input }) {
    await apiStaff(req, "chats.view");
    return okOrRefused(await reorderMyTemplatesAction(input.body.ids));
  },

  async crmMyTemplateDraft({ req, input }) {
    await apiStaff(req, "chats.view");
    const r = await aiTemplateDraftAction(input.body.chatId, input.body.messageId);
    if (!r.ok) return refused(r.message);
    return {
      title: r.title,
      text: r.text,
      replaced: r.replaced.map((x) => ({ was: x.was, placeholder: x.with })),
      ai: r.ai,
    };
  },

  // ─── Звонки ──────────────────────────────────────────────────────────────────────────────────────────────────

  async crmCallDial({ req, input }) {
    await apiStaff(req, "calls.make");
    const b = input.body;
    const r = await callAction({ dealId: b.dealId ?? undefined, orderId: b.orderId ?? undefined, clientId: b.clientId ?? undefined, callId: b.callId ?? undefined });
    return r.ok ? { ok: true as const, message: r.message ?? null } : refused(r.message ?? "Не удалось позвонить");
  },

  async crmCallHandled({ req, input }) {
    await apiStaff(req, "calls.view");
    const r = await markCallHandledAction(input.callId);
    return r.ok ? { ok: true as const } : refused(r.message ?? "Не удалось отметить звонок");
  },

  // ─── Каталог WhatsApp в чате и корзина клиента ───────────────────────────────────────────────────────────────

  async crmChatCatalog({ req }) {
    await apiStaff(req, "chats.view", "chats.send");
    let r: Awaited<ReturnType<typeof chatProductsAction>>;
    try {
      r = await chatProductsAction();
    } catch (err) {
      console.error("[v1:crmChatCatalog]", err);
      return Response.json({ error: admin.mobileCatalogDown, code: "serviceUnavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (!r.ok) return refused(r.error);
    return { enabled: r.enabled, products: r.products };
  },

  async crmChatSendCatalog({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    const r = input.body.productId ? await sendProductAction(input.chatId, input.body.productId) : await sendCatalogLinkAction(input.chatId);
    return r.ok ? { ok: true as const } : refused(r.error);
  },

  async crmChatMessageOrder({ req, input }) {
    await apiStaff(req, "chats.view");
    const r = await orderItemsAction(input.messageId);
    if (!r.ok) return refused(r.error);
    return { items: r.items, total: r.total, currency: r.currency };
  },

  // ─── Действия чатов и сообщений ──────────────────────────────────────────────────────────────────────────────

  async crmChatOpen({ req, input }) {
    await apiStaff(req, "chats.send");
    const b = input.body;
    const r = await openChatAction({ dealId: b.dealId ?? undefined, orderId: b.orderId ?? undefined, clientId: b.clientId ?? undefined, callId: b.callId ?? undefined });
    if (!r.ok || !r.id) return refused(r.message ?? "Не удалось открыть чат");
    return { ok: true as const, id: r.id };
  },

  async crmChatForwardTargets({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    return { targets: await forwardTargetsAction(input.q ?? "") };
  },

  async crmChatAssign({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    await assignConversationAction(input.chatId, input.body.userId);
    return { ok: true as const };
  },

  async crmChatCreateDeal({ req, input }) {
    await apiStaff(req, "chats.view", "deals.edit");
    return await createDealFromChatAction(input.chatId);
  },

  async crmChatForward({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    const failed = new Set<string>();
    let ok = 0;
    for (const messageId of input.body.messageIds) {
      const r = await forwardMessageAction(input.chatId, messageId, input.body.targetIds);
      if (r.error) {
        failed.add(r.error);
        continue;
      }
      ok++;
      r.failed?.forEach((f) => failed.add(`${f.title} — ${f.error}`));
    }
    if (!ok) return refused([...failed].join("; ") || admin.mobileForwardFailed);
    return { ok: true as const, forwarded: ok, total: input.body.messageIds.length, failed: [...failed] };
  },

  async crmChatNote({ req, input }) {
    await apiStaff(req, "chats.view");
    return await sendInternalNoteAction(input.chatId, input.body.text);
  },

  async crmChatPin({ req, input }) {
    await apiStaff(req, "chats.view");
    return okOrRefused(await pinChatAction(input.chatId, input.body.pinned));
  },

  async crmChatRead({ req, input }) {
    await apiStaff(req, "chats.view");
    await markReadAction(input.chatId);
    return { ok: true as const };
  },

  async crmChatStatus({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    await setConversationStatusAction(input.chatId, input.body.status);
    return { ok: true as const };
  },

  async crmChatSendMessage({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    const r = await sendMessageAction(input.chatId, input.body.text, input.body.override, input.body.replyToId ?? null);
    if ("blocked" in r) return { id: null, status: null, error: null, blocked: r.blocked };
    return { id: r.id, status: r.status, error: r.error, blocked: null };
  },

  async crmChatSendVoice({ req, input }) {
    const staff = await apiStaff(req, "chats.view", "chats.send");
    const conv = await container().messaging.queries.conversation(input.chatId);
    if (!conv) throw new HttpError(404, "notFound");
    if (!canWork(staff, conv.assigneeId)) throw new HttpError(403, "forbidden");
    const file = input.files[0];
    if (!file) return refused(admin.mobileEmptyRecording);
    const original = new Uint8Array(await file.arrayBuffer());
    const converted = await convertAudio(original, "ogg");
    const upload = converted ? { data: converted.data, name: "voice.ogg", mime: converted.mime } : { data: original, name: file.name || "voice.m4a", mime: file.type || "audio/mp4" };
    const msg = await container().messaging.sendUpload(conv.id, upload, "", staff.user.id, { replyToId: input.replyToId ?? null });
    return { id: msg.id, status: msg.status, error: "error" in msg && msg.error ? msg.error : null, converted: !!converted };
  },

  async crmChatMessageEdit({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    return okOrRefused(await editMessageAction(input.chatId, input.messageId, input.body.text));
  },

  async crmChatMessageDelete({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    return okOrRefused(await deleteMessageAction(input.chatId, input.messageId));
  },

  async crmChatMessageResend({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    return okOrRefused(await resendMessageAction(input.chatId, input.messageId));
  },

  async crmChatMessageTranscribe({ req, input }) {
    await apiStaff(req, "chats.view");
    const r = await transcribeMessageAction(input.chatId, input.messageId);
    if (r.error || r.text === undefined) return refused(r.error ?? "Не удалось расшифровать запись");
    return { text: r.text };
  },

  // ─── Сделки ──────────────────────────────────────────────────────────────────────────────────────────────────

  async crmDealCreate({ req, input }) {
    await apiStaff(req, "deals.edit");
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) if (v !== undefined) form.set(k, String(v));
    try {
      const r = await createDealAction({}, form);
      return refused(r.error ?? "Не удалось создать сделку");
    } catch (err) {
      const id = redirectId(err);
      if (id) return { ok: true as const, id };
      throw err;
    }
  },

  async crmDealAccept({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await acceptDealAction(input.dealId);
    return r.ok ? { ok: true as const } : refused(r.message ?? "Не удалось принять заявку");
  },

  async crmDealAssign({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await assignDealAction(input.dealId, input.body.userId);
    return r.ok ? { ok: true as const } : refused(r.message ?? "Не удалось назначить ответственного");
  },

  async crmDealMove({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await moveDealAction(input.dealId, input.body.stageId, input.body.lostReason);
    return r.ok ? { ok: true as const } : refused(r.message ?? "Не удалось перенести сделку");
  },

  async crmDealNote({ req, input }) {
    await apiStaff(req, "deals.edit");
    const form = new FormData();
    form.set("dealId", input.dealId);
    form.set("text", input.body.text);
    return okOrRefused(await addNoteAction({}, form));
  },

  async crmDealReject({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await rejectDealAction(input.dealId, input.body.spam, input.body.reason);
    return { requested: r.requested, message: r.message, deleted: !!r.deleted };
  },

  async crmDealTaskCreate({ req, input }) {
    await apiStaff(req);
    const form = new FormData();
    form.set("dealId", input.dealId);
    form.set("title", input.body.title);
    if (input.body.dueAt) form.set("dueAt", input.body.dueAt);
    if (input.body.dueTime) form.set("dueTime", input.body.dueTime);
    if (input.body.kind) form.set("kind", input.body.kind);
    return okOrRefused(await createTaskAction({}, form));
  },

  // ─── Задачи ──────────────────────────────────────────────────────────────────────────────────────────────────

  async crmTaskCreate({ req, input }) {
    await apiStaff(req);
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) {
      if (v === undefined) continue;
      if (k === "remindBeforeMin") form.set(k, v === null ? "none" : String(v));
      else form.set(k, String(v));
    }
    return okOrRefused(await createTaskAction({}, form));
  },

  async crmTaskGet({ req, input }) {
    const staff = await apiStaff(req);
    const d = await loadTaskDetail(staff, input.taskId);
    if (!d) throw new HttpError(404, "notFound");
    const iso = (x: Date | null) => x?.toISOString() ?? null;
    return {
      item: { ...taskJson(d.raw as Parameters<typeof taskJson>[0], staff, new Date()), contact: d.row.contact },
      task: { ...d.task, dueAt: iso(d.task.dueAt), doneAt: iso(d.task.doneAt), done: !!d.task.doneAt, remindBeforeMin: d.row.remindBeforeMin },
      deal: d.deal,
      client: d.client,
      contact: d.contact,
      order: d.order,
      chat: d.chat,
      notes: d.notes.map((n) => ({ ...n, at: n.at.toISOString() })),
      others: d.others.map((o) => ({ ...o, dueAt: iso(o.dueAt) })),
      reach: d.row.contact ?? null,
    };
  },

  async crmTaskUpdate({ req, input }) {
    await apiStaff(req);
    return okOrRefused(await updateTaskAction(input.taskId, input.body));
  },

  async crmTaskDelete({ req, input }) {
    await apiStaff(req);
    return okOrRefused(await deleteTaskAction(input.taskId));
  },

  async crmTaskComplete({ req, input }) {
    await apiStaff(req);
    return okOrRefused(await completeTaskAction(input.taskId, input.body));
  },

  async crmTaskSnooze({ req, input }) {
    await apiStaff(req);
    return okOrRefused(await snoozeTaskAction(input.taskId, input.body.by));
  },

  async crmTaskToggle({ req, input }) {
    await apiStaff(req);
    return okOrRefused(await toggleTaskAction(input.taskId));
  },

  // ─── Быстрая смена статуса заказа (канбан) ───────────────────────────────────────────────────────────────────

  async crmOrderStatus({ req, input }) {
    await apiStaff(req, "orders.view", "orders.edit");
    return okOrRefused(await moveOrderAction(input.orderId, input.body.status));
  },
};

import "server-only";
import { z } from "zod";
import { can, canSeeAssigned, canWork, staffViewer } from "@/server/access";
import { uuid } from "@/server/input";
import { formatPrice } from "@/config/site";
import { staffLabel } from "@/shared/domain/staff";
import { mergeCancels } from "@/shared/domain/orders";
import { container } from "@/server/container";
import { op } from "./op";
import type { AiAssigneePayload, AiStagePayload } from "@/shared/domain/aiProposals";

/**
 * Сборщики страниц сделок CRM (ADR 0012, A5 — Раздел 5): доска и список, карточка сделки. Видимость по роли — по
 * сотруднику из сессии. Счета — доменные объекты: их подписи, ссылки и что отменит слияние считаются здесь.
 */
const params = z.record(z.string(), z.string().max(500));

export const reads = {
  "deals.board": op(["deals.view"], z.object({ sp: params, view: z.enum(["board", "list"]), page: z.number().int().min(1).max(10_000), size: z.number().int().min(1).max(500) }), async ({ sp, view, page, size }, staff) => {
    const { listFields } = await import("@/modules/workspace");
    const pipelines = await container().sales.queries.listPipelines();
    const pipeline = pipelines.find((x) => x.id === sp.p) ?? pipelines[0];
    const selectFields = (await listFields("deal")).filter((f) => f.type === "select");
    const viewer = staffViewer(staff);
    const [stages, rows, totals, admins, views] = await Promise.all([
      container().sales.queries.listStages(pipeline.id),
      container().reporting.dealList(viewer, pipeline, sp, selectFields, view, view === "list" ? { limit: size, offset: (page - 1) * size } : undefined),
      // Итоги шапки — отдельным запросом по тем же фильтрам: список обрезан страницей, доска — 1000 карточками.
      container().reporting.dealTotals(viewer, pipeline, sp, selectFields, view),
      container().access.queries.allStaff(),
      container().reporting.savedViews(staff.user.id),
    ]);
    return { pipelines, pipeline, selectFields, stages, rows, totals, admins, views };
  }),

  "deals.card": op(["deals.view"], z.object({ id: uuid }), async ({ id }, staff) => {
    const [{ listFields, mentionableStaff }, { discountLimit }, { invoiceViews }, { mergeRefusal }] = await Promise.all([
      import("@/modules/workspace"),
      import("@/server/discount"),
      import("@/server/invoice-views"),
      import("@/modules/sales/domain"),
    ]);
    const deal = await container().reporting.dealById(id);
    if (!deal || !canSeeAssigned(staff, deal.assigneeId)) return null;
    const batch = await container().sales.batch.of(deal.id);
    const [allStages, pipelines, admins, card] = await Promise.all([
      container().sales.queries.listStages(),
      container().sales.queries.listPipelines(),
      container().access.queries.allStaff(),
      container().reporting.dealCard(deal, { calls: can(staff, "calls.view"), chats: can(staff, "chats.view") }),
    ]);
    const conv = card.convs[0] ?? null;
    const [paymentRows, receiptRows, orderMoney, invoiceRows] = await Promise.all([
      container().sales.payments.list(deal.id),
      container().sales.receipts.list(deal.id),
      deal.orderId ? container().ordering.payments.summary(deal.orderId) : null,
      container().ordering.invoices.listFor(deal.id),
    ]);
    const [duplicates, suggestedClientId, dealFields, agreedPlan, maxDiscount, noMarketing, mergeDays] = await Promise.all([
      container().sales.queries.duplicates(deal),
      !deal.clientId && deal.contactPhone ? container().sales.deals.findClientByPhone(deal.contactPhone) : null,
      listFields("deal"),
      container().sales.agreedPlan.get(deal.id),
      discountLimit(staff),
      container().messaging.chats.noMarketingFor({ dealId: deal.id, clientId: deal.clientId, phones: [deal.contactPhone, ...deal.extraPhones] }),
      container().sales.deals.mergeClosedDays(),
    ]);
    const suggested = suggestedClientId ? await container().reporting.clientBrief(suggestedClientId) : null;
    const chat = container().messaging.view;
    const [messages, templates, vars, blocker, offers] = conv
      ? await Promise.all([chat.messages(conv.id), chat.templates(staff.user.id), chat.vars(conv, staffLabel(staff.user)), chat.sendBlocker(conv), container().marketing.service.chatOffers(conv.clientId, can(staff, "promo.give"))])
      : [[], [], null, null, null];
    const [ai, kaspiWarning, catalog] = await Promise.all([
      container().assistant.service.configured(),
      conv ? container().ordering.kaspiWatch.warning().catch(() => null) : null,
      conv && can(staff, "chats.send") ? container().messaging.catalogInChat(conv) : null,
    ]);
    const mentionables = (await mentionableStaff()).filter((m) => m.id !== staff.user.id).map((m) => m.label);

    // Счета из чата: ссылка на оплату — тому, кто ведёт сделку (сервер проверяет те же права).
    const withLink = can(staff, "deals.edit") && canWork(staff, deal.assigneeId);
    const invoices = invoiceViews(invoiceRows, { now: new Date(), withLink });
    const invoiceLabels = new Map(invoiceRows.map((i) => [i.id, i.label]));
    const open = invoiceRows.find((i) => i.status === "pending_payment") ?? null;
    const openInvoice = open ? { id: open.id, label: open.label, amount: open.amount } : null;
    // Другие открытые сделки контакта: «Объединить сюда» — по правилу продаж (в закрытую — только заявку той же покупки), а в
    // подтверждении — счета, которые слияние отменит (то же правило, что у переноса счетов: mergeCancels).
    const stage = allStages.find((s) => s.id === deal.stageId);
    const closeOpen = !!deal.orderId || (!!stage && stage.kind !== "open");
    const targetSide = { kind: stage?.kind ?? null, orderId: deal.orderId, createdAt: deal.createdAt, closedAt: deal.closedAt };
    const openDeals = await Promise.all(
      duplicates.open.map(async (r) => {
        const allowed = can(staff, "deals.edit", "deals.delete") && canSeeAssigned(staff, r.deal.assigneeId) && !mergeRefusal(targetSide, { kind: r.stage.kind, orderId: r.deal.orderId, createdAt: r.deal.createdAt, closedAt: r.deal.closedAt }, mergeDays);
        if (!allowed) return { ...r, merge: null };
        const theirs = closeOpen || open ? await container().ordering.invoices.listFor(r.deal.id) : [];
        return { ...r, merge: { cancels: mergeCancels([...invoiceRows, ...theirs], r.deal.id, closeOpen).map((i) => `${i.label} на ${formatPrice(i.snapshot().amount)}`) } };
      }),
    );
    const [gifts, refundAfterOrder, proposals] = await Promise.all([container().sales.agreedGifts.get(deal.id), deal.orderId ? container().sales.refundAfterOrder(deal.id) : null, container().sales.aiProposals.pending(deal.id)]);
    // Предложения ИИ: этап — пока сделка там же, где была при разборе (перевели иначе — предложение устарело).
    const aiProposals = proposals.filter((p) => (p.kind === "stage" ? (p.payload as AiStagePayload).fromStageId === deal.stageId : p.kind === "assignee" ? (p.payload as AiAssigneePayload).fromAssigneeId === deal.assigneeId : true));
    return {
      deal,
      batch,
      allStages,
      pipelines,
      admins,
      card,
      paymentRows,
      receiptRows,
      orderMoney,
      invoices,
      invoiceLabels,
      openInvoice,
      duplicates: { past: duplicates.past },
      openDeals,
      suggested,
      dealFields,
      agreedPlan,
      maxDiscount,
      noMarketing,
      messages,
      templates,
      vars,
      blocker,
      offers,
      ai,
      kaspiWarning,
      catalog,
      mentionables,
      gifts,
      refundAfterOrder,
      aiProposals,
    };
  }),
};

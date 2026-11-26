import "server-only";
import { z } from "zod";
import { can, canSeeAssigned, canSeeOrder, staffViewer } from "@/server/access";
import { boardViewer } from "@/server/boards-api";
import { container } from "@/server/container";
import { uuid } from "@/server/input";
import { op } from "./op";

/**
 * Сборщики данных небольших страниц CRM (ADR 0012, A5 — Раздел 5): промокоды, сертификаты, отзывы, маркетинг, команда,
 * журнал, планы, роли, безопасность, звонки, книги, шаблоны, обращения, лимиты и дизайнер ИИ. Код — тот, что стоял в
 * странице; права — как у страницы (requireStaff), видимость по роли считается здесь по сотруднику из сессии.
 */
const none = z.object({}).strict();
const text = (max: number) => z.string().max(max).optional();

export const reads = {
  "pages.promo": op(["promo.manage"], none, async () => container().ordering.queries.promoStats()),

  "pages.gifts": op(["gifts.manage"], none, async () => container().ordering.queries.recentGifts()),

  "pages.reviews": op(["reviews.manage"], z.object({ filter: z.enum(["new", "published", "hidden", "all"]) }), async ({ filter }) => {
    const feedback = container().feedback;
    const [list, counts, summary] = await Promise.all([feedback.queries.list(filter), feedback.queries.counts(), feedback.queries.summary()]);
    return { list, counts, summary };
  }),

  "pages.marketing": op([], z.object({ period: z.number().int().min(0).max(366), archived: z.boolean() }), async ({ period, archived }, staff) => {
    if (!can(staff, "analytics.view") && !can(staff, "promo.manage")) return null;
    const marketing = container().marketing;
    const [report, links, waNumber, spendRows] = await Promise.all([marketing.service.report(period || null), marketing.links.all(), marketing.service.shopWhatsapp(), can(staff, "promo.manage") ? marketing.spend.recent(15) : Promise.resolve([])]);
    const visibleLinks = links.filter((l) => (archived ? l.archived : !l.archived));
    const targets = new Map(await Promise.all(visibleLinks.map(async (l) => [l.id, await marketing.service.target(l)] as const)));
    return { report, links, waNumber, spendRows, targets };
  }),

  "pages.team": op(["team.manage"], none, async () => {
    const [roles, members] = await Promise.all([container().access.queries.roles(), container().access.queries.team()]);
    return { roles, members };
  }),

  "pages.audit": op(["team.manage", "audit.view"], z.object({ actor: uuid.optional(), entity: text(30) }), async ({ actor, entity }) => {
    const [rows, team] = await Promise.all([container().access.queries.auditLog({ actorId: actor, entity }), container().access.queries.allStaff()]);
    return { rows, team };
  }),

  "pages.plans": op(["team.manage"], z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), async ({ month }) => {
    const staff = await container().access.queries.activeStaffList();
    const progress = await container().sales.queries.planProgress(month, staff.map((s) => s.id));
    return { staff, progress };
  }),

  "pages.roles": op(["team.manage"], none, async () => container().access.queries.rolesWithMembers()),

  "pages.security": op("shell", z.object({ manage: z.boolean() }), async ({ manage }, staff) => {
    const [{ getSetting }, { trustedClientIp }] = await Promise.all([import("@/modules/workspace"), import("@/server/rateLimit")]);
    // Сотрудник, которому осталось настроить 2FA, видит только свой вход: список команды — по праву и без ограничения.
    const may = manage && can(staff, "settings.manage", "team.manage");
    const [require2fa, allowlist, ip, team] = await Promise.all([getSetting("security.require2fa"), getSetting("security.ipAllowlist"), trustedClientIp(), may ? container().access.queries.twoFactorStatus() : Promise.resolve([])]);
    return { require2fa, allowlist, ip, team, me: { totpEnabledAt: staff.user.totpEnabledAt ?? null, backupLeft: staff.user.totpBackup?.length ?? 0 } };
  }),

  "pages.calls": op(["calls.view"], z.object({ f: z.string().max(20), days: z.number().int().min(1).max(90) }), async ({ f, days }, staff) => {
    const [journal, admins, provider] = await Promise.all([
      container().reporting.callJournal(staffViewer(staff), f as Parameters<ReturnType<typeof container>["reporting"]["callJournal"]>[1], days),
      container().access.queries.allStaff(),
      container().telephony.phone.currentProvider(),
    ]);
    return { journal, admins, provider };
  }),

  "pages.books": op(["clients.view"], z.object({ f: z.string().max(20), q: text(200), theme: text(60), now: z.number() }), async ({ f, q, theme, now }, staff) => {
    const { STALLED_DAYS } = await import("@/modules/reporting");
    return container().reporting.bookList(f as Parameters<ReturnType<typeof container>["reporting"]["bookList"]>[0], { q, theme, staleDays: STALLED_DAYS, now, viewer: staffViewer(staff) });
  }),

  "pages.templates": op(["chats.view"], none, async (_, staff) => container().messaging.view.templates(staff.user.id)),

  "pages.supportList": op([], z.object({ status: z.string().max(20), q: z.string().max(100) }), async ({ status, q }, staff) => {
    const { seesAllTickets } = await import("@/server/support-access");
    const mine = seesAllTickets(staff) ? undefined : staff.user.id;
    const tickets = container().support.tickets;
    const [list, counts] = await Promise.all([tickets.list({ status: status as Parameters<typeof tickets.list>[0]["status"], q, createdBy: mine, limit: 200 }), tickets.counts(mine)]);
    return { list, counts };
  }),

  "pages.supportChat": op(["chats.view"], z.object({ id: uuid }), async ({ id }, staff) => {
    const conv = await container().messaging.queries.conversation(id);
    return conv && canSeeAssigned(staff, conv.assigneeId) ? { id: conv.id, contact: conv.contactName, chatId: conv.chatId, channel: conv.channel } : null;
  }),

  "pages.supportTicket": op([], z.object({ number: z.number().int().positive() }), async ({ number }, staff) => {
    const { canOpenTicket } = await import("@/server/support-access");
    const t = await container().support.tickets.byNumber(number);
    return t && canOpenTicket(staff, t) ? t : null;
  }),

  "pages.aiLimits": op(["settings.manage"], z.object({ q: z.string().max(100), selectedId: uuid.nullable() }), async ({ q, selectedId }) => {
    const { clientAiLimits, clientAiUsage, userAiOverrides } = await import("@/server/clientAiLimits");
    const [base, overrides] = await Promise.all([clientAiLimits(), userAiOverrides()]);
    const reporting = container().reporting;
    const [found, selected, ownUsers] = await Promise.all([
      q ? reporting.clients({ segment: "all", q, limit: 10, offset: 0 }) : null,
      selectedId ? reporting.clientById(selectedId) : null,
      Promise.all(Object.keys(overrides).map((id) => reporting.clientById(id))),
    ]);
    const usage = selected ? await clientAiUsage(selected.id) : null;
    return { base, overrides, found, selected, ownUsers, usage };
  }),

  "pages.aiDesigner": op(["analytics.view"], z.object({ days: z.number().int().min(1).max(366) }), async ({ days }) => {
    const [{ designAiFreeLimit }, { designAiStats }, { fromEnv, getSetting }] = await Promise.all([import("@/server/designAiStore"), import("@/server/designAiStats"), import("@/modules/workspace")]);
    const limit = await designAiFreeLimit();
    const [s, settings, apiKey] = await Promise.all([designAiStats(days, limit), container().assistant.designSettings(), getSetting("ai.apiKey")]);
    return { limit, s, settings, keyReady: !!apiKey || fromEnv("ai.apiKey") };
  }),

  "pages.automations": op(["settings.manage"], none, async (_, staff) => {
    const [{ getSetting }, { RULE_STATS_DAYS }] = await Promise.all([import("@/modules/workspace"), import("@/modules/reporting")]);
    const [rules, stages, admins, holidays, sales, pipelines, boards] = await Promise.all([
      container().automation.rules.list(),
      container().sales.queries.listStages(),
      container().access.queries.allStaff(),
      getSetting("automation.holidays"),
      container().reporting.automationStats(),
      container().sales.queries.listPipelines(),
      container().boards.boards.outline(boardViewer(staff)),
    ]);
    return { rules, stages, admins, holidays, sales, pipelines, boards, statsDays: RULE_STATS_DAYS };
  }),

  "pages.automationRuns": op(["settings.manage"], z.object({ id: uuid }), async ({ id }) => {
    const rule = await container().automation.rules.find(id);
    return rule ? { rule, runs: await container().automation.rules.runs(rule.id) } : null;
  }),

  "pages.productionBoard": op(["orders.view"], z.object({ since: z.date() }), async ({ since }, staff) => {
    const [rows, admins] = await Promise.all([container().reporting.productionBoard(since, staffViewer(staff)), container().access.queries.allStaff()]);
    return { rows, admins };
  }),

  // Свежесть каталога (syncIfStale) — действие syncCatalogIfStaleAction: чтение не меняет данные.
  "pages.catalog": op(["catalog.manage"], none, async () => {
    const catalog = container().messaging.catalog;
    const [products, settings, synced, status] = await Promise.all([catalog.list(), catalog.settings(), catalog.lastSyncedAt(), container().messaging.gowa.cachedStatus()]);
    const collections = await catalog.collections().then(
      (list) => ({ list, error: null as string | null }),
      (err: unknown) => ({ list: [], error: err instanceof Error ? err.message : String(err) }),
    );
    return { products, settings, synced, status, collections };
  }),

  "pages.search": op([], z.object({ term: z.string().min(1).max(200) }), async ({ term }, staff) =>
    container().reporting.search(term, staffViewer(staff), {
      orders: can(staff, "orders.view"),
      clients: can(staff, "clients.view"),
      deals: can(staff, "deals.view"),
      chats: can(staff, "chats.view"),
    }),
  ),

  "pages.packingSlip": op(["orders.view"], z.object({ id: uuid }), async ({ id }, staff) => {
    const order = await container().ordering.queries.orderDetails(id);
    return order && (await canSeeOrder(staff, order.id)) ? order : null;
  }),

  "pages.dealFields": op(["settings.manage"], z.object({ entity: z.enum(["deal", "client"]) }), async ({ entity }) => (await import("@/modules/workspace")).listFields(entity)),

  "pages.newDeal": op(["deals.edit"], z.object({ clientId: uuid.nullable() }), async ({ clientId }, staff) => {
    const { discountLimit } = await import("@/server/discount");
    const [stages, admins, client, pipelines, maxDiscount] = await Promise.all([
      container().sales.queries.listStages(),
      container().access.queries.allStaff(),
      clientId ? container().reporting.clientById(clientId) : null,
      container().sales.queries.listPipelines(),
      discountLimit(staff),
    ]);
    return { stages, admins, client, pipelines, maxDiscount };
  }),

  "pages.newClient": op(["clients.create"], none, async (_, staff) => {
    const { discountLimit } = await import("@/server/discount");
    const [stages, pipelines, admins, maxDiscount] = await Promise.all([container().sales.queries.listStages(), container().sales.queries.listPipelines(), container().access.queries.allStaff(), discountLimit(staff)]);
    return { stages, pipelines, admins, maxDiscount };
  }),

  "pages.stages": op(["settings.manage"], z.object({ p: text(60) }), async ({ p }) => {
    const { getSetting } = await import("@/modules/workspace");
    const { parseStageOrder } = await import("@/shared/domain/stageOrder");
    const pipelines = await container().sales.queries.listPipelines();
    const pipeline = pipelines.find((x) => x.id === p) ?? pipelines[0];
    const [stages, counts, entryRaw] = await Promise.all([container().sales.queries.listStages(pipeline.id), container().reporting.stageCounts(), getSetting("crm.entryStages")]);
    const showEntry = pipeline.id === pipelines[0].id;
    const [order, aiReady] = showEntry ? await Promise.all([getSetting("crm.stageOrder").then(parseStageOrder), container().assistant.service.configured()]) : [null, false];
    return { pipelines, pipeline, stages, counts, entryRaw, showEntry, order, aiReady };
  }),

  "pages.duplicates": op(["deals.view", "deals.edit"], z.object({ limit: z.number().int().min(1).max(200) }), async ({ limit }, staff) => {
    const [found, admins] = await Promise.all([container().reporting.duplicateGroups(), container().access.queries.allStaff()]);
    const visible = found
      .map((r) => ({ ...r, deals: r.deals.filter((d) => canSeeAssigned(staff, d.assignee)) }))
      .filter((r) => r.deals.length > 1);
    const ids = [...new Set(visible.slice(0, limit).flatMap((g) => g.deals.map((d) => d.id)))];
    const details = new Map(
      await Promise.all(
        ids.map(async (id) => {
          const [deal, invoices] = await Promise.all([container().reporting.dealById(id), container().ordering.invoices.listFor(id)]);
          return [id, { deal, invoices }] as const;
        }),
      ),
    );
    return { found, admins, details };
  }),

  "pages.boards": op([], z.object({ archived: z.boolean() }), async ({ archived }, staff) => {
    const c = container().boards;
    return { boards: await c.boards.list(boardViewer(staff), { archived }), templates: c.boards.templates() };
  }),

  "pages.board": op([], z.object({ id: uuid, done: z.boolean() }), async ({ id, done }, staff) => {
    const { BoardsError } = await import("@/modules/boards");
    const v = boardViewer(staff);
    const c = container();
    let view;
    try {
      view = await c.boards.boards.view(v, id, { done });
    } catch (e) {
      if (BoardsError.is(e)) return null;
      throw e;
    }
    const [boards, admins] = await Promise.all([c.boards.boards.list(v), c.access.queries.allStaff()]);
    return { view, boards, admins };
  }),

  "pages.calendar": op([], none, async (_, staff) => {
    const [admins, google] = await Promise.all([container().access.queries.allStaff(), container().boards.google.status(boardViewer(staff))]);
    return { admins, google };
  }),

  // Функции отчёта (подписи времени, долей, плана) через API не передаются — страница считает их сама из shift и plans.
  "pages.analytics": op(["analytics.view"], z.object({ p: text(10), from: text(10), to: text(10), pl: text(40) }), async (q, staff) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- функции отчёта отбрасываются
    const { workMins, share, planPct, ...data } = await (await import("@/server/sales-analytics")).loadSalesAnalytics(staff, q);
    return data;
  }),

  // Приложение CRM на телефон: есть ли APK, телефоны в сборке iOS и ссылка установки (подпись токена — секрет бэкенда).
  "pages.app": op([], none, async (_, staff) => {
    const [{ hasMobileApk }, { iosStatus, iosToken }] = await Promise.all([import("@/server/mobile-apk"), import("@/server/ios-app")]);
    const [apk, status] = await Promise.all([hasMobileApk(), iosStatus(staff.user.id)]);
    return { apk, status, installToken: iosToken(staff.user.id, "install", 3600) };
  }),

  "pages.site": op(["settings.manage"], none, async () => {
    const [{ hasMobileApk }, { maxPhotos }] = await Promise.all([import("@/server/mobile-apk"), import("@/server/photoLimit")]);
    const [apkUploaded, photos] = await Promise.all([hasMobileApk(), maxPhotos()]);
    return { apkUploaded, maxPhotos: photos };
  }),
};

/**
 * Маркетинг в приложении CRM: промокоды, сертификаты, отзывы — те же данные и действия, что у страниц CRM.
 */
import { apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { formatDate } from "@/lib/dates";
import { parseDay } from "@/lib/occasions";
import { planName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
import { PUBLIC_TEXT_MIN } from "@/modules/feedback";
import { createPromoAction, togglePromoAction } from "@/app/admin/actions";
import { archiveLinkAction, createLinkAction } from "@/app/admin/marketing/actions";
import { conversion, costPerLead, romi } from "@/modules/marketing";
import { landings } from "@/lib/content/landings";
import { can } from "@/server/access";
import { HttpError } from "@/server/api";
import { cancelGiftAction, resendGiftAction } from "@/app/admin/gifts/actions";
import { moderateReviewAction } from "@/app/admin/reviews/actions";
import { POST as giftReceiptRoute } from "@/app/api/admin/gifts/[id]/receipt/route";
import type { Handlers } from "../../app";
import { refused } from "./common";
import { siteFileRoute } from "./site-route";
import { designAiFreeLimit } from "@/server/designAiStore";
import { designAiStats } from "@/server/designAiStats";
import { grantCreditsAction, saveFreeLimitAction } from "@/app/admin/ai-designer/actions";

const GIFT_STATUS = { pending_payment: "Ждёт оплаты", paid: "Оплачен", cancelled: "Отменён" } as const;
const MODERATE = { publish: "Отзыв на сайте", hide: "Отзыв скрыт", feature: "Закреплён на главной", unfeature: "Откреплён" } as const;

type MarketingHandlers = "crmDesignAi" | "crmDesignAiGrant" | "crmDesignAiLimit" | "crmMarketing" | "crmMarketingLinkCreate" | "crmMarketingLinkArchive" | "crmPromos" | "crmPromoCreate" | "crmPromoToggle" | "crmGifts" | "crmGiftPaid" | "crmGiftResend" | "crmGiftCancel" | "crmReviews" | "crmReviewModerate";

type Metrics = Parameters<typeof romi>[0];

const pct = (v: number | null) => (v === null ? "—" : `${(Math.round(v * 1000) / 10).toString().replace(".", ",")}%`);
const stat = (m: Metrics, key: string, label: string) => {
  const r = romi(m);
  const cpl = costPerLead(m);
  return {
    key,
    label,
    clicks: m.clicks,
    leads: m.leads,
    registrations: m.registrations,
    startedBook: m.startedBook,
    sales: m.sales,
    revenue: m.revenue,
    // Расход есть, только если по каналу его вносили.
    spend: m.spend ?? 0,
    conversion: pct(conversion(m)),
    costPerLead: cpl === null ? "—" : formatPrice(cpl),
    romi: r === null ? "—" : `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`,
  };
};

const DESIGN_MODES: Record<string, string> = { edit: "Изменить", create: "Придумать", variants: "3 варианта", review: "Оценить" };

export const crmMarketingHandlers: Pick<Handlers, MarketingHandlers> = {
  async crmDesignAi({ req, input }) {
    const staff = await apiStaff(req, "analytics.view");
    const days = Number(input.days ?? "30");
    const limit = await designAiFreeLimit();
    const [s, settings] = await Promise.all([designAiStats(days, limit), container().assistant.designSettings()]);
    const t = s.totals;
    return {
      days,
      enabled: settings.enabled,
      freeLimit: limit,
      canEdit: can(staff, "settings.manage"),
      totals: { ok: t.ok, failed: t.failed, users: t.users, free: t.free, credit: t.credit, costUsd: t.costUsd, avgSeconds: t.avgMs === null ? null : Math.round(t.avgMs / 100) / 10 },
      people: s.people,
      purchases: s.purchases,
      byMode: s.byMode.map((m) => ({ key: m.key, label: DESIGN_MODES[m.key] ?? m.key, requests: m.requests, costUsd: m.costUsd })),
      byDay: s.byDay,
      users: s.topUsers.map((u) => ({ userId: u.userId, name: u.name, email: u.email, requests: u.requests, free: u.free, credit: u.credit, credits: u.credits, lastLabel: formatDate(u.lastAt, true) })),
    };
  },

  async crmDesignAiGrant({ req, input }) {
    await apiStaff(req, "settings.manage");
    const form = new FormData();
    form.set("userId", input.body.userId);
    form.set("count", String(input.body.count));
    const r = await grantCreditsAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true as const, message: `Подарено запросов: ${input.body.count}` };
  },

  async crmDesignAiLimit({ req, input }) {
    await apiStaff(req, "settings.manage");
    const form = new FormData();
    form.set("limit", String(input.body.limit));
    const r = await saveFreeLimitAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true as const, message: r.ok ?? "Сохранено" };
  },

  async crmMarketing({ req, input }) {
    const staff = await apiStaff(req);
    if (!can(staff, "analytics.view") && !can(staff, "promo.manage")) throw new HttpError(403, "forbidden");
    const period = Number(input.period ?? "30");
    const archived = input.archived === "1";
    const marketing = container().marketing;
    const [report, links] = await Promise.all([marketing.service.report(period || null), marketing.links.all()]);
    const visible = links.filter((l) => l.archived === archived);
    const targets = new Map(await Promise.all(visible.map(async (l) => [l.id, await marketing.service.target(l)] as const)));
    return {
      period,
      total: stat(report.total, "total", "Всего"),
      channels: report.channels.map((c) => stat(c, c.key, c.label)),
      links: visible.map((l) => {
        const m = report.links.get(l.slug);
        return {
          id: l.id,
          name: l.name,
          slug: l.slug,
          shortUrl: marketing.service.shortUrl(l.slug),
          target: l.kind === "whatsapp" ? "в WhatsApp" : l.targetPath,
          fullUrl: targets.get(l.id) ?? "",
          archived: l.archived,
          createdLabel: formatDate(l.createdAt),
          clicks: m?.clicks ?? 0,
          leads: m?.leads ?? 0,
          registrations: m?.registrations ?? 0,
          sales: m?.sales ?? 0,
          revenue: m?.revenue ?? 0,
        };
      }),
      archived,
      showAnalytics: can(staff, "analytics.view"),
      canManage: can(staff, "promo.manage"),
      pages: [{ path: "/", label: "Главная" }, { path: "/gift", label: "Подарочный сертификат" }, ...landings.map((l) => ({ path: `/kniga/${l.slug}`, label: l.content.ru.label }))],
    };
  },

  async crmMarketingLinkCreate({ req, input }) {
    await apiStaff(req, "promo.manage");
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) form.set(k, String(v ?? ""));
    const r = await createLinkAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true as const, message: r.ok ?? "Ссылка создана" };
  },

  async crmMarketingLinkArchive({ req, input }) {
    await apiStaff(req, "promo.manage");
    await archiveLinkAction(input.id, input.body.archived);
    return { ok: true as const, message: input.body.archived ? "Ссылка в архиве" : "Ссылка возвращена" };
  },

  async crmPromos({ req }) {
    await apiStaff(req, "promo.manage");
    const list = await container().ordering.queries.promoStats();
    return {
      rows: list.map(({ promo, revenue, paid }) => ({
        id: promo.id,
        code: promo.code,
        discount: promo.kind === "percent" ? `${promo.value}%` : formatPrice(promo.value),
        active: promo.active,
        used: promo.usedCount,
        maxUses: promo.maxUses ?? null,
        until: promo.expiresAt ? `до ${formatDate(promo.expiresAt)}` : "бессрочно",
        note: promo.note ?? "",
        paid,
        revenue,
      })),
      totals: {
        count: list.length,
        active: list.filter((x) => x.promo.active).length,
        used: list.reduce((a, x) => a + x.promo.usedCount, 0),
        paid: list.reduce((a, x) => a + x.paid, 0),
        revenue: list.reduce((a, x) => a + x.revenue, 0),
      },
    };
  },

  async crmPromoCreate({ req, input }) {
    await apiStaff(req, "promo.manage");
    const b = input.body;
    const form = new FormData();
    form.set("code", b.code);
    form.set("kind", b.kind);
    form.set("value", String(b.value));
    if (b.maxUses) form.set("maxUses", String(b.maxUses));
    if (b.expiresAt) form.set("expiresAt", b.expiresAt);
    if (b.note) form.set("note", b.note);
    const r = await createPromoAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true as const, message: r.ok ?? "Промокод создан" };
  },

  async crmPromoToggle({ req, input }) {
    await apiStaff(req, "promo.manage");
    await togglePromoAction(input.id);
    return { ok: true as const, message: null };
  },

  async crmGifts({ req }) {
    await apiStaff(req, "gifts.manage");
    const ru = messagesFor("ru").common;
    const list = await container().ordering.queries.recentGifts();
    const delivery = (g: (typeof list)[number]) => (g.recipientEmail ? (g.sentAt ? "письмо отправлено" : g.sendAt ? `отправка ${ru.date(parseDay(g.sendAt))}` : "ждёт отправки") : "вручит сам(а)");
    const row = (g: (typeof list)[number]) => ({
      id: g.id,
      number: g.number,
      status: g.status,
      statusLabel: GIFT_STATUS[g.status],
      amount: g.amount,
      plan: planName(g.plan),
      buyer: g.buyerName ?? "",
      buyerContact: [g.buyerEmail, g.buyerPhone].filter(Boolean).join(", "),
      recipient: g.recipientName,
      delivery: delivery(g),
      createdLabel: formatDate(g.createdAt),
      claimed: !!g.paymentClaimedAt,
      code: g.promo?.code ?? null,
      redeemed: !!g.promo && g.promo.usedCount > 0,
      canResend: !!g.recipientEmail,
      receiptUrl: g.receiptStorageKey ? `/api/admin/gifts/${g.id}/receipt` : null,
    });
    const paid = list.filter((g) => g.status === "paid");
    const waiting = list.filter((g) => g.status === "pending_payment").sort((a, b) => Number(!!b.paymentClaimedAt) - Number(!!a.paymentClaimedAt));
    return {
      waiting: waiting.map(row),
      register: list.filter((g) => g.status !== "pending_payment").map(row),
      totals: { paid: paid.length, redeemed: paid.filter((g) => g.promo && g.promo.usedCount > 0).length, revenue: paid.reduce((s, g) => s + g.amount, 0), claimed: waiting.filter((g) => g.paymentClaimedAt).length },
    };
  },

  async crmGiftPaid({ req, input }) {
    await apiStaff(req, "gifts.manage");
    // Тот же маршрут чека, что у кнопки «Оплачен» на сайте: проверка файла, выпуск кода, письма, журнал.
    const { res } = await siteFileRoute(giftReceiptRoute, req, input.id, {}, input.files[0]);
    if (!res.ok) return res;
    return { ok: true as const, message: "Оплата подтверждена — код отправлен" };
  },

  async crmGiftResend({ req, input }) {
    await apiStaff(req, "gifts.manage");
    await resendGiftAction(input.id);
    return { ok: true as const, message: "Сертификат отправлен ещё раз" };
  },

  async crmGiftCancel({ req, input }) {
    await apiStaff(req, "gifts.manage");
    await cancelGiftAction(input.id);
    return { ok: true as const, message: "Сертификат отменён" };
  },

  async crmReviews({ req, input }) {
    await apiStaff(req, "reviews.manage");
    const themes = messagesFor("ru").review.showcase.theme as Record<string, string>;
    const filter = input.s ?? "new";
    const feedback = container().feedback;
    const [list, counts, summary] = await Promise.all([feedback.queries.list(filter), feedback.queries.counts(), feedback.queries.summary()]);
    return {
      rows: list.map((r) => ({
        id: r.id,
        status: r.status,
        rating: r.rating,
        text: r.text,
        author: r.authorName ?? "",
        city: r.city ?? "",
        theme: themes[r.theme] ?? r.theme,
        locale: r.locale,
        featured: !!r.featured,
        blocker: !r.consent ? "Автор не разрешил показывать отзыв на сайте" : r.text.trim().length < PUBLIC_TEXT_MIN ? `Текст короче ${PUBLIC_TEXT_MIN} символов — на сайт не попадёт` : null,
        photoUrl: r.photo ? `/api/reviews/photo/${r.id}` : null,
        orderId: r.orderId ?? null,
        orderNumber: r.orderNumber ?? null,
        thankYouCode: r.thankYouCode ?? null,
        createdLabel: formatDate(r.createdAt),
      })),
      counts: { waiting: counts.new ?? 0, published: counts.published ?? 0, hidden: counts.hidden ?? 0 },
      average: summary.count ? `${summary.average.toFixed(1)} из 5` : "—",
      filter,
    };
  },

  async crmReviewModerate({ req, input }) {
    await apiStaff(req, "reviews.manage");
    await moderateReviewAction(input.id, input.action);
    return { ok: true as const, message: MODERATE[input.action] };
  },
};

import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import { formatPrice } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { planName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
import { landings } from "@/lib/content/landings";
import { formatDate } from "@/lib/dates";
import { parseDay } from "@/lib/occasions";
import { PUBLIC_TEXT_MIN } from "@/modules/feedback";
import { conversion, costPerLead, romi } from "@/modules/marketing";
import { RECEIPT_MAX_BYTES, receiptProblem } from "@/shared/domain/receipt";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { callContext, done, refused } from "./crm-admin.helpers";
import { CRM_ADMIN_PORTS, type CrmAdminPorts, type CrmGiftRecord } from "./crm-admin.tokens";

const GIFT_STATUS = { pending_payment: "Ждёт оплаты", paid: "Оплачен", cancelled: "Отменён" } as const;
const MODERATE = {
  publish: "Отзыв на сайте",
  hide: "Отзыв скрыт",
  feature: "Закреплён на главной",
  unfeature: "Откреплён",
} as const;
const DESIGN_MODES: Readonly<Record<string, string>> = {
  edit: "Изменить",
  create: "Придумать",
  variants: "3 варианта",
  review: "Оценить",
};

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
    spend: m.spend ?? 0,
    conversion: pct(conversion(m)),
    costPerLead: cpl === null ? "—" : formatPrice(cpl),
    romi: r === null ? "—" : `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`,
  };
};

/**
 * Маркетинг и ИИ-дизайнер в CRM (15 контрактных маршрутов): отчёт и лимиты ИИ-дизайнера,
 * каналы и короткие ссылки, промокоды, подарочные сертификаты (включая чек оплаты), отзывы.
 */
@Controller()
export class CrmMarketingController {
  constructor(
    @Inject(CRM_ADMIN_PORTS) private readonly ports: CrmAdminPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmDesignAi")
  @Permissions("analytics.view")
  async designAi(
    @CurrentStaff() staff: StaffMember,
    @Input() input: Parsed<"crmDesignAi">,
  ): Promise<Output<"crmDesignAi">> {
    const days = Number(input.days ?? "30");
    const limit = await this.ports.designAiFreeLimit();
    const [s, settings] = await Promise.all([this.ports.designAiStats(days, limit), this.ports.designAiSettings()]);
    const t = s.totals;
    return {
      days,
      enabled: settings.enabled,
      freeLimit: limit,
      canEdit: staff.context.can("settings.manage"),
      totals: {
        ok: t.ok,
        failed: t.failed,
        users: t.users,
        free: t.free,
        credit: t.credit,
        costUsd: t.costUsd,
        avgSeconds: t.avgMs === null ? null : Math.round(t.avgMs / 100) / 10,
      },
      people: s.people,
      purchases: s.purchases,
      byMode: s.byMode.map((m) => ({ key: m.key, label: DESIGN_MODES[m.key] ?? m.key, requests: m.requests, costUsd: m.costUsd })),
      byDay: s.byDay,
      users: s.topUsers.map((u) => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        requests: u.requests,
        free: u.free,
        credit: u.credit,
        credits: u.credits,
        lastLabel: formatDate(u.lastAt, true),
      })),
    };
  }

  @Endpoint("crmDesignAiGrant")
  @Permissions("settings.manage")
  async designAiGrant(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDesignAiGrant">,
  ): Promise<Output<"crmDesignAiGrant"> | Response> {
    const form = new FormData();
    form.set("userId", input.body.userId);
    form.set("count", String(input.body.count));
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.grantDesignAiCredits(ctx, form);
    if (r.error) return refused(r.error);
    return done(`Подарено запросов: ${input.body.count}`);
  }

  @Endpoint("crmDesignAiLimit")
  @Permissions("settings.manage")
  async designAiLimit(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDesignAiLimit">,
  ): Promise<Output<"crmDesignAiLimit"> | Response> {
    const form = new FormData();
    form.set("limit", String(input.body.limit));
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.saveDesignAiFreeLimit(ctx, form);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Сохранено");
  }

  @Endpoint("crmMarketing")
  async marketing(
    @CurrentStaff() staff: StaffMember,
    @Input() input: Parsed<"crmMarketing">,
  ): Promise<Output<"crmMarketing">> {
    // Паритет с apps/api: достаточно ЛЮБОГО из двух прав (analytics.view ИЛИ promo.manage).
    if (!staff.context.can("analytics.view") && !staff.context.can("promo.manage")) {
      throw new ApiError(403, "forbidden");
    }
    const period = Number(input.period ?? "30");
    const archived = input.archived === "1";
    const [report, links] = await Promise.all([
      this.ports.marketingReport(period || null),
      this.ports.marketingLinks(),
    ]);
    const visible = links.filter((l) => l.archived === archived);
    const targets = new Map(await Promise.all(visible.map(async (l) => [l.id, await this.ports.marketingLinkTarget(l)] as const)));
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
          shortUrl: this.ports.marketingShortUrl(l.slug),
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
      showAnalytics: staff.context.can("analytics.view"),
      canManage: staff.context.can("promo.manage"),
      pages: [
        { path: "/", label: "Главная" },
        { path: "/gift", label: "Подарочный сертификат" },
        ...landings.map((l) => ({ path: `/kniga/${l.slug}`, label: l.content.ru.label })),
      ],
    };
  }

  @Endpoint("crmMarketingLinkCreate")
  @Permissions("promo.manage")
  async createLink(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmMarketingLinkCreate">,
  ): Promise<Output<"crmMarketingLinkCreate"> | Response> {
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) form.set(k, String(v ?? ""));
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.createMarketingLink(ctx, form);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Ссылка создана");
  }

  @Endpoint("crmMarketingLinkArchive")
  @Permissions("promo.manage")
  async archiveLink(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmMarketingLinkArchive">,
  ): Promise<Output<"crmMarketingLinkArchive">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.archiveMarketingLink(ctx, input.id, input.body.archived);
    return done(input.body.archived ? "Ссылка в архиве" : "Ссылка возвращена");
  }

  @Endpoint("crmPromos")
  @Permissions("promo.manage")
  async promos(): Promise<Output<"crmPromos">> {
    const list = await this.ports.promoStats();
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
  }

  @Endpoint("crmPromoCreate")
  @Permissions("promo.manage")
  async createPromo(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmPromoCreate">,
  ): Promise<Output<"crmPromoCreate"> | Response> {
    const b = input.body;
    const form = new FormData();
    form.set("code", b.code);
    form.set("kind", b.kind);
    form.set("value", String(b.value));
    if (b.maxUses) form.set("maxUses", String(b.maxUses));
    if (b.expiresAt) form.set("expiresAt", b.expiresAt);
    if (b.note) form.set("note", b.note);
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.createPromo(ctx, form);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Промокод создан");
  }

  @Endpoint("crmPromoToggle")
  @Permissions("promo.manage")
  async togglePromo(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmPromoToggle">,
  ): Promise<Output<"crmPromoToggle">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.togglePromo(ctx, input.id);
    return done(null);
  }

  @Endpoint("crmGifts")
  @Permissions("gifts.manage")
  async gifts(): Promise<Output<"crmGifts">> {
    const ru = messagesFor("ru").common;
    const list = await this.ports.recentGifts();
    const delivery = (g: CrmGiftRecord) =>
      g.recipientEmail
        ? g.sentAt
          ? "письмо отправлено"
          : g.sendAt
            ? `отправка ${ru.date(parseDay(g.sendAt))}`
            : "ждёт отправки"
        : "вручит сам(а)";
    const row = (g: CrmGiftRecord) => ({
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
    const waiting = list
      .filter((g) => g.status === "pending_payment")
      .sort((a, b) => Number(!!b.paymentClaimedAt) - Number(!!a.paymentClaimedAt));
    return {
      waiting: waiting.map(row),
      register: list.filter((g) => g.status !== "pending_payment").map(row),
      totals: {
        paid: paid.length,
        redeemed: paid.filter((g) => g.promo && g.promo.usedCount > 0).length,
        revenue: paid.reduce((s, g) => s + g.amount, 0),
        claimed: waiting.filter((g) => g.paymentClaimedAt).length,
      },
    };
  }

  @Endpoint("crmGiftPaid")
  @Permissions("gifts.manage")
  async giftPaid(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmGiftPaid">,
  ): Promise<Output<"crmGiftPaid">> {
    // Та же проверка чека и подтверждение оплаты, что у POST /api/admin/gifts/[id]/receipt.
    const file = input.files[0];
    if (!file || !file.size) throw new ApiError(400, "receiptRequired");
    if (file.size > RECEIPT_MAX_BYTES) throw new ApiError(400, "receiptTooBig", RECEIPT_MAX_BYTES / 1024 / 1024);
    const bytes = Buffer.from(await file.arrayBuffer());
    const problem = receiptProblem(bytes);
    if (problem === "tooBig") throw new ApiError(400, "receiptTooBig", RECEIPT_MAX_BYTES / 1024 / 1024);
    if (problem === "empty") throw new ApiError(400, "receiptEmpty");
    if (problem === "type") throw new ApiError(400, "receiptType");
    const fileName = file instanceof File && file.name ? file.name : "receipt";
    const ctx = callContext(req, this.config, staff, token, locale);
    const confirmed = await this.ports.confirmGiftPayment(ctx, input.id, { bytes, fileName });
    if (!confirmed) throw new ApiError(409, "giftNotPending");
    return done("Оплата подтверждена — код отправлен");
  }

  @Endpoint("crmGiftResend")
  @Permissions("gifts.manage")
  async giftResend(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmGiftResend">,
  ): Promise<Output<"crmGiftResend">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.resendGift(ctx, input.id);
    return done("Сертификат отправлен ещё раз");
  }

  @Endpoint("crmGiftCancel")
  @Permissions("gifts.manage")
  async giftCancel(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmGiftCancel">,
  ): Promise<Output<"crmGiftCancel">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.cancelGift(ctx, input.id);
    return done("Сертификат отменён");
  }

  @Endpoint("crmReviews")
  @Permissions("reviews.manage")
  async reviews(@Input() input: Parsed<"crmReviews">): Promise<Output<"crmReviews">> {
    const themes: Readonly<Record<string, string>> = messagesFor("ru").review.showcase.theme;
    const filter = input.s ?? "new";
    const [list, counts, summary] = await Promise.all([
      this.ports.reviewList(filter),
      this.ports.reviewCounts(),
      this.ports.reviewSummary(),
    ]);
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
        blocker: !r.consent
          ? "Автор не разрешил показывать отзыв на сайте"
          : r.text.trim().length < PUBLIC_TEXT_MIN
            ? `Текст короче ${PUBLIC_TEXT_MIN} символов — на сайт не попадёт`
            : null,
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
  }

  @Endpoint("crmReviewModerate")
  @Permissions("reviews.manage")
  async moderateReview(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmReviewModerate">,
  ): Promise<Output<"crmReviewModerate">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.moderateReview(ctx, input.id, input.action);
    return done(MODERATE[input.action]);
  }
}

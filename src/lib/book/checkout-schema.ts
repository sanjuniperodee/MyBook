import { z } from "zod";
import { getDeliveryOptions, getPlan, getPlans, isAbroadDelivery } from "@/config/site";
import type { Messages } from "@/i18n/messages";

/** Форма оформления заказа: проверка ввода и тексты ошибок на языке клиента — общая для сайта и mybook-api. */
const uuid = z.string().uuid();

type CheckoutErrors = Messages["checkout"]["errors"];

export const checkoutSchema = (e: CheckoutErrors) =>
  z
    .object({
      bookId: uuid,
      plan: z.enum(getPlans().map((p) => p.id) as [string, ...string[]]),
      quantity: z.coerce.number().int().min(1).max(20).default(1),
      delivery: z.string().optional(),
      contactName: z.string().trim().min(2, e.contactName).max(100),
      contactPhone: z
        .string()
        .trim()
        .regex(/^[+\d][\d\s()-]{9,20}$/, e.phone),
      contactEmail: z.string().trim().toLowerCase().email(e.email),
      country: z.string().trim().max(60).optional(),
      city: z.string().trim().max(100).optional(),
      address: z.string().trim().max(300).optional(),
      postalCode: z.string().trim().max(20).optional(),
      comment: z.string().trim().max(1000).optional(),
      promoCode: z.string().trim().max(40).optional(),
      addons: z.string().max(100).optional(),
      giftNote: z.string().trim().max(500, e.giftNote).optional(),
      desiredDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .or(z.literal("")),
      surprise: z.literal("on").optional(),
      agreementMode: z.enum(["agreed", "advance"]).optional(),
      upgradeFrom: uuid.optional().or(z.literal("")),
      consent: z.literal("on", { message: e.consent }),
    })
    .superRefine((d, ctx) => {
      const plan = getPlan(d.plan);
      if (!plan?.printed) return;
      const del = getDeliveryOptions().find((o) => o.id === d.delivery);
      if (!del) ctx.addIssue({ code: "custom", message: e.delivery });
      if (del && isAbroadDelivery(del.id) && (!d.country || d.country.length < 2)) ctx.addIssue({ code: "custom", message: e.country });
      if (del && del.id !== "pickup") {
        if (!d.city) ctx.addIssue({ code: "custom", message: e.city });
        if (!d.address || d.address.length < 5) ctx.addIssue({ code: "custom", message: e.address });
      }
      // За границу без индекса не отправить.
      if (del && isAbroadDelivery(del.id) && !d.postalCode) ctx.addIssue({ code: "custom", message: e.postalCode });
    });

export type CheckoutInput = z.output<ReturnType<typeof checkoutSchema>>;

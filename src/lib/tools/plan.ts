/**
 * План книги к дате: от дня вручения назад — когда разослать просьбы о письмах, собрать фото, дописать ответы, проверить
 * макет и оформить заказ. Сроки производства и доставки — те же, что в «Успеть к празднику» (deadlineView → lib/occasions).
 */
import type { DeliveryId } from "@/config/site";
import { addDays, daysBetween, parseDay } from "./together";
import { deadlineView } from "./deadline";

export type StepId = "start" | "letters" | "photos" | "answers" | "check" | "order" | "target";
export type PlanVerdict = "past" | "calm" | "tight" | "hard" | "express" | "digital";

export interface PlanStep {
  id: StepId;
  date: Date;
}

export interface BookPlanResult {
  verdict: PlanVerdict;
  /** Заказать до (по обычному сроку; при экспрессе — по экспресс-сроку). */
  orderBy: Date;
  daysToOrder: number;
  /** Сколько ответов в день нужно писать, чтобы успеть к дню заказа. */
  perDay: number;
  steps: PlanStep[];
}

export const GOALS = { short: 15, normal: 30, big: 50 } as const;
export type Goal = keyof typeof GOALS;

/** Дней запаса до заказа: на проверку макета — день, на ожидание писем и фото — ещё два. */
const CHECK_DAYS = 1;
const COLLECT_DAYS = 3;

export function planFor(input: { target: string; delivery: DeliveryId; now: Date; goal: Goal; letters: boolean; expressAvailable: boolean }): BookPlanResult | null {
  const view = deadlineView(input.target, input.now, input.delivery, input.expressAvailable);
  if (!view) return null;
  const today = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate());
  const targetDay = parseDay(input.target)!;
  if (view.verdict === "past") return { verdict: "past", orderBy: view.orderBy, daysToOrder: view.daysToOrder, perDay: 0, steps: [] };

  const express = view.verdict === "express" && view.orderByExpress;
  const orderBy = express ? view.orderByExpress! : view.orderBy;
  // Электронную версию печатать не нужно: срок — сама дата вручения, заказ — накануне.
  const digital = view.verdict === "digital";
  const deadline = digital ? addDays(targetDay, -1) : orderBy;
  const toDeadline = Math.max(0, daysBetween(today, deadline));

  const clamp = (d: Date) => (d < today ? today : d > deadline ? deadline : d);
  const checkDay = clamp(addDays(deadline, -CHECK_DAYS));
  const collectDay = clamp(addDays(deadline, -COLLECT_DAYS));
  const writeDays = Math.max(1, daysBetween(today, collectDay) + 1);
  const perDay = Math.ceil(GOALS[input.goal] / writeDays);

  const steps: PlanStep[] = [
    { id: "start", date: today },
    ...(input.letters ? [{ id: "letters" as const, date: clamp(addDays(today, 1)) }] : []),
    { id: "photos", date: collectDay },
    { id: "answers", date: collectDay },
    { id: "check", date: checkDay },
    { id: "order", date: deadline },
    { id: "target", date: targetDay },
  ];

  let verdict: PlanVerdict;
  if (digital) verdict = "digital";
  else if (express) verdict = "express";
  else if (toDeadline >= 14 && perDay <= 2) verdict = "calm";
  else if (perDay <= 5) verdict = "tight";
  else verdict = "hard";
  return { verdict, orderBy: deadline, daysToOrder: toDeadline, perDay, steps };
}

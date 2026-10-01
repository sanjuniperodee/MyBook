"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, assertVisible, audit } from "@/server/access";
import { adminLabel } from "@/lib/crm";
import { AssistantError, normalizeExtracted, type AiSummary } from "@/modules/assistant";
import { listFields } from "@/lib/crm/fields";
import { rateLimit } from "@/lib/rate-limit";

const uuid = z.string().uuid();

type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

async function guard<T>(staffId: string, run: () => Promise<T>): Promise<Result<T>> {
  // Запросы к Claude платные: ограничиваем частоту на сотрудника.
  if (!await rateLimit(`ai:${staffId}`, 30, 600_000)) return { ok: false, message: "Слишком много запросов к AI — подождите несколько минут." };
  try {
    return { ok: true, ...(await run()) };
  } catch (err) {
    if (AssistantError.is(err)) return { ok: false, message: err.message };
    throw err;
  }
}

async function loadDeal(dealId: string, staff: Awaited<ReturnType<typeof assertStaff>>) {
  const deal = await container().reporting.dealById(uuid.parse(dealId));
  if (!deal) throw new Error("Сделка не найдена");
  assertVisible(staff, deal.assigneeId);
  return deal;
}

/** Вариант ответа клиенту — менеджер правит и отправляет сам. */
export async function aiSuggestReplyAction(conversationId: string): Promise<Result<{ text: string }>> {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await container().messaging.queries.conversation(uuid.parse(conversationId));
  if (!conv) return { ok: false, message: "Диалог не найден" };
  assertVisible(staff, conv.assigneeId);
  return guard(staff.user.id, async () => {
    const r = await container().assistant.service.suggestReply(conv.id, adminLabel(staff.user));
    await audit(staff, "ai.reply", "conversation", conv.id, r.usage);
    return { text: r.text };
  });
}

export async function aiSummaryAction(dealId: string): Promise<Result<{ summary: AiSummary }>> {
  const staff = await assertStaff("deals.view");
  const deal = await loadDeal(dealId, staff);
  const r = await guard(staff.user.id, async () => {
    const s = await container().assistant.service.summarizeDeal(deal.id);
    await audit(staff, "ai.summary", "deal", deal.id, s.usage);
    return { summary: s.summary };
  });
  if (r.ok) revalidatePath(`/admin/deals/${deal.id}`);
  return r;
}

export type FieldProposal = { key: string; label: string; type: string; value: string | number; current: string | null };

export async function aiExtractFieldsAction(dealId: string): Promise<Result<{ proposals: FieldProposal[] }>> {
  const staff = await assertStaff("deals.view", "deals.edit");
  const deal = await loadDeal(dealId, staff);
  return guard(staff.user.id, async () => {
    const r = await container().assistant.service.extractDealFields(deal.id);
    await audit(staff, "ai.extract", "deal", deal.id, r.usage);
    return { proposals: r.proposals };
  });
}

/** Применить выбранные менеджером значения (повторно проверяем по описанию полей). */
export async function aiApplyFieldsAction(dealId: string, values: Record<string, string | number>) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(dealId, staff);
  const fields = await listFields("deal");
  const clean = normalizeExtracted(
    fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
    z.record(z.string(), z.union([z.string(), z.number()])).parse(values),
  );
  if (!Object.keys(clean).length) return { ok: false as const, message: "Нечего применять" };
  await container().sales.deals.setFields(deal.id, clean);
  await audit(staff, "deal.fields_ai", "deal", deal.id, clean);
  revalidatePath(`/admin/deals/${deal.id}`);
  return { ok: true as const, count: Object.keys(clean).length };
}

/** Следующий шаг из резюме — задачей на ответственного. */
export async function aiNextStepTaskAction(dealId: string) {
  const staff = await assertStaff("deals.view");
  const deal = await loadDeal(dealId, staff);
  const s = deal.aiSummary;
  if (!s?.nextStep) return { ok: false as const, message: "Сначала получите резюме сделки" };
  const due = new Date(Date.now() + s.dueDays * 86_400_000);
  // Задача ответственному за сделку (или тому, кто попросил резюме), срок — до вечера.
  const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  await container().clients.tasks.create(
    { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: true, allTasks: false },
    {
      title: s.nextStep.slice(0, 300),
      kind: /позвон|звон|перезвон/i.test(s.nextStep) ? "call" : /напис|отправ|сообщ/i.test(s.nextStep) ? "message" : "task",
      dueAt: iso,
      dealId: deal.id,
      clientId: deal.clientId ?? undefined,
      assigneeId: deal.assigneeId ?? staff.user.id,
    },
  );
  revalidatePath(`/admin/deals/${deal.id}`);
  return { ok: true as const };
}

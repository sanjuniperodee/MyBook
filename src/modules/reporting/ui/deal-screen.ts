import { formatDate } from "@/lib/dates";
import { channelLabel as acquisitionChannel, describeAttribution, toAttribution } from "@/shared/domain/channels";
import { staffLabel } from "@/shared/domain/staff";
import { noteViews, taskViews } from "./crm-items";

interface Stage {
  id: string;
  pipelineId: string;
  name: string;
  color: string;
  kind: string;
}

interface Payment {
  id: string;
  amount: number;
  kind: string;
  paidAt: Date;
  createdById: string | null;
  note: string;
}

interface Receipt {
  id: string;
  paymentId: string | null;
  fileName: string;
  mime: string;
}

interface Call {
  id: string;
  direction: string;
  status: string;
  startedAt: Date;
  durationSec: number | null;
  staffId: string | null;
  hasRecording: boolean;
}

const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Модель экрана сделки (admin/deals/[id]): воронка и этап, задачи, история, платежи с чеками, звонки и канал привлечения.
 * Только раскладка загруженных данных — без запросов; страница загружает, эта функция готовит, секции рисуют.
 */
export function dealScreen<S extends Stage, P extends Payment>(input: {
  deal: { stageId: string; assigneeId: string | null; utm: Record<string, string> | null; source: string };
  stages: S[];
  staff: { id: string; name: string; email: string }[];
  tasks: Parameters<typeof taskViews>[0];
  notes: Parameters<typeof noteViews>[0];
  payments: P[];
  receipts: Receipt[];
  calls: Call[];
  now: Date;
}) {
  const { deal } = input;
  const names = new Map(input.staff.map((a) => [a.id, staffLabel(a)]));
  const pipelineId = input.stages.find((s) => s.id === deal.stageId)?.pipelineId;
  const stages = input.stages.filter((s) => s.pipelineId === pipelineId);
  const attribution = toAttribution(deal.utm);
  const details = [describeAttribution(attribution), deal.utm?.link ? `ссылка ${deal.utm.link}` : ""].filter(Boolean).join(" · ");
  return {
    names,
    pipelineId,
    stages,
    stage: stages.find((s) => s.id === deal.stageId),
    tasks: taskViews(input.tasks, names, input.now, { withKind: true, withTime: true }),
    notes: noteViews(input.notes, names),
    payments: input.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      kind: p.kind as P["kind"],
      dateLabel: formatDate(p.paidAt),
      author: p.createdById ? (names.get(p.createdById) ?? "—") : "система",
      note: p.note,
      receipts: input.receipts.filter((r) => r.paymentId === p.id).map((r) => ({ id: r.id, fileName: r.fileName, isPdf: r.mime === "application/pdf" })),
    })),
    calls: input.calls.map((c) => ({
      id: c.id,
      icon: (c.direction === "out" ? "out" : c.status === "missed" ? "missed" : "in") as "out" | "missed" | "in",
      missed: c.status === "missed",
      when: formatDate(c.startedAt, true),
      label: c.direction === "out" ? "Исходящий" : c.status === "missed" ? "Пропущенный" : "Входящий",
      duration: c.durationSec ? dur(c.durationSec) : null,
      staff: c.staffId ? names.get(c.staffId) : undefined,
      hasRecording: c.hasRecording,
    })),
    /** Канал привлечения и подробности меток (реклама, ссылка). */
    channel: { label: acquisitionChannel(attribution, deal.source), details },
  };
}

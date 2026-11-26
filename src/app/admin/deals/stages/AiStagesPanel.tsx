"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { AI_STAGES } from "@/shared/domain/aiStages";
import { AI_MARK } from "@/shared/domain/aiProposals";
import { saveAiStagesAction } from "../actions";

/**
 * «ИИ ведёт этапы»: модель помощника читает свежую переписку и двигает сделку сама или предлагает менеджеру кнопкой.
 * Пороги и лимиты — из общего правила (shared/domain/aiStages), а не из текста страницы.
 */
export function AiStagesPanel({ on, ai }: { on: boolean; ai: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [v, setV] = useState(on);
  const save = (next: boolean) =>
    start(async () => {
      setV(next);
      const r = await saveAiStagesAction(next);
      if (r.error) {
        setV(!next);
        return toast(r.error, "error");
      }
      toast(next ? "ИИ ведёт этапы — включено" : "ИИ ведёт этапы — выключено", "success");
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-wine)]" checked={v} disabled={pending || !ai} onChange={(e) => save(e.target.checked)} />
        <span>
          <span className="font-medium">ИИ двигает сделки по переписке {pending ? <LoaderCircle className="inline size-4 animate-spin" aria-hidden /> : null}</span>
          <span className="block text-muted">
            Когда переписка затихла на {AI_STAGES.quietMinutes} минут, ИИ читает последние {AI_STAGES.messages} сообщений и решает, где сделка на самом деле. Между этапами разговора (новая заявка, в работе, не отвечает) и в отказ по словам клиента он
            переводит сам; оплату, книгу на сайте, возврат из отказа и «заказ выдан» — предлагает в карточке сделки кнопкой «Применить». Каждое изменение — в ленте и истории с пометкой «{AI_MARK}», причиной и цитатой из переписки; без
            дословной цитаты ИИ ничего не делает. Не больше {AI_STAGES.perDay} сделок в сутки.
          </span>
        </span>
      </label>
      {!ai ? <p className="text-xs text-muted">ИИ-помощник не подключён («Настройки» → «ИИ-помощники») — включить нельзя.</p> : null}
    </div>
  );
}

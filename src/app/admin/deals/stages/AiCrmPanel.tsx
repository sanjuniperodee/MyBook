"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { AI_CRM_FLAGS, type AiCrmFlagKey } from "@/shared/domain/aiCrm";
import { AI_STAGES } from "@/shared/domain/aiStages";
import { AI_MARK } from "@/shared/domain/aiProposals";
import { saveAiFlagAction } from "../actions";

/**
 * «ИИ в CRM»: что ИИ делает за менеджеров — выключатели из общего списка (shared/domain/aiCrm), каждый — своя настройка.
 * Пороги и лимиты — из общих правил, а не из текста страницы.
 */
export function AiCrmPanel({ flags, ai }: { flags: Partial<Record<AiCrmFlagKey, boolean>>; ai: boolean }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<AiCrmFlagKey | null>(null);
  const router = useRouter();
  const [v, setV] = useState(flags);
  const save = (key: AiCrmFlagKey, label: string, on: boolean) =>
    start(async () => {
      setBusy(key);
      setV((cur) => ({ ...cur, [key]: on }));
      const r = await saveAiFlagAction(key, on);
      setBusy(null);
      if (r.error) {
        setV((cur) => ({ ...cur, [key]: !on }));
        return toast(r.error, "error");
      }
      toast(`${label} — ${on ? "включено" : "выключено"}`, "success");
      router.refresh();
    });
  return (
    <div className="space-y-4">
      {AI_CRM_FLAGS.map((f) => (
        <label key={f.key} className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-wine)]" checked={!!v[f.key]} disabled={pending || !ai} onChange={(e) => save(f.key, f.label, e.target.checked)} />
          <span>
            <span className="font-medium">
              {f.label} {busy === f.key ? <LoaderCircle className="inline size-4 animate-spin" aria-hidden /> : null}
            </span>
            <span className="block text-muted">{f.about}</span>
          </span>
        </label>
      ))}
      <p className="text-xs text-muted">
        Каждое изменение ИИ — в ленте и истории сделки с пометкой «{AI_MARK}», причиной и дословной цитатой из переписки; без цитаты ИИ ничего не меняет. Переписку ИИ читает, когда она затихла на {AI_STAGES.quietMinutes} минут, не больше {AI_STAGES.perDay}{" "}
        сделок в сутки.
      </p>
      {!ai ? <p className="text-xs text-muted">ИИ-помощник не подключён («Настройки» → «ИИ-помощники») — включить нельзя.</p> : null}
    </div>
  );
}

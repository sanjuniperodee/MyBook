import "server-only";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { WebCrmStaff } from "@mybook/contracts";
import { decodeWire, encodeWire } from "@/shared/wire";
// Только типы: ответы операций CRM описаны кодом бэкенда (в отдельном репозитории веба — пакет объявлений).
import type { CrmReads, OpInput, OpOutput } from "@/server/crm-ops/registry";
import { v1WebAction, v1WebRead } from "./api";

/**
 * CRM сайта (/admin) через API v1 (ADR 0012 Раздел 5, ADR 0013): страницы берут данные `crmRead` (сборщики
 * `src/server/crm-ops/*` в mybook-api), server actions в src/app/admin — обёртки `crmAction` над действиями
 * `src/server/crm-actions/*` в mybook-api. Значения — в обёртке `src/shared/wire.ts`.
 */
export type StaffAccessDto = z.output<typeof WebCrmStaff>;

/** Тяжёлые страницы и действия CRM (аналитика, выгрузки, ИИ) отвечают дольше обычных 5 с. */
const CRM_TIMEOUT_MS = 120_000;

/** Права сотрудника и что мешает войти. */
export function crmStaffAccess(): Promise<StaffAccessDto> {
  return v1WebRead({ name: "crm.staff", viaApi: (api) => api.webCrmStaff({}) });
}

/** Данные страницы CRM. */
export function crmRead<K extends keyof CrmReads>(op: K, args: OpInput<CrmReads[K]>): Promise<OpOutput<CrmReads[K]>> {
  return v1WebRead({
    name: `crm.${op}`,
    timeoutMs: CRM_TIMEOUT_MS,
    viaApi: async (api) => decodeWire<OpOutput<CrmReads[K]>>((await api.webCrmRead({ op, body: { args: await encodeWire(args) } })).data),
  });
}

type ActionFn = (...args: never[]) => Promise<unknown>;

/**
 * Server action CRM: `module.fn` выполняется в mybook-api (права, zod и лимиты — в самом действии). После вызова
 * сбрасывается кэш страниц /admin, redirect()/notFound() действия повторяются здесь.
 */
export function crmAction<F extends ActionFn>(module: string, fn: string): F {
  const call = async (...args: unknown[]) =>
    v1WebAction({
      timeoutMs: CRM_TIMEOUT_MS,
      viaApi: async (api) => {
        const reply = await api.webCrmAct({ op: `${module}.${fn}`, body: { args: await encodeWire(args) } });
        // Действие, вызванное при отрисовке страницы (свежесть каталога), кэш не сбрасывает — Next это запрещает.
        try {
          revalidatePath("/admin", "layout");
        } catch {}
        if (reply.redirect) redirect(reply.redirect);
        if (reply.notFound) notFound();
        return decodeWire(reply.data);
      },
    });
  return call as unknown as F;
}

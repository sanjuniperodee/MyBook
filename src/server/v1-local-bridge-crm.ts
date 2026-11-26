import "server-only";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { WebCrmStaff } from "@mybook/contracts";
import { decodeWire, encodeWire } from "@/shared/wire";
import type { CrmReads, OpInput, OpOutput } from "./crm-ops/registry";
import { v1WebAction, v1WebRead } from "./v1-web-client";

/**
 * CRM сайта (/admin) по паттерну душителя (ADR 0012, A5 — Раздел 5, section: "crm"):
 * - страницы берут данные через crmRead (сборщики `src/server/crm-ops/*`);
 * - server actions в src/app/admin — обёртки crmAction над теми же действиями в `src/server/crm-actions/*`.
 * На сайте с БД код выполняется здесь же, на сайте без БД (Vercel) — в mybook-api через API v1 (`webCrmRead`/`webCrmAct`).
 * Модули с БД — только динамическим импортом одним общим промисом: сайт без БД их не грузит, а одновременные первые
 * вызовы (strict-сверка зовёт local и API разом) получают один экземпляр.
 */
let registryModule: Promise<typeof import("./crm-ops/registry")> | undefined;
let actionsModule: Promise<typeof import("./crm-actions")> | undefined;
const loadRegistry = () => (registryModule ??= import("./crm-ops/registry"));
const loadActions = () => (actionsModule ??= import("./crm-actions"));

export type StaffAccessDto = z.output<typeof WebCrmStaff>;

/** Тяжёлые страницы и действия CRM (аналитика, выгрузки, ИИ) отвечают дольше обычных 5 с. */
const CRM_TIMEOUT_MS = 120_000;

/** Права сотрудника и что мешает войти; local — сборка из модуля Access (access.ts). */
export function crmStaffAccess(local: () => Promise<StaffAccessDto>): Promise<StaffAccessDto> {
  return v1WebRead({
    name: "crm.staff",
    section: "crm",
    local,
    viaApi: (api) => api.webCrmStaff({}),
  });
}

/** Данные страницы CRM (операция чтения; при PARITY_MODE=shadow выполняется дважды — без изменений данных). */
export function crmRead<K extends keyof CrmReads>(op: K, args: OpInput<CrmReads[K]>): Promise<OpOutput<CrmReads[K]>> {
  return v1WebRead({
    name: `crm.${op}`,
    section: "crm",
    timeoutMs: CRM_TIMEOUT_MS,
    local: async () => (await loadRegistry()).runCrmOp(op, args) as Promise<OpOutput<CrmReads[K]>>,
    viaApi: async (api) => decodeWire<OpOutput<CrmReads[K]>>((await api.webCrmRead({ op, body: { args: await encodeWire(args) } })).data),
  });
}

type ActionFn = (...args: never[]) => Promise<unknown>;

/**
 * Server action CRM через API v1: `module.fn` из `src/server/crm-actions` (проверки прав, zod и лимиты — в самом действии).
 * После вызова через API сбрасывается кэш страниц /admin (revalidatePath действия выполнился в mybook-api, где кэша
 * страниц нет), redirect()/notFound() действия повторяются здесь.
 */
export function crmAction<F extends ActionFn>(module: string, fn: string): F {
  const call = async (...args: unknown[]) =>
    v1WebAction({
      section: "crm",
      timeoutMs: CRM_TIMEOUT_MS,
      local: async () => (await loadActions()).runCrmAction(`${module}.${fn}`, args),
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

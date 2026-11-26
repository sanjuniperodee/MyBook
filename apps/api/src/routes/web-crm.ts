/**
 * CRM сайта (/admin) в API v1 (ADR 0012, Раздел 5, section: "crm"): права сотрудника для каркаса, сборщики данных
 * страниц `src/server/crm-ops/*` (права проверяет реестр) и server actions `src/server/crm-actions/*` (права, zod и
 * лимиты проверяет само действие) — тот же код, что выполняет сайт с БД.
 */
import { getCurrentUser } from "@/server/auth";
import { localStaffAccess } from "@/server/access";
import { runCrmAction } from "@/server/crm-actions";
import { runCrmOp } from "@/server/crm-ops/registry";
import { decodeWire, encodeWire } from "@/shared/wire";
import type { Handlers } from "../app";

const digestOf = (err: unknown) => (err && typeof err === "object" && "digest" in err && typeof err.digest === "string" ? err.digest : "");

export const webCrmHandlers: Pick<Handlers, "webCrmStaff" | "webCrmRead" | "webCrmAct"> = {
  async webCrmStaff() {
    const user = await getCurrentUser();
    return user ? localStaffAccess(user) : { staff: null, gate: null };
  },

  webCrmRead: async ({ input }) => ({ data: await encodeWire(await runCrmOp(input.op, decodeWire(input.body.args))) }),

  async webCrmAct({ input }) {
    try {
      return { data: await encodeWire(await runCrmAction(input.op, decodeWire(input.body.args))) };
    } catch (err) {
      // redirect() и notFound() действия (shim next/navigation в mybook-api) сайт повторяет у себя.
      const digest = digestOf(err);
      if (digest.startsWith("NEXT_REDIRECT;")) return { data: null, redirect: digest.split(";")[2] };
      if (digest === "NEXT_HTTP_ERROR_FALLBACK;404" || digest === "NEXT_NOT_FOUND") return { data: null, notFound: true };
      throw err;
    }
  },
};

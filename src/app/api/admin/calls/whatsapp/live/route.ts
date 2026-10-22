import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { canSeeAssigned, contactView } from "@/server/access";
import { WHATSAPP_SILENT_MS } from "@/modules/telephony";
import { container } from "@/server/container";
import { formatPhone } from "@/shared/domain/phone";
import { staffLabel } from "@/shared/domain/staff";

/** Идущие сейчас разговоры WhatsApp для прослушки (право «Слушать записи разговоров» — руководитель). */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "calls.view", "calls.recordings");
  const [rows, admins] = await Promise.all([container().telephony.queries.liveWhatsapp(new Date(), WHATSAPP_SILENT_MS), container().access.queries.allStaff()]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const calls = rows
    .filter((r) => r.staffId !== staff.user.id && canSeeAssigned(staff, r.staffId))
    .map((r) => ({
      id: r.id,
      /** id звонка WhatsApp — для канала прослушки (пускает только пропуск listen-auth). */
      callId: r.externalId,
      direction: r.direction,
      staff: r.staffId ? (names.get(r.staffId) ?? "Сотрудник") : "Сотрудник",
      client: r.clientName || contactView(staff, { phone: formatPhone(r.clientPhone) }).phone || "Скрытый номер",
      clientId: r.clientId,
      dealId: r.dealId,
      since: r.answeredAt!.toISOString(),
    }));
  return NextResponse.json({ calls }, { headers: { "cache-control": "no-store" } });
});

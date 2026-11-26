import { api, apiStaff } from "@/server/api";
import { audit } from "@/server/access";
import { container } from "@/server/container";
import { messagesFor } from "@/i18n/messages";
import { normalizePhone } from "@/shared/domain/phone";
import { toVcard, vcardName } from "@/lib/vcard";

const occasions = messagesFor("ru").common.occasions as Record<string, { label: string }>;

/**
 * Контакты клиентов в vCard для адресной книги телефона магазина (contacts-10, platform-10): права «Выгружать базу» и
 * «Видеть телефоны». ?since=ГГГГ-ММ-ДД — только изменённые с этого дня (повторная выгрузка без дублей). Каждая выгрузка
 * — в журнал. «Только свои» — свои клиенты и без ответственного.
 */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "clients.view", "clients.export", "clients.contacts");
  const sp = new URL(req.url).searchParams;
  const sinceRaw = sp.get("since");
  const since = sinceRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? new Date(`${sinceRaw}T00:00:00+05:00`) : null;
  const rows = await container().reporting.vcardClients({ since, scopeManagerId: staff.scope === "own" ? staff.user.id : null });
  const vcf = toVcard(
    rows.map((r) => {
      const phone = normalizePhone(r.phone);
      return {
        name: vcardName({ name: r.name, dealNumber: r.deal_number, occasion: r.occasion ? (occasions[r.occasion]?.label ?? r.occasion) : null, phone }),
        phones: [...new Set([phone, ...(r.extra_phones ?? []).map(normalizePhone)].filter((p) => p.length >= 10))],
        note: "MyBooks CRM",
      };
    }),
  );
  await audit(staff, "export", "clients_vcard", null, { since: sinceRaw, count: rows.length });
  return new Response(vcf, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="mybooks-clients-${new Date().toISOString().slice(0, 10)}.vcf"`,
      "Cache-Control": "no-store",
    },
  });
});

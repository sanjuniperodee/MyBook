/**
 * «Книги» в приложении CRM — те же данные и напоминание, что у страницы CRM (admin/books).
 */
import { apiStaff } from "@/server/api";
import { can, staffViewer } from "@/server/access";
import { container } from "@/server/container";
import { formatDate, nowMs } from "@/lib/dates";
import { getOccasion, parseDay } from "@/lib/occasions";
import { messagesFor } from "@/i18n/messages";
import { getTheme, getThemes } from "@/lib/content/themes";
import { STALLED_DAYS } from "@/modules/reporting";
import { bookLine, progressRatio, progressText } from "@/lib/content/crm-labels";
import { remindManyAction } from "@/server/crm-actions/admin";
import type { Handlers } from "../../app";

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "writing", label: "Пишутся" },
  { id: "stalled", label: `Заброшены (${STALLED_DAYS}+ дн.)` },
  { id: "ready", label: "Почти готовы" },
  { id: "ordered", label: "Заказаны" },
];

export const crmBookHandlers: Pick<Handlers, "crmBooks" | "crmBooksRemind"> = {
  async crmBooks({ req, input }) {
    const staff = await apiStaff(req, "clients.view");
    const themes = getThemes("ru");
    const ru = messagesFor("ru").common;
    const f = input.f ?? "all";
    const theme = input.theme && themes.some((t) => t.id === input.theme) ? input.theme : undefined;
    const rows = await container().reporting.bookList(f, { q: input.q, theme, staleDays: STALLED_DAYS, now: nowMs(), viewer: staffViewer(staff) });
    return {
      filter: f,
      filters: FILTERS,
      themes: themes.map((t) => ({ id: t.id, label: t.name })),
      rows: rows.map((r) => {
        const idle = Math.floor((nowMs() - r.book.updatedAt.getTime()) / 86_400_000);
        const occ = r.book.occasion ? getOccasion(r.book.occasion) : null;
        const occasion = [occ ? ru.occasions[occ.id].label : null, r.book.occasionDate ? ru.date(parseDay(r.book.occasionDate)) : null].filter(Boolean).join(" · ");
        return {
          bookId: r.book.id,
          title: r.book.title ?? "",
          line: bookLine({ theme: r.book.theme, themeShort: getTheme(r.book.theme).short, authorName: r.book.authorName, recipientName: r.book.recipientName }),
          ownerId: r.owner.id,
          owner: r.owner.name || r.owner.email,
          status: r.book.status,
          progress: progressRatio({ theme: r.book.theme, ...r }),
          progressText: progressText({ theme: r.book.theme, ...r }),
          idleDays: idle,
          stale: r.book.status === "draft" && idle >= STALLED_DAYS,
          photos: r.photos,
          occasion: occasion || null,
          remindedLabel: r.owner.remindedAt ? formatDate(r.owner.remindedAt) : null,
          dealId: r.deal?.id ?? null,
          dealNumber: r.deal?.number ?? null,
        };
      }),
      remindable: [...new Set(rows.filter((r) => r.book.status === "draft" && !r.hasOrder).map((r) => r.owner.id))],
      canRemind: can(staff, "clients.edit"),
      staleDays: STALLED_DAYS,
    };
  },

  async crmBooksRemind({ req, input }) {
    await apiStaff(req, "clients.edit");
    return remindManyAction(input.body.clientIds);
  },
};

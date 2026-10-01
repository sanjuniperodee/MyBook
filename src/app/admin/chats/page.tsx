import Link from "next/link";
import { and, eq, gt, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { ArrowLeft, Handshake, MessagesSquare, UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { crmConversations, crmDeals, crmStages, users } from "@/lib/db/schema";
import { can, canAssignOthers, canSeeAssigned, contactView, ownScope, requireStaff } from "@/lib/crm/rbac";
import { adminLabel, listAdmins, staffOptions } from "@/lib/crm";
import { channelLabel } from "@/lib/crm/chats";
import { channelLabel as acquisitionChannel, toAttribution } from "@/lib/crm/channels";
import { chatVars, listTemplates, loadChatMessages, sendBlocker } from "@/lib/crm/chat-view";
import { chatOffers } from "@/lib/crm/offers";
import { mentionableStaff } from "@/lib/crm/mentions";
import { formatPhone } from "@/lib/crm/phone";
import { getSetting } from "@/lib/crm/settings";
import { aiConfigured } from "@/lib/crm/ai";
import { formatPrice } from "@/config/site";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { cn } from "@/lib/utils";
import { ChatSideControls } from "./ChatControls";

export const metadata = { title: "Чаты" };

const filters = { open: "Открытые", mine: "Мои", unread: "Непрочитанные", waiting: "Ждут ответа", closed: "Закрытые" } as const;
type Filter = keyof typeof filters;

function waitMinutes(d: Date | null) {
  return d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000)) : 0;
}
const shortTime = (d: Date | null) => {
  if (!d) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: process.env.TZ || "Asia/Almaty" }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ c?: string; f?: string; q?: string }> }) {
  const staff = await requireStaff("chats.view");
  const sp = await searchParams;
  const f: Filter = sp.f && sp.f in filters ? (sp.f as Filter) : "open";
  const w: SQL[] = [];
  const scope = ownScope(staff, crmConversations.assigneeId);
  if (scope) w.push(scope);
  if (f === "closed") w.push(eq(crmConversations.status, "closed"));
  else w.push(eq(crmConversations.status, "open"));
  if (f === "mine") w.push(eq(crmConversations.assigneeId, staff.user.id));
  if (f === "unread") w.push(gt(crmConversations.unread, 0));
  if (f === "waiting") w.push(isNotNull(crmConversations.awaitingSince));
  const q = sp.q?.trim();
  if (q) w.push(or(ilike(crmConversations.contactName, `%${q}%`), ilike(crmConversations.chatId, `%${q.replace(/\D/g, "") || q}%`), ilike(crmConversations.lastMessageText, `%${q}%`))!);

  const selectedId = sp.c && /^[0-9a-f-]{36}$/.test(sp.c) ? sp.c : null;
  const [list, admins, slaRaw, selected] = await Promise.all([
    db
      .select()
      .from(crmConversations)
      .where(and(...w))
      .orderBy(sql`${crmConversations.lastMessageAt} desc nulls last`)
      .limit(150),
    listAdmins(),
    getSetting("crm.slaMinutes"),
    selectedId ? db.query.crmConversations.findFirst({ where: eq(crmConversations.id, selectedId) }) : null,
  ]);
  const sla = Number(slaRaw) || 15;
  const names = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const conv = selected && canSeeAssigned(staff, selected.assigneeId) ? selected : null;
  const title = (c: { contactName: string; chatId: string; channel: string; meta: { phone?: string } }) =>
    c.contactName ||
    (c.channel === "email" ? contactView(staff, { email: c.chatId }).email : c.channel === "site" ? (c.meta.phone ? contactView(staff, { phone: formatPhone(c.meta.phone) }).phone : "Посетитель сайта") : contactView(staff, { phone: formatPhone(c.chatId) }).phone || c.chatId);

  let panel: React.ReactNode = (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-muted lg:flex">
      <MessagesSquare className="size-10 text-muted/50" strokeWidth={1.4} />
      <p className="text-sm">{list.length ? "Выберите диалог слева" : "Здесь появятся сообщения из WhatsApp, Instagram, Telegram, чата на сайте и почты"}</p>
      {!list.length && can(staff, "settings.manage") ? (
        <Link href="/admin/settings" className="btn btn-outline btn-sm">
          Подключить Wazzup
        </Link>
      ) : null}
    </div>
  );
  let side: React.ReactNode = null;

  if (conv) {
    const [messages, templates, vars, blocker, dealRow, client, offers, mentionables, ai] = await Promise.all([
      loadChatMessages(conv.id),
      listTemplates(),
      chatVars(conv, adminLabel(staff.user)),
      sendBlocker(conv),
      conv.dealId
        ? db
            .select({ deal: crmDeals, stage: crmStages })
            .from(crmDeals)
            .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
            .where(eq(crmDeals.id, conv.dealId))
            .then((r) => r[0] ?? null)
        : null,
      conv.clientId ? db.query.users.findFirst({ where: eq(users.id, conv.clientId), columns: { id: true, name: true, email: true } }) : null,
      chatOffers(conv, can(staff, "promo.give")),
      mentionableStaff(),
      aiConfigured(),
    ]);
    const options = canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id || a.id === conv.assigneeId);
    panel = (
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-4">
          <Link href={`/admin/chats?f=${f}`} className="text-muted lg:hidden" aria-label="К списку">
            <ArrowLeft className="size-5" />
          </Link>
          <Avatar name={title(conv)} url={conv.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{title(conv)}</div>
            <div className="text-xs text-muted">
              {channelLabel(conv.channel)}
              {conv.contactName && /^\d{10,15}$/.test(conv.chatId) ? ` · ${contactView(staff, { phone: formatPhone(conv.chatId) }).phone}` : ""}
              {conv.channel === "email" && conv.contactName ? ` · ${contactView(staff, { email: conv.chatId }).email}` : ""}
              {conv.channel === "site" && conv.meta.page ? ` · ${conv.meta.page}` : ""}
            </div>
          </div>
        </div>
        <ChatPanel
          key={conv.id}
          className="flex-1"
          conversationId={conv.id}
          messages={messages}
          canSend={can(staff, "chats.send")}
          templates={templates}
          vars={vars}
          sendDisabledReason={blocker}
          offers={can(staff, "chats.send") ? offers : null}
          mentionables={mentionables.filter((m) => m.id !== staff.user.id).map((m) => m.label)}
          ai={ai && can(staff, "chats.send")}
        />
      </div>
    );
    side = (
      <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-line bg-white p-4 xl:block">
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Сделка</h3>
          {dealRow ? (
            <Link href={`/admin/deals/${dealRow.deal.id}`} className="block rounded-xl border border-line p-3 hover:border-wine/40">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Handshake className="size-4 text-wine" /> №{dealRow.deal.number} {dealRow.deal.title}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="rounded-full px-2 py-0.5 text-white" style={{ background: dealRow.stage.color }}>
                  {dealRow.stage.name}
                </span>
                {dealRow.deal.amount ? <span className="tabular-nums">{formatPrice(dealRow.deal.amount)}</span> : null}
              </div>
              <div className="mt-1.5 text-xs text-muted">Канал: {acquisitionChannel(toAttribution(dealRow.deal.utm), dealRow.deal.source)}{dealRow.deal.utm?.campaign ? ` · ${dealRow.deal.utm.campaign}` : ""}</div>
            </Link>
          ) : (
            <p className="text-sm text-muted">Не привязан к сделке.</p>
          )}
        </section>
        {client && can(staff, "clients.view") ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Клиент на сайте</h3>
            <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-2 text-sm hover:text-wine">
              <UserRound className="size-4 text-muted" /> {client.name || contactView(staff, { email: client.email }).email}
            </Link>
          </section>
        ) : null}
        <ChatSideControls
          conversationId={conv.id}
          assigneeId={conv.assigneeId}
          options={options}
          status={conv.status}
          hasDeal={!!conv.dealId}
          canSend={can(staff, "chats.send")}
          canCreateDeal={can(staff, "deals.edit")}
        />
      </aside>
    );
  }

  const chip = (k: Filter) => cn("shrink-0 rounded-full px-2.5 py-1 text-xs", f === k ? "bg-ink text-white" : "bg-cream/70 text-ink-soft hover:bg-cream");
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] overflow-hidden border-line bg-white sm:-mx-6 lg:-my-8">
      <div className={cn("flex w-full shrink-0 flex-col border-r border-line lg:w-80", conv && "hidden lg:flex")}>
        <div className="space-y-2 border-b border-line p-3">
          <form action="/admin/chats">
            <input type="hidden" name="f" value={f} />
            <input name="q" defaultValue={q} placeholder="Поиск по чатам" className="h-9 w-full rounded-xl border border-line bg-[#f7f4ef] px-3 text-sm outline-none focus:border-wine/40" />
          </form>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {(Object.keys(filters) as Filter[]).map((k) => (
              <Link key={k} href={`/admin/chats?f=${k}`} className={chip(k)}>
                {filters[k]}
              </Link>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" data-testid="chat-list">
          {list.length === 0 ? <p className="p-6 text-center text-sm text-muted">Диалогов нет</p> : null}
          {list.map((c) => {
            const wait = waitMinutes(c.awaitingSince);
            const overdue = !!c.awaitingSince && wait >= sla;
            return (
              <Link key={c.id} href={`/admin/chats?f=${f}&c=${c.id}`} className={cn("flex gap-3 px-3 py-3 hover:bg-cream/40", c.id === conv?.id && "bg-rose/40")}>
                <Avatar name={title(c)} url={c.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{title(c)}</span>
                    <span className="shrink-0 text-[11px] text-muted">{shortTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.lastMessageText || "—"}</span>
                    {c.unread ? <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">{c.unread}</span> : null}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                    <span>{channelLabel(c.channel)}</span>
                    {c.assigneeId ? <span>· {names.get(c.assigneeId)}</span> : <span className="text-amber-700">· не назначен</span>}
                    {c.awaitingSince ? <span className={cn("ml-auto", overdue ? "font-semibold text-red-700" : "")}>{wait < 60 ? `${wait} мин` : `${Math.floor(wait / 60)} ч`}</span> : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      {panel}
      {side}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="size-10 shrink-0 rounded-full object-cover" loading="lazy" />;
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white uppercase">{name.replace(/^\+/, "").slice(0, 1)}</span>;
}

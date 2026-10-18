import { container } from "@/server/container";
import Link from "next/link";
import { ArrowLeft, Bot, Camera, Globe, Handshake, Mail, MessageCircle, MessagesSquare, Search, Send, UserRound } from "lucide-react";
import { can, canAssignOthers, canSeeAssigned, canWork, contactView, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { channelLabel } from "@/modules/messaging";
import { channelLabel as acquisitionChannel, toAttribution } from "@/shared/domain/channels";
import { mentionableStaff } from "@/modules/workspace";
import { formatPhone } from "@/shared/domain/phone";
import { storeTimeZone } from "@/shared/domain/time";
import { getSetting } from "@/modules/workspace";
import { formatPrice } from "@/config/site";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { InvoicesBlock } from "@/components/admin/invoices/InvoicesBlock";
import { invoiceViews } from "@/app/admin/invoices/view";
import { cn } from "@/lib/class-names";
import { BotBanner, ChatSideControls } from "./ChatControls";

export const metadata = { title: "Чаты" };

const filters = { open: "Открытые", mine: "Мои", unread: "Непрочитанные", waiting: "Ждут ответа", closed: "Закрытые" } as const;
type Filter = keyof typeof filters;

function waitMinutes(d: Date | null) {
  return d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000)) : 0;
}
const shortTime = (d: Date | null) => {
  if (!d) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: storeTimeZone() }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ c?: string; f?: string; q?: string }> }) {
  const staff = await requireStaff("chats.view");
  const sp = await searchParams;
  const f: Filter = sp.f && sp.f in filters ? (sp.f as Filter) : "open";
  const q = sp.q?.trim();

  const selectedId = sp.c && /^[0-9a-f-]{36}$/.test(sp.c) ? sp.c : null;
  const [list, admins, slaRaw, selected] = await Promise.all([
    container().reporting.inbox({ userId: staff.user.id, seesAll: staff.scope === "all" }, f, q),
    container().access.queries.allStaff(),
    getSetting("crm.slaMinutes"),
    selectedId ? container().messaging.queries.conversation(selectedId) : null,
  ]);
  const sla = Number(slaRaw) || 15;
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const conv = selected && canSeeAssigned(staff, selected.assigneeId) ? selected : null;
  const title = (c: { contactName: string; chatId: string; channel: string; meta: { phone?: string } }) =>
    c.contactName ||
    (c.channel === "email" ? contactView(staff, { email: c.chatId }).email : c.channel === "site" ? (c.meta.phone ? contactView(staff, { phone: formatPhone(c.meta.phone) }).phone : "Посетитель сайта") : contactView(staff, { phone: formatPhone(c.chatId) }).phone || c.chatId);

  let panel: React.ReactNode = (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-[#f4efe7] text-muted lg:flex">
      <span className="flex size-20 items-center justify-center rounded-full bg-white shadow-sm">
        <MessagesSquare className="size-9 text-wine/60" strokeWidth={1.4} />
      </span>
      <p className="max-w-xs text-center text-sm">{list.length ? "Выберите диалог слева, чтобы открыть переписку" : "Здесь появятся сообщения из WhatsApp, Instagram, Telegram, чата на сайте и почты"}</p>
      {!list.length && can(staff, "settings.manage") ? (
        <Link href="/admin/settings?tab=messengers" className="btn btn-outline btn-sm">
          Подключить Wazzup
        </Link>
      ) : null}
    </div>
  );
  let side: React.ReactNode = null;

  if (conv) {
    const chat = container().messaging.view;
    const [messages, templates, vars, blocker, { dealRow, client }, offers, mentionables, ai, invoiceRows, bot] = await Promise.all([
      chat.messages(conv.id),
      chat.templates(),
      chat.vars(conv, staffLabel(staff.user)),
      chat.sendBlocker(conv),
      container().reporting.conversationContext(conv),
      container().marketing.service.chatOffers(conv.clientId, can(staff, "promo.give")),
      mentionableStaff(),
      container().assistant.service.configured(),
      conv.dealId && can(staff, "deals.view") ? container().ordering.invoices.listFor(conv.dealId) : Promise.resolve([]),
      container().messaging.botStatus(conv.id),
    ]);
    const options = canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id || a.id === conv.assigneeId);
    // Ничей диалог менеджер только читает: ответит тот, кому его отдаст круг (или назначит руководитель).
    const mine = canWork(staff, conv.assigneeId);
    const canReply = can(staff, "chats.send") && mine;
    // Счета сделки диалога: действия — тому, кто ведёт и диалог, и сделку (сервер проверяет те же права).
    const dealWork = !dealRow || canWork(staff, dealRow.deal.assigneeId);
    const invoicePerms = {
      edit: can(staff, "deals.edit") && mine && dealWork,
      send: canReply && can(staff, "deals.edit") && dealWork,
      access: mine && dealWork && can(staff, "clients.create"),
      pay: can(staff, "deals.edit") && mine && dealWork && !dealRow?.deal.orderId,
    };
    const invoices = invoiceViews(invoiceRows, { now: new Date(), withLink: invoicePerms.edit });
    panel = (
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
          <Link href={`/admin/chats?f=${f}`} className="-ml-1 rounded-full p-1.5 text-muted hover:bg-cream lg:hidden" aria-label="К списку">
            <ArrowLeft className="size-5" />
          </Link>
          <Avatar name={title(conv)} url={conv.avatarUrl} channel={conv.channel} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{title(conv)}</div>
            <div className="flex items-center gap-1.5 truncate text-xs text-muted">
              <span>{channelLabel(conv.channel)}</span>
              {conv.contactName && /^\d{10,15}$/.test(conv.chatId) ? <span>· {contactView(staff, { phone: formatPhone(conv.chatId) }).phone}</span> : null}
              {conv.channel === "email" && conv.contactName ? <span>· {contactView(staff, { email: conv.chatId }).email}</span> : null}
              {conv.channel === "site" && conv.meta.page ? <span className="truncate">· {conv.meta.page}</span> : null}
            </div>
          </div>
          {dealRow ? (
            <Link href={`/admin/deals/${dealRow.deal.id}`} className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs hover:border-wine/40 hover:text-wine sm:flex xl:hidden">
              <Handshake className="size-4 text-wine" /> №{dealRow.deal.number}
              <span className="rounded-full px-2 py-0.5 text-[10px] text-white" style={{ background: dealRow.stage.color }}>
                {dealRow.stage.name}
              </span>
            </Link>
          ) : null}
          {conv.assigneeId ? <span className="hidden rounded-full bg-cream/80 px-3 py-1.5 text-xs text-ink-soft md:inline xl:hidden">{names.get(conv.assigneeId)}</span> : null}
        </div>
        {!mine ? <p className="border-b border-line bg-amber-50 px-4 py-2 text-xs text-amber-800">Заявку распределяет круг — ответит менеджер, которому она достанется. Назначить вручную может руководитель.</p> : null}
        <BotBanner conversationId={conv.id} status={bot} canControl={canReply} hasDeal={!!conv.dealId} />
        <ChatPanel
          key={conv.id}
          className="flex-1"
          conversationId={conv.id}
          messages={messages}
          canSend={canReply}
          templates={templates}
          vars={vars}
          sendDisabledReason={blocker}
          offers={canReply ? offers : null}
          mentionables={mentionables.filter((m) => m.id !== staff.user.id).map((m) => m.label)}
          ai={ai && canReply}
          invoice={invoicePerms.send ? { dealId: conv.dealId } : null}
          timeZone={storeTimeZone()}
          me={staff.user.id}
        />
      </div>
    );
    side = (
      <aside className="hidden w-80 shrink-0 space-y-5 overflow-y-auto border-l border-line bg-[#fbf9f5] p-4 xl:block">
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Сделка</h3>
          {dealRow ? (
            <Link href={`/admin/deals/${dealRow.deal.id}`} className="block rounded-2xl border border-line bg-white p-3.5 shadow-sm transition hover:border-wine/40 hover:shadow">
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
        {dealRow ? <InvoicesBlock compact dealId={dealRow.deal.id} invoices={invoices} perms={invoicePerms} /> : null}
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
          canSend={canReply}
          canCreateDeal={can(staff, "deals.edit") && mine}
          canStartBot={!bot.label && bot.canStart}
        />
      </aside>
    );
  }

  const chip = (k: Filter) => cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium transition", f === k ? "bg-ink text-white shadow-sm" : "bg-white text-ink-soft ring-1 ring-line hover:bg-cream");
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] overflow-hidden border-line bg-white sm:-mx-6 lg:-my-8">
      <div className={cn("flex w-full shrink-0 flex-col border-r border-line bg-[#fbf9f5] lg:w-[22rem]", conv && "hidden lg:flex")}>
        <div className="space-y-3 border-b border-line px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold">Чаты</h1>
            <span className="text-xs text-muted">{list.length ? `${list.length}${list.length >= 200 ? "+" : ""} ${filters[f].toLowerCase()}` : ""}</span>
          </div>
          <form action="/admin/chats" className="relative">
            <input type="hidden" name="f" value={f} />
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Имя, номер или текст" className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm shadow-sm outline-none focus:border-wine/40 focus:ring-2 focus:ring-wine/10" />
          </form>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {(Object.keys(filters) as Filter[]).map((k) => (
              <Link key={k} href={`/admin/chats?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={chip(k)}>
                {filters[k]}
              </Link>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" data-testid="chat-list">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted">
              <MessagesSquare className="size-8 text-muted/50" strokeWidth={1.4} />
              {q ? "Ничего не нашлось" : "Диалогов нет"}
            </div>
          ) : null}
          {list.map((c) => {
            const wait = waitMinutes(c.awaitingSince);
            const overdue = !!c.awaitingSince && wait >= sla;
            const active = c.id === conv?.id;
            const phase = (c.botState as { phase?: string } | null)?.phase;
            const botOn = phase === "active" || phase === "waiting";
            return (
              <Link
                key={c.id}
                href={`/admin/chats?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}&c=${c.id}`}
                className={cn("relative mb-0.5 flex gap-3 rounded-2xl px-3 py-2.5 transition", active ? "bg-white shadow-sm ring-1 ring-wine/15" : "hover:bg-white/70")}
              >
                {active ? <span className="absolute top-3 bottom-3 left-0 w-1 rounded-full bg-wine" /> : null}
                <Avatar name={title(c)} url={c.avatarUrl} channel={c.channel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread ? "font-semibold text-ink" : "font-medium text-ink-soft")}>{title(c)}</span>
                    <span className={cn("shrink-0 text-[11px] tabular-nums", c.unread ? "font-medium text-emerald-700" : "text-muted")}>{shortTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", c.unread ? "text-ink" : "text-muted")}>{c.lastMessageText || "—"}</span>
                    {c.unread ? <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">{c.unread}</span> : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    {c.assigneeId ? <span className="truncate text-muted">{names.get(c.assigneeId)}</span> : <span className="rounded-full bg-amber-100 px-1.5 py-px text-amber-800">не назначен</span>}
                    {botOn ? (
                      <span className="flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-px text-violet-800">
                        <Bot className="size-3" /> бот
                      </span>
                    ) : null}
                    {c.awaitingSince ? (
                      <span className={cn("ml-auto shrink-0 rounded-full px-1.5 py-px tabular-nums", overdue ? "bg-red-100 font-semibold text-red-700" : "bg-cream text-ink-soft")}>ждёт {wait < 60 ? `${wait} мин` : wait < 1440 ? `${Math.floor(wait / 60)} ч` : `${Math.floor(wait / 1440)} дн`}</span>
                    ) : null}
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

const CHANNEL_BADGE: Record<string, { icon: typeof MessageCircle; cls: string }> = {
  whatsapp: { icon: MessageCircle, cls: "bg-emerald-500" },
  instagram: { icon: Camera, cls: "bg-gradient-to-br from-fuchsia-500 to-orange-400" },
  telegram: { icon: Send, cls: "bg-sky-500" },
  site: { icon: Globe, cls: "bg-wine" },
  email: { icon: Mail, cls: "bg-slate-500" },
};

/** Цвет аватара без фото — по имени, стабильно: собеседников легче различать в списке. */
const AVATAR_TONES = ["bg-[#7a1f2b]", "bg-[#2f6f5e]", "bg-[#3d5a80]", "bg-[#8a5a2b]", "bg-[#6b4c8a]", "bg-[#a0522d]", "bg-[#2e5f7a]"];
const toneOf = (name: string) => AVATAR_TONES[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];

function Avatar({ name, url, channel, size = "md" }: { name: string; url: string | null; channel?: string; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "size-11" : "size-10";
  const badge = channel ? CHANNEL_BADGE[channel] : undefined;
  const letter = name.replace(/^[+\s]+/, "").slice(0, 1) || "?";
  return (
    <span className={cn("relative shrink-0", dim)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={cn("rounded-full object-cover", dim)} loading="lazy" />
      ) : (
        <span className={cn("flex items-center justify-center rounded-full text-[15px] font-semibold text-white uppercase", dim, toneOf(name))}>{letter}</span>
      )}
      {badge ? (
        <span className={cn("absolute -right-0.5 -bottom-0.5 flex size-[18px] items-center justify-center rounded-full text-white ring-2 ring-white", badge.cls)}>
          <badge.icon className="size-2.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  );
}

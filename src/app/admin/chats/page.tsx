import { container } from "@/server/container";
import Link from "next/link";
import { Handshake, MessagesSquare, UserRound } from "lucide-react";
import { can, canAssignOthers, canSeeAssigned, canWork, contactView, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { channelLabel } from "@/modules/messaging";
import { channelLabel as acquisitionChannel, toAttribution } from "@/shared/domain/channels";
import { mentionableStaff } from "@/modules/workspace";
import { formatPhone } from "@/shared/domain/phone";
import { storeTimeZone } from "@/shared/domain/time";
import { parseWorkHours } from "@/shared/domain/schedule";
import { getSetting } from "@/modules/workspace";
import { responseWait, slaMinutes } from "@/modules/reporting/ui/response-wait";
import { formatPrice } from "@/config/site";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { ChatsLive } from "@/components/admin/chat/ChatsLive";
import { DetailsPanel } from "@/components/admin/chat/DetailsPanel";
import { InvoicesBlock } from "@/components/admin/invoices/InvoicesBlock";
import { invoiceViews } from "@/app/admin/invoices/view";
import { BotBanner, ChatSideControls } from "./ChatControls";
import { PhoneHolder } from "./PhoneHolder";
import { CHAT_FILTERS, ChatAvatar, ChatHeader, ChatListPane, SideSection, type ChatFilter, type ChatListItem } from "@/components/admin/chat/Inbox";

export const metadata = { title: "Чаты" };

const filters = CHAT_FILTERS;
type Filter = ChatFilter;

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
  const [list, admins, slaRaw, hoursRaw, selected, phoneHolder] = await Promise.all([
    container().reporting.inbox({ userId: staff.user.id, seesAll: staff.scope === "all" }, f, q),
    container().access.queries.allStaff(),
    getSetting("crm.slaMinutes"),
    getSetting("crm.workHours"),
    selectedId ? container().messaging.queries.conversation(selectedId) : null,
    container().messaging.phoneHolder(),
  ]);
  // Ожидание и норматив — в рабочих минутах, как в «Моём дне» и в правиле «нет ответа».
  const sla = slaMinutes(slaRaw);
  const hours = parseWorkHours(hoursRaw);
  const now = new Date();
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const conv = selected && canSeeAssigned(staff, selected.assigneeId) ? selected : null;
  const title = (c: { contactName: string; chatId: string; channel: string; meta: { phone?: string } }) =>
    c.contactName ||
    (c.channel === "email" ? contactView(staff, { email: c.chatId }).email : c.channel === "site" ? (c.meta.phone ? contactView(staff, { phone: formatPhone(c.meta.phone) }).phone : "Посетитель сайта") : contactView(staff, { phone: formatPhone(c.chatId) }).phone || c.chatId);

  let panel: React.ReactNode = (
    <div className="hidden flex-1 flex-col items-center justify-center gap-4 bg-[#f5f1eb] text-muted lg:flex">
      <span className="flex size-24 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-line">
        <MessagesSquare className="size-10 text-wine/70" strokeWidth={1.3} />
      </span>
      <div className="text-center">
        <p className="text-[15px] font-medium text-ink">{list.length ? "Выберите чат" : "Сообщений пока нет"}</p>
        <p className="mt-1 max-w-xs text-sm">{list.length ? "Слева — все переписки из WhatsApp, Instagram, Telegram, сайта и почты" : "Здесь появятся сообщения из WhatsApp, Instagram, Telegram, чата на сайте и почты"}</p>
      </div>
      {!list.length && can(staff, "settings.manage") ? (
        <Link href="/admin/settings?tab=messengers" className="btn btn-outline btn-sm">
          Подключить мессенджеры
        </Link>
      ) : null}
    </div>
  );
  let side: React.ReactNode = null;

  if (conv) {
    const chat = container().messaging.view;
    const [messages, templates, vars, blocker, { dealRow, client }, offers, mentionables, ai, invoiceRows, bot, kaspiWarning] = await Promise.all([
      chat.messages(conv.id),
      chat.templates(),
      chat.vars(conv, staffLabel(staff.user)),
      chat.sendBlocker(conv),
      container().reporting.conversationContext(conv),
      container().marketing.service.chatOffers(conv.clientId, can(staff, "promo.give")),
      mentionableStaff(),
      // Подсказка ответа: AI-помощник или (для диалогов со сделкой) модель продажника.
      Promise.all([container().assistant.service.configured(), container().assistant.seller.configured().catch(() => false)]).then(([a, s]) => a || s),
      conv.dealId && can(staff, "deals.view") ? container().ordering.invoices.listFor(conv.dealId) : Promise.resolve([]),
      container().messaging.botStatus(conv.id),
      // Кассир Kaspi отключён — плашка над полем ввода (без запроса к Kaspi: сохранённое состояние проверки).
      container().ordering.kaspiWatch.warning().catch(() => null),
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
        <ChatHeader
          title={title(conv)}
          avatarUrl={conv.avatarUrl}
          channel={conv.channel}
          subtitle={[
            channelLabel(conv.channel),
            conv.contactName && /^\d{10,15}$/.test(conv.chatId) ? contactView(staff, { phone: formatPhone(conv.chatId) }).phone : "",
            conv.channel === "email" && conv.contactName ? contactView(staff, { email: conv.chatId }).email : "",
            conv.channel === "site" && conv.meta.page ? conv.meta.page : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          backHref={`/admin/chats?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          deal={dealRow ? { href: `/admin/deals/${dealRow.deal.id}`, number: dealRow.deal.number, stage: dealRow.stage.name, color: dealRow.stage.color } : null}
          assignee={conv.assigneeId ? (names.get(conv.assigneeId) ?? null) : null}
        />
        {!mine ? <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">Заявку распределяет круг — ответит менеджер, которому она достанется. Назначить вручную может руководитель.</p> : null}
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
          paymentWarning={invoicePerms.send ? kaspiWarning : null}
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
      <DetailsPanel>
        <div className="flex flex-col items-center rounded-2xl bg-white px-4 py-5 text-center ring-1 ring-line">
          <ChatAvatar name={title(conv)} url={conv.avatarUrl} channel={conv.channel} size={72} />
          <div className="mt-3 text-base font-semibold">{title(conv)}</div>
          <div className="mt-0.5 text-xs text-muted">
            {channelLabel(conv.channel)}
            {/^\d{10,15}$/.test(conv.chatId) ? ` · ${contactView(staff, { phone: formatPhone(conv.chatId) }).phone}` : ""}
          </div>
          {client && can(staff, "clients.view") ? (
            <Link href={`/admin/clients/${client.id}`} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f3efe9] px-3 py-1.5 text-xs font-medium hover:bg-cream">
              <UserRound className="size-3.5" /> Карточка клиента
            </Link>
          ) : null}
        </div>
        <SideSection title="Сделка">
          {dealRow ? (
            <Link href={`/admin/deals/${dealRow.deal.id}`} className="block rounded-2xl bg-white p-3.5 ring-1 ring-line transition hover:ring-wine/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Handshake className="size-4 shrink-0 text-wine" />
                <span className="truncate">
                  №{dealRow.deal.number} {dealRow.deal.title}
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="rounded-full px-2.5 py-0.5 font-medium text-white" style={{ background: dealRow.stage.color }}>
                  {dealRow.stage.name}
                </span>
                {dealRow.deal.amount ? <span className="font-semibold tabular-nums">{formatPrice(dealRow.deal.amount)}</span> : null}
              </div>
              <div className="mt-2 text-xs text-muted">
                {acquisitionChannel(toAttribution(dealRow.deal.utm), dealRow.deal.source)}
                {dealRow.deal.utm?.campaign ? ` · ${dealRow.deal.utm.campaign}` : ""}
              </div>
            </Link>
          ) : (
            <p className="rounded-2xl bg-white p-3.5 text-sm text-muted ring-1 ring-line">Чат не привязан к сделке</p>
          )}
        </SideSection>
        {dealRow && invoices.length ? (
          <SideSection title="Счета">
            <div className="rounded-2xl bg-white p-3 ring-1 ring-line">
              <InvoicesBlock compact dealId={dealRow.deal.id} invoices={invoices} perms={invoicePerms} />
            </div>
          </SideSection>
        ) : null}
        <SideSection title="Управление">
          <div className="rounded-2xl bg-white p-3.5 ring-1 ring-line">
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
          </div>
        </SideSection>
      </DetailsPanel>
    );
  }

  const items: ChatListItem[] = list.map((c) => {
    const wait = c.awaitingSince ? responseWait(c.awaitingSince, now, hours, sla) : null;
    const phase = (c.botState as { phase?: string } | null)?.phase;
    return {
      id: c.id,
      title: title(c),
      avatarUrl: c.avatarUrl,
      channel: c.channel,
      time: shortTime(c.lastMessageAt),
      preview: c.lastMessageText,
      unread: c.unread,
      assignee: c.assigneeId ? (names.get(c.assigneeId) ?? null) : null,
      waitMinutes: wait?.minutes ?? null,
      overdue: !!wait?.overdue,
      bot: phase === "active" || phase === "waiting",
    };
  });
  const href = (p: { f?: Filter; c?: string }) => `/admin/chats?f=${p.f ?? f}${q ? `&q=${encodeURIComponent(q)}` : ""}${p.c ? `&c=${p.c}` : ""}`;
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] overflow-hidden bg-white sm:-mx-6 lg:-my-8">
      <ChatsLive />
      <ChatListPane
        items={items}
        filter={f}
        q={q ?? ""}
        selectedId={conv?.id ?? null}
        hidden={!!conv}
        href={href}
        toolbar={can(staff, "chats.send") ? <PhoneHolder holder={phoneHolder} me={staff.user.id} staff={staffOptions(admins)} canPickAnyone={canAssignOthers(staff)} /> : null}
        emptyCta={
          !list.length && !q && can(staff, "settings.manage") ? (
            <Link href="/admin/settings?tab=messengers" className="btn btn-outline btn-sm">
              Подключить мессенджеры
            </Link>
          ) : null
        }
      />
      {panel}
      {side}
    </div>
  );
}

import { container } from "@/server/container";
import Link from "next/link";
import { Info, MessagesSquare, UserRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
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
import { ChatNavProvider, ChatSlot } from "@/components/admin/chat/ChatNav";
import { ChatsLive } from "@/components/admin/chat/ChatsLive";
import { DetailsPanel } from "@/components/admin/chat/DetailsPanel";
import { InvoicesBlock } from "@/components/admin/invoices/InvoicesBlock";
import { invoiceViews } from "@/app/admin/invoices/view";
import { BotBanner, ChatSideControls } from "./ChatControls";
import { PhoneHolder } from "./PhoneHolder";
import { WhatsappCallButton } from "@/components/admin/WhatsappCall";
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
    <div className="hidden min-w-0 flex-1 items-center justify-center bg-canvas lg:flex">
      <EmptyState
        icon={MessagesSquare}
        title={list.length ? "Выберите диалог слева" : "Сообщений пока нет"}
        action={
          !list.length && can(staff, "settings.manage") ? (
            <Link href="/admin/settings?tab=messengers" className="btn btn-outline btn-sm">
              Подключить мессенджеры
            </Link>
          ) : null
        }
      >
        {list.length ? "Сначала — те, кто ждёт ответа дольше норматива: они отмечены красным." : "Здесь появятся сообщения из WhatsApp, Instagram, Telegram, чата на сайте и почты."}
      </EmptyState>
    </div>
  );
  let side: React.ReactNode = null;

  if (conv) {
    const chat = container().messaging.view;
    const [messages, templates, vars, blocker, { dealRow, client }, offers, mentionables, ai, invoiceRows, bot, kaspiWarning] = await Promise.all([
      chat.messages(conv.id),
      chat.templates(staff.user.id),
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
    // Вопросы клиента помощнику в кабинете — рядом с его WhatsApp (в самой беседе помощника — не нужно).
    const help = conv.clientId && !conv.meta.help ? await container().messaging.helpQuestionsOf(conv.clientId).catch(() => null) : null;
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
            conv.meta.help ? "Помощник в кабинете" : "",
            conv.channel === "site" && conv.meta.page ? conv.meta.page : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          backHref={`/admin/chats?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          deal={dealRow ? { href: `/admin/deals/${dealRow.deal.id}`, number: dealRow.deal.number, stage: dealRow.stage.name, color: dealRow.stage.color } : null}
          assignee={conv.assigneeId ? (names.get(conv.assigneeId) ?? null) : null}
          call={can(staff, "calls.make") && conv.channel === "whatsapp" && /^\d{10,15}$/.test(conv.chatId) ? <WhatsappCallButton iconOnly target={{ conversationId: conv.id }} title={title(conv)} /> : null}
        />
        {!mine ? (
          <p className="flex items-start gap-2 border-b border-line bg-warning-bg px-4 py-2 text-xs text-warning lg:px-5">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            Заявку распределяет круг — ответит менеджер, которому она достанется. Назначить вручную может руководитель.
          </p>
        ) : null}
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
    const phone = /^\d{10,15}$/.test(conv.chatId) ? contactView(staff, { phone: formatPhone(conv.chatId) }).phone : "";
    side = (
      <DetailsPanel>
        <section className="flex flex-col items-center border-b border-line px-5 pt-6 pb-5 text-center">
          <ChatAvatar name={title(conv)} url={conv.avatarUrl} channel={conv.channel} size={56} />
          <h2 className="mt-3 max-w-full truncate text-base font-semibold">{title(conv)}</h2>
          <p className="mt-0.5 text-xs text-muted tabular-nums">{channelLabel(conv.channel)}</p>
          {phone ? <p className="text-xs text-muted tabular-nums">{phone}</p> : null}
          {client && can(staff, "clients.view") ? (
            <Link href={`/admin/clients/${client.id}`} className="btn btn-outline btn-sm mt-3">
              <UserRound className="size-4" aria-hidden /> Карточка клиента
            </Link>
          ) : null}
        </section>
        <SideSection
          title="Сделка"
          action={
            dealRow ? (
              <Link href={`/admin/deals/${dealRow.deal.id}`} className="text-xs font-medium text-wine hover:underline">
                Открыть
              </Link>
            ) : null
          }
        >
          {dealRow ? (
            <Link href={`/admin/deals/${dealRow.deal.id}`} className="-mx-2 block rounded-[10px] px-2 py-1.5 transition-colors hover:bg-sunken/70">
              <span className="block text-sm font-medium">
                <span className="tabular-nums">№{dealRow.deal.number}</span> {dealRow.deal.title}
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-ink-soft">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: dealRow.stage.color }} aria-hidden />
                  <span className="truncate">{dealRow.stage.name}</span>
                </span>
                {dealRow.deal.amount ? <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPrice(dealRow.deal.amount)}</span> : null}
              </span>
              <span className="mt-1 block truncate text-xs text-muted">
                {acquisitionChannel(toAttribution(dealRow.deal.utm), dealRow.deal.source)}
                {dealRow.deal.utm?.campaign ? `, ${dealRow.deal.utm.campaign}` : ""}
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted">Диалог не привязан к сделке.</p>
          )}
        </SideSection>
        <SideSection title="Работа с диалогом">
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
        </SideSection>
        {dealRow && invoices.length ? (
          <SideSection title="Счета">
            <InvoicesBlock compact dealId={dealRow.deal.id} invoices={invoices} perms={invoicePerms} />
          </SideSection>
        ) : null}
        {help?.questions.length ? (
          <SideSection title="Вопросы в кабинете" action={help.waiting ? <Badge tone="warning">ждёт ответа</Badge> : null}>
            <ul className="space-y-2 text-sm">
              {help.questions.map((qn) => (
                <li key={qn.id}>
                  <span className="block text-xs text-muted tabular-nums">{shortTime(qn.at)}</span>
                  <span className="line-clamp-2">{qn.text.replace(/^📍[^\n]*\n?/, "") || qn.text}</span>
                </li>
              ))}
            </ul>
            {help.handoffs30d ? <p className="mt-2 text-xs text-muted">Помощник передавал менеджеру за 30 дней: {help.handoffs30d}</p> : null}
            <Link href={`/admin/chats?c=${help.conversationId}`} className="btn btn-outline btn-sm mt-3 w-full">
              Открыть переписку с помощником
            </Link>
          </SideSection>
        ) : null}
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
      waitLabel: wait?.label ?? null,
      overdue: !!wait?.overdue,
      bot: phase === "active" || phase === "waiting",
      pinned: !!c.pinnedAt,
    };
  });
  const href = (p: { f?: Filter; c?: string }) => `/admin/chats?f=${p.f ?? f}${q ? `&q=${encodeURIComponent(q)}` : ""}${p.c ? `&c=${p.c}` : ""}`;
  return (
    <ChatNavProvider className="crm-chat-root -mx-4 -my-5 flex overflow-hidden bg-white sm:-mx-6 lg:-my-7 lg:h-[calc(100dvh-3.5rem)] 2xl:-mx-8" data-chat-root>
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
      <ChatSlot currentId={conv?.id ?? null}>
        {panel}
        {side}
      </ChatSlot>
    </ChatNavProvider>
  );
}

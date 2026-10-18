import { ChatPanel } from "@/components/admin/ChatPanel";
import { DetailsPanel } from "@/components/admin/chat/DetailsPanel";
import { ChatAvatar, ChatHeader, ChatListPane, SideSection, type ChatListItem } from "@/components/admin/chat/Inbox";
import type { Msg } from "@/components/admin/chat/MessageBubble";
import { PhoneHolder } from "@/app/admin/chats/PhoneHolder";

/**
 * Превью дизайна «Чатов» на придуманных данных (страница /dev/chats — только в разработке): страница CRM требует
 * базы и входа, а дизайн проверяется снимком (scripts/chat-preview.mjs).
 */
export function ChatPreview({ empty }: { empty: boolean }) {
  const sp = { empty };
  const t = (h: number, m: number) => new Date(Date.UTC(2026, 9, 18, h - 5, m)).toISOString();
  const items: ChatListItem[] = [
    { id: "a", title: "Айдана", avatarUrl: null, channel: "whatsapp", time: "08:29", preview: "Рахмет көрдім бағасы қымбат", unread: 2, assignee: "Марат", waitMinutes: 34, overdue: true, bot: false },
    { id: "b", title: "Алишер", avatarUrl: null, channel: "whatsapp", time: "07:36", preview: "Конечно, подскажу 🙂 Печатная книга — от 29 000 ₸", unread: 0, assignee: "Марат", waitMinutes: null, overdue: false, bot: true },
    { id: "c", title: "Гульдана", avatarUrl: null, channel: "instagram", time: "вчера", preview: "📷 Фото", unread: 0, assignee: null, waitMinutes: 6, overdue: false, bot: false },
    { id: "d", title: "+7 705 ••• •• 57", avatarUrl: null, channel: "telegram", time: "16 окт.", preview: "Спасибо большое!", unread: 0, assignee: "Айгерим С.", waitMinutes: null, overdue: false, bot: false },
    { id: "e", title: "Посетитель сайта", avatarUrl: null, channel: "site", time: "15 окт.", preview: "А доставка в Астану есть?", unread: 1, assignee: null, waitMinutes: 120, overdue: true, bot: false },
  ];
  const m = (p: Partial<Msg> & { id: string; at: string }): Msg => ({ direction: "in", type: "text", text: "", mediaUrl: null, status: "received", error: null, author: null, ...p });
  const messages: Msg[] = sp.empty
    ? []
    : [
        m({ id: "1", at: t(14, 30), text: "Сәлеметсіз бе" }),
        m({ id: "2", at: t(14, 34), direction: "out", author: "Марат", authorId: "me", status: "read", text: "Сәлеметсіз бе! 😊 Қалыңыз қалай?" }),
        m({ id: "3", at: t(14, 45), text: "Шүкір жақсы" }),
        m({ id: "4", at: t(14, 48), text: "Инстаграмнан көріп жазып тұрмын. Кітап жазама ол қалай болады? Бағасы қанша" }),
        m({ id: "5", at: t(14, 52), direction: "out", author: "Марат", authorId: "me", status: "read", type: "image", mediaUrl: "/logo.png", text: "" }),
        m({ id: "6", at: t(14, 52), direction: "out", author: "Марат", authorId: "me", status: "read", text: "Подарок будет очень эмоциональным, более 80% клиентов просто плачут от увиденного 😊" }),
        m({ id: "7", at: t(14, 53), direction: "out", author: "Марат", authorId: "me", status: "delivered", text: "Цена книги — 40 000 тг, но сегодня за 20 000 тг. В стоимость входит всё — редактура, вёрстка, печать и упаковка. Подробнее: https://mybooks.kz/kniga" }),
        m({ id: "8", at: t(16, 57), text: "Рахмет көрдім бағасы қымбат", replyTo: { id: "7", text: "Цена книги — 40 000 тг, но сегодня за 20 000 тг.", type: "text", direction: "out", author: "Марат" } }),
        m({ id: "9", at: t(16, 57), type: "audio", mediaUrl: "/none.ogg", text: "", transcript: "Оған ақшам жоқ, кейін жазамын" }),
        m({ id: "10", at: t(16, 58), direction: "out", internal: true, author: "бот", status: "sent", text: "🤖 Клиент сомневается после предложения · писал(а) по-казахски\nДля кого: —\nПовод: —\nЗаметка бота: Айдана из Instagram интересовалась книгой; после цен сказала, что дорого." }),
        m({ id: "11", at: t(16, 59), direction: "out", author: "бот", status: "read", text: "Түсінемін 🙂 Кітапты предоплатамен бастауға болады, қалғанын — кітап дайын болғанда. Сізге қай нұсқа ыңғайлы?" }),
        m({ id: "12", at: t(17, 2), direction: "out", internal: true, author: "Марат", status: "sent", text: "Позвоню ей завтра утром @Айгерим" }),
        m({ id: "13", at: t(17, 3), direction: "out", author: "Марат", authorId: "me", status: "sent", text: "Удалённое", deleted: true }),
        m({ id: "14", at: t(17, 4), direction: "out", author: "Марат", authorId: "me", status: "error", error: "Шлюз WhatsApp недоступен", text: "Добрый вечер!" }),
        m({ id: "15", at: t(17, 5), text: "Хорошо, напишу", forwarded: true }),
      ];
  return (
    <div className="flex h-dvh bg-[#f7f4ef]">
      <div className="hidden w-60 shrink-0 border-r border-line bg-white lg:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="h-14 shrink-0 border-b border-line bg-white/85" />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] overflow-hidden bg-white sm:-mx-6 lg:-my-8">
            <ChatListPane
              items={items}
              filter="open"
              q=""
              selectedId="a"
              hidden={false}
              href={({ c }) => `/dev/chats${c ? `?c=${c}` : ""}`}
              toolbar={<PhoneHolder holder={{ id: "me", name: "Марат" }} me="me" staff={[{ id: "me", label: "Марат" }, { id: "s", label: "Салауат" }]} canPickAnyone />}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatHeader title="Айдана" avatarUrl={null} channel="whatsapp" subtitle="WhatsApp · +7 701 ••• •• 89" backHref="/dev/chats" deal={{ href: "#", number: 42, stage: "Новая заявка", color: "#7a1f2b" }} assignee="Марат" />
              <ChatPanel
                className="flex-1"
                conversationId="00000000-0000-0000-0000-000000000000"
                messages={messages}
                canSend
                templates={[{ id: "t", title: "Приветствие", text: "Здравствуйте, {имя}!" }]}
                vars={{ name: "Айдана", order: null, link: "", manager: "Марат" }}
                ai
                invoice={{ dealId: null }}
                timeZone="Asia/Almaty"
                me="me"
              />
            </div>
            <DetailsPanel>
              <div className="flex flex-col items-center rounded-2xl bg-white px-4 py-5 text-center ring-1 ring-line">
                <ChatAvatar name="Айдана" url={null} channel="whatsapp" size={72} />
                <div className="mt-3 text-base font-semibold">Айдана</div>
                <div className="mt-0.5 text-xs text-muted">WhatsApp · +7 701 ••• •• 89</div>
              </div>
              <SideSection title="Сделка">
                <div className="rounded-2xl bg-white p-3.5 text-sm ring-1 ring-line">№42 Книга мужу</div>
              </SideSection>
            </DetailsPanel>
          </div>
        </main>
      </div>
    </div>
  );
}

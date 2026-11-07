import { ChatAvatar } from "./ChatAvatar";
import { ChatRows } from "./ChatRows";
export { ChatAvatar } from "./ChatAvatar";
import Link from "next/link";
import { ArrowLeft, MessagesSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/class-names";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailsToggle } from "./DetailsPanel";
import { ChatListHeader } from "./ListHeader";
import { textOn } from "@/lib/readable-text";

/**
 * Каркас «Чатов» без данных: список диалогов, шапка переписки, аватар, разделы боковой колонки. Страница
 * (src/app/admin/chats/page.tsx) отдаёт сюда готовые подписи — так же их показывает превью дизайна (src/app/dev/chats).
 *
 * Раскладка (DESIGN.md §7.5): ноутбук — три колонки «входящие | переписка | детали» (детали — с 1280 px, уже — шторкой
 * по кнопке в шапке); телефон — список на весь экран, открытый диалог — на весь экран без шапки и панели CRM.
 */

export { CHAT_FILTERS, type ChatFilter, type ChatListItem } from "./inbox-model";
import { CHAT_FILTERS, type ChatFilter, type ChatListItem } from "./inbox-model";

/**
 * Цвет текста на плашке этапа: этап красят в «Воронке» любым цветом, и белый на светло-жёлтом не читался. Тёмный или
 * белый — что контрастнее (WCAG, lib/readable-text); не цвет — белый, как раньше. Цвет — инлайном, тёмная тема его не переворачивает.
 */
export function readableOn(color: string) {
  return textOn(color) === "#000000" ? "#17130f" : "#fff";
}



/**
 * Колонка «Входящие»: заголовок с поиском, фильтры лентой чипов, диалоги. Строка диалога — три уровня: кто и когда;
 * последнее сообщение и непрочитанные; что требует действия (ждёт ответа, бот ведёт, без ответственного) и кто ведёт.
 */
export function ChatListPane({
  items,
  filter,
  q,
  selectedId,
  hidden,
  href,
  emptyCta,
  toolbar,
}: {
  items: ChatListItem[];
  filter: ChatFilter;
  q: string;
  selectedId: string | null;
  hidden: boolean;
  href: (p: { f?: ChatFilter; c?: string }) => string;
  emptyCta?: React.ReactNode;
  /** Раскрывается иконкой в шапке: например, «Телефон WhatsApp у …». */
  toolbar?: React.ReactNode;
}) {
  return (
    <div className={cn("flex w-full shrink-0 flex-col border-r border-line bg-white lg:w-[340px] xl:w-[320px] 2xl:w-[360px]", hidden && "hidden lg:flex")}>
      <ChatListHeader count={items.length} filter={filter} q={q} toolbar={toolbar} />
      <nav className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-4 pt-1 pb-3" aria-label="Фильтр чатов">
        {(Object.keys(CHAT_FILTERS) as ChatFilter[]).map((k) => (
          <Link key={k} href={href({ f: k })} aria-current={filter === k ? "page" : undefined} className={cn("chip shrink-0 max-lg:h-10", filter === k && "chip-on")}>
            {CHAT_FILTERS[k]}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:py-1" data-testid="chat-list">
        {items.length === 0 ? (
          <EmptyState compact icon={MessagesSquare} title={q ? "По запросу ничего не нашлось" : filter === "open" ? "Открытых диалогов нет" : "В этом списке пусто"} action={emptyCta}>
            {q ? "Проверьте написание или поищите по номеру телефона." : filter === "open" ? "Новые сообщения из WhatsApp, Instagram, Telegram, сайта и почты появятся здесь." : "Попробуйте другой фильтр."}
          </EmptyState>
        ) : null}
        <ChatRows initial={items} selectedId={selectedId} filter={filter} q={q} />
      </div>
    </div>
  );
}

/**
 * Шапка открытой переписки: на телефоне — «назад», кто и где; сделка и ответственный видны здесь, пока боковой колонки
 * нет на экране (до 1280 px), с ней — только в колонке. Справа — звонок и кнопка деталей.
 */
export function ChatHeader({
  title,
  avatarUrl,
  channel,
  subtitle,
  backHref,
  deal,
  assignee,
  call = null,
}: {
  title: string;
  avatarUrl: string | null;
  channel: string;
  subtitle: string;
  backHref: string;
  deal: { href: string; number: number; stage: string; color: string } | null;
  assignee: string | null;
  /** Кнопка звонка клиенту (WhatsApp), если звонки включены и у сотрудника есть право. */
  call?: React.ReactNode;
}) {
  return (
    <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-line bg-white pt-[env(safe-area-inset-top)] pr-2 pl-1 sm:pr-3 sm:pl-2 lg:h-16 lg:px-5 lg:pt-0">
      <Link href={backHref} className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-soft hover:bg-sunken hover:text-ink lg:hidden" aria-label="К списку чатов">
        <ArrowLeft className="size-5" strokeWidth={1.8} />
      </Link>
      <ChatAvatar name={title} url={avatarUrl} channel={channel} size={40} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] leading-5 font-semibold">{title}</h2>
        <p className="truncate text-xs leading-4 text-muted">{subtitle}</p>
      </div>
      {assignee ? (
        <span className="hidden max-w-40 items-center gap-1.5 truncate text-xs text-muted md:flex lg:hidden" title="Ответственный">
          <UserRound className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{assignee}</span>
        </span>
      ) : null}
      {deal ? (
        <Link href={deal.href} className="hidden h-8 shrink-0 items-center gap-2 rounded-lg border border-line px-2.5 text-xs font-medium whitespace-nowrap transition-colors hover:border-line-strong hover:bg-sunken sm:flex xl:hidden" title="Открыть сделку">
          <span className="tabular-nums">Сделка №{deal.number}</span>
          <span className="flex items-center gap-1.5 font-normal text-ink-soft">
            <span className="size-2 rounded-full" style={{ background: deal.color }} aria-hidden />
            {deal.stage}
          </span>
        </Link>
      ) : null}
      {call}
      <DetailsToggle />
    </header>
  );
}

/** Раздел боковой колонки: подпись строчными (DESIGN.md §2) и содержимое; разделы разделены линией, без карточек. */
export function SideSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
      <div className="mb-2.5 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

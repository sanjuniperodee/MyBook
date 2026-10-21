import { ChatListLink } from "./ChatNav";
import Link from "next/link";
import { ArrowLeft, Bot, Camera, Globe, Handshake, Mail, MessageCircle, MessagesSquare, Search, Send } from "lucide-react";
import { cn } from "@/lib/class-names";
import { waitLabel, waitTone } from "@/modules/reporting/ui/response-wait";
import { DetailsToggle } from "./DetailsPanel";

/**
 * Каркас «Чатов» без данных: список диалогов, шапка переписки, аватар. Страница (src/app/admin/chats/page.tsx) отдаёт
 * сюда готовые подписи — так же их показывает превью дизайна (src/app/dev/chats, только в разработке).
 */

export const CHAT_FILTERS = { open: "Открытые", mine: "Мои", unread: "Непрочитанные", waiting: "Ждут ответа", closed: "Закрытые" } as const;
export type ChatFilter = keyof typeof CHAT_FILTERS;

const CHANNEL_BADGE: Record<string, { icon: typeof MessageCircle; cls: string; label: string }> = {
  whatsapp: { icon: MessageCircle, cls: "bg-[#25d366]", label: "WhatsApp" },
  instagram: { icon: Camera, cls: "bg-gradient-to-tr from-[#f9a03f] via-[#e1306c] to-[#833ab4]", label: "Instagram" },
  telegram: { icon: Send, cls: "bg-[#2aabee]", label: "Telegram" },
  site: { icon: Globe, cls: "bg-wine", label: "Сайт" },
  email: { icon: Mail, cls: "bg-slate-500", label: "Почта" },
};

/** Цвет аватара без фото — по имени, стабильно: собеседников легче различать в списке. */
const TONES = ["bg-[#c2410c]", "bg-[#0f766e]", "bg-[#4338ca]", "bg-[#a16207]", "bg-[#7e22ce]", "bg-[#be123c]", "bg-[#0369a1]", "bg-[#4d7c0f]"];
const toneOf = (name: string) => TONES[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];

export function ChatAvatar({ name, url, channel, size = 48 }: { name: string; url: string | null; channel?: string; size?: 40 | 48 | 72 }) {
  const dim = size === 72 ? "size-[72px] text-2xl" : size === 48 ? "size-12 text-base" : "size-10 text-sm";
  const badge = channel ? CHANNEL_BADGE[channel] : undefined;
  const letter = name.replace(/^[+\s\d()-]+/, "").slice(0, 1) || name.slice(0, 1) || "?";
  return (
    <span className={cn("relative inline-block shrink-0", dim)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={cn("rounded-full object-cover", dim)} loading="lazy" />
      ) : (
        <span className={cn("flex items-center justify-center rounded-full font-semibold text-white uppercase", dim, toneOf(name))}>{letter}</span>
      )}
      {badge ? (
        <span className={cn("absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full text-white ring-[2.5px] ring-white", size === 72 ? "size-6" : "size-[18px]", badge.cls)} title={badge.label}>
          <badge.icon className={size === 72 ? "size-3.5" : "size-2.5"} strokeWidth={2.6} />
        </span>
      ) : null}
    </span>
  );
}

export interface ChatListItem {
  id: string;
  title: string;
  avatarUrl: string | null;
  channel: string;
  time: string;
  preview: string;
  unread: number;
  /** Кто ведёт; null — не назначен. */
  assignee: string | null;
  /** Ждёт ответа столько рабочих минут (responseWait); null — не ждёт. */
  waitMinutes: number | null;
  /** Подпись ожидания (responseWait: «1 ч 5 мин», «2 раб. дн») — та же, что в «Моём дне»; нет — из waitMinutes. */
  waitLabel?: string | null;
  /** Норматив ответа вышел. */
  overdue: boolean;
  bot: boolean;
  /** Закреплён у текущего сотрудника — стоит вверху списка. */
  pinned: boolean;
}

/** Колонка списка: заголовок, поиск, вкладки фильтров, диалоги. */
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
  /** Под поиском: например, «Телефон WhatsApp у …». */
  toolbar?: React.ReactNode;
}) {
  return (
    <div className={cn("flex w-full shrink-0 flex-col border-r border-line bg-white lg:w-[360px]", hidden && "hidden lg:flex")}>
      <div className="px-4 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Чаты</h1>
          {items.length ? <span className="rounded-full bg-[#f3efe9] px-2.5 py-0.5 text-xs font-medium text-ink-soft tabular-nums">{items.length >= 200 ? "200+" : items.length}</span> : null}
        </div>
        <form action="/admin/chats" className="relative">
          <input type="hidden" name="f" value={filter} />
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Поиск по имени, номеру, тексту" className="h-10 w-full rounded-full bg-[#f3efe9] pr-4 pl-10 text-sm outline-none transition placeholder:text-muted focus:bg-white focus:ring-2 focus:ring-wine/20" />
        </form>
        {toolbar ? <div className="mt-2">{toolbar}</div> : null}
      </div>
      <nav className="no-scrollbar mt-2 flex gap-4 overflow-x-auto border-b border-line px-4" aria-label="Фильтр чатов">
        {(Object.keys(CHAT_FILTERS) as ChatFilter[]).map((k) => (
          <Link key={k} href={href({ f: k })} className={cn("-mb-px shrink-0 border-b-2 py-2.5 text-[13px] font-medium transition", filter === k ? "border-wine text-wine" : "border-transparent text-muted hover:text-ink")}>
            {CHAT_FILTERS[k]}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="chat-list">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center text-sm text-muted">
            <MessagesSquare className="size-9 text-muted/40" strokeWidth={1.4} />
            {q ? "По запросу ничего не нашлось" : "Здесь пусто"}
            {emptyCta}
          </div>
        ) : null}
        {items.map((c) => {
          const active = c.id === selectedId;
          return (
            <ChatListLink key={c.id} id={c.id} href={href({ c: c.id })} active={active} pinned={c.pinned}>
              <ChatAvatar name={c.title} url={c.avatarUrl} channel={c.channel} />
              <div className="min-w-0 flex-1 border-b border-line/0">
                <div className="flex items-baseline gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[15px]", c.unread ? "font-semibold text-ink" : "font-medium text-ink")}>{c.title}</span>
                  <span className={cn("shrink-0 text-xs tabular-nums", c.unread ? "font-semibold text-wine" : "text-muted")}>{c.time}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", c.unread ? "text-ink-soft" : "text-muted")}>{c.preview || "—"}</span>
                  {c.unread ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wine px-1.5 text-[11px] font-semibold text-white tabular-nums">{c.unread > 99 ? "99+" : c.unread}</span> : null}
                </div>
                {c.waitMinutes !== null || c.bot || !c.assignee ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                    {c.waitMinutes !== null ? <span className={cn("rounded-md px-1.5 py-0.5", waitTone(c.overdue))}>ждёт {c.waitLabel || waitLabel(c.waitMinutes)}</span> : null}
                    {c.bot ? (
                      <span className="flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-700">
                        <Bot className="size-3" /> бот ведёт
                      </span>
                    ) : null}
                    {!c.assignee ? <span className="rounded-md bg-[#f3efe9] px-1.5 py-0.5 text-ink-soft">без ответственного</span> : <span className="truncate text-muted">{c.assignee}</span>}
                  </div>
                ) : (
                  <div className="mt-1 truncate text-[11px] text-muted">{c.assignee}</div>
                )}
              </div>
            </ChatListLink>
          );
        })}
      </div>
    </div>
  );
}

/** Шапка открытой переписки. */
export function ChatHeader({
  title,
  avatarUrl,
  channel,
  subtitle,
  backHref,
  deal,
  assignee,
}: {
  title: string;
  avatarUrl: string | null;
  channel: string;
  subtitle: string;
  backHref: string;
  deal: { href: string; number: number; stage: string; color: string } | null;
  assignee: string | null;
}) {
  return (
    <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-white px-4">
      <Link href={backHref} className="-ml-1 rounded-full p-2 text-muted hover:bg-[#f3efe9] lg:hidden" aria-label="К списку">
        <ArrowLeft className="size-5" />
      </Link>
      <ChatAvatar name={title} url={avatarUrl} channel={channel} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-tight font-semibold">{title}</div>
        <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>
      </div>
      {assignee ? <span className="hidden max-w-40 truncate rounded-full bg-[#f3efe9] px-3 py-1.5 text-xs text-ink-soft md:inline 2xl:hidden">{assignee}</span> : null}
      {deal ? (
        <Link href={deal.href} className="hidden items-center gap-2 rounded-full border border-line py-1 pr-1 pl-3 text-xs font-medium whitespace-nowrap transition hover:border-wine/40 sm:flex 2xl:hidden">
          <Handshake className="size-4 text-wine" /> №{deal.number}
          <span className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: deal.color }}>
            {deal.stage}
          </span>
        </Link>
      ) : null}
      <DetailsToggle />
    </div>
  );
}

/** Секция боковой панели: заголовок и белая карточка. */
export function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

import { ChatListLink } from "./ChatNav";
import Link from "next/link";
import { ArrowLeft, Bot, Camera, Globe, Mail, MessagesSquare, Send, UserRound } from "lucide-react";
import { cn } from "@/lib/class-names";
import { waitLabel } from "@/modules/reporting/ui/response-wait";
import { EmptyState } from "@/components/ui/EmptyState";
import { WaIcon } from "../WhatsappCall";
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

export const CHAT_FILTERS = { open: "Открытые", mine: "Мои", unread: "Непрочитанные", waiting: "Ждут ответа", closed: "Закрытые" } as const;
export type ChatFilter = keyof typeof CHAT_FILTERS;

/** Значок канала на аватаре: белый кружок со знаком канала его цветом-токеном (без фирменных заливок — одна палитра). */
const CHANNEL_BADGE: Record<string, { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; tone: string; label: string }> = {
  whatsapp: { icon: WaIcon, tone: "text-success", label: "WhatsApp" },
  instagram: { icon: Camera, tone: "text-wine", label: "Instagram" },
  telegram: { icon: Send, tone: "text-info", label: "Telegram" },
  site: { icon: Globe, tone: "text-wine", label: "Сайт" },
  email: { icon: Mail, tone: "text-ink-soft", label: "Почта" },
};

/**
 * Цвет текста на плашке этапа: этап красят в «Воронке» любым цветом, и белый на светло-жёлтом не читался. Тёмный или
 * белый — что контрастнее (WCAG, lib/readable-text); не цвет — белый, как раньше. Цвет — инлайном, тёмная тема его не переворачивает.
 */
export function readableOn(color: string) {
  return textOn(color) === "#000000" ? "#17130f" : "#fff";
}

/**
 * Аватар без фото — буква на тонированной подложке. Тон стабилен по имени (собеседников легче различать в списке) и
 * берётся из статусных пар токенов: в тёмной теме они сами становятся тёмными.
 */
const TONES = ["bg-rose text-wine", "bg-success-bg text-success", "bg-info-bg text-info", "bg-warning-bg text-warning", "bg-sunken text-ink-soft"];
const toneOf = (name: string) => TONES[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];

const SIZES = {
  40: { box: "size-10 text-sm", badge: "size-4", icon: "size-2.5" },
  44: { box: "size-11 text-[15px]", badge: "size-[18px]", icon: "size-3" },
  48: { box: "size-12 text-base", badge: "size-[18px]", icon: "size-3" },
  56: { box: "size-14 text-lg", badge: "size-5", icon: "size-3" },
  72: { box: "size-[72px] text-2xl", badge: "size-6", icon: "size-3.5" },
} as const;

export function ChatAvatar({ name, url, channel, size = 44 }: { name: string; url: string | null; channel?: string; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  const badge = channel ? CHANNEL_BADGE[channel] : undefined;
  // Первая буква имени; у номера телефона букв нет — значок человека.
  const letter = /\p{L}/u.exec(name)?.[0] ?? null;
  return (
    <span className={cn("relative inline-block shrink-0", s.box)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={cn("rounded-full object-cover", s.box)} loading="lazy" />
      ) : (
        <span className={cn("flex items-center justify-center rounded-full font-semibold uppercase", s.box, toneOf(name))} aria-hidden>
          {letter ?? <UserRound className="size-[45%]" strokeWidth={1.8} />}
        </span>
      )}
      {badge ? (
        <span className={cn("absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-white ring-2 ring-white", s.badge, badge.tone)} title={badge.label}>
          <badge.icon className={s.icon} strokeWidth={2.4} />
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1" data-testid="chat-list">
        {items.length === 0 ? (
          <EmptyState compact icon={MessagesSquare} title={q ? "По запросу ничего не нашлось" : filter === "open" ? "Открытых диалогов нет" : "В этом списке пусто"} action={emptyCta}>
            {q ? "Проверьте написание или поищите по номеру телефона." : filter === "open" ? "Новые сообщения из WhatsApp, Instagram, Telegram, сайта и почты появятся здесь." : "Попробуйте другой фильтр."}
          </EmptyState>
        ) : null}
        {items.map((c) => {
          const active = c.id === selectedId;
          const needs = c.waitMinutes !== null || c.bot || !c.assignee;
          return (
            <ChatListLink key={c.id} id={c.id} href={href({ c: c.id })} active={active} pinned={c.pinned}>
              <ChatAvatar name={c.title} url={c.avatarUrl} channel={c.channel} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[15px] leading-5 text-ink", c.unread ? "font-semibold" : "font-medium")}>{c.title}</span>
                  <span className={cn("shrink-0 text-xs tabular-nums", c.unread ? "font-semibold text-wine" : "text-muted")}>{c.time}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[13px] leading-5", c.unread ? "text-ink" : "text-muted")}>{c.preview || "Без текста"}</span>
                  {c.unread ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wine px-1.5 text-xs font-semibold text-white tabular-nums" aria-label={`Непрочитанных: ${c.unread}`}>
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  ) : null}
                </div>
                <div className={cn("mt-1.5 flex min-w-0 items-center gap-1.5", !needs && "mt-1")}>
                  {c.waitMinutes !== null ? <span className={cn("badge", c.overdue ? "badge-danger" : "badge-warning")}>ждёт {c.waitLabel || waitLabel(c.waitMinutes)}</span> : null}
                  {c.bot ? (
                    <span className="badge badge-info">
                      <Bot className="size-3" aria-hidden /> бот ведёт
                    </span>
                  ) : null}
                  {c.assignee ? (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
                      <UserRound className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{c.assignee}</span>
                    </span>
                  ) : (
                    <span className="badge">без ответственного</span>
                  )}
                </div>
              </div>
            </ChatListLink>
          );
        })}
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

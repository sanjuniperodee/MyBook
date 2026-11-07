"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { LoaderCircle, Pin, PinOff } from "lucide-react";
import { createContext, useContext, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { pinChatAction } from "@/app/admin/chats/actions";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";

/**
 * Переключение между диалогами: страница чатов собирается на сервере (список, переписка, боковая колонка), и смена
 * ?c=… не показывает ничего, пока ответ не пришёл. Нажатый диалог сразу подсвечивается, а область переписки — заготовка.
 * Состояние «куда идём» берётся из useLinkStatus ссылки, поэтому само сбрасывается, когда переход закончен или отменён.
 */
const PendingContext = createContext<{ pending: string | null; setPending: (id: string | null) => void }>({ pending: null, setPending: () => {} });

export function ChatNavProvider({ className, children, ...rest }: { className?: string; children: React.ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <PendingContext.Provider value={{ pending, setPending }}>
      {/* data-chat-root и т. п. — на корень: по нему «потяни, чтобы обновить» не срабатывает внутри чата. */}
      <div className={className} {...rest}>
        {children}
      </div>
    </PendingContext.Provider>
  );
}

/** Сообщает провайдеру, что переход по этой ссылке идёт. Должен лежать внутри Link. */
function Reporter({ id }: { id: string }) {
  const { pending } = useLinkStatus();
  const { setPending } = useContext(PendingContext);
  useEffect(() => {
    if (!pending) return;
    setPending(id);
    return () => setPending(null);
  }, [pending, id, setPending]);
  return null;
}

/**
 * Строка списка диалогов: ссылка, которая подсвечивается сразу при нажатии. Закрепление (у каждого сотрудника своё) — в меню
 * по правому клику или долгому нажатию; у закреплённого чата в строке виден значок булавки.
 */
export function ChatListLink({ id, href, active, pinned = false, children }: { id: string; href: string; active: boolean; pinned?: boolean; children: React.ReactNode }) {
  const { pending } = useContext(PendingContext);
  const going = pending === id;
  const router = useRouter();
  const [, start] = useTransition();
  // Пока идёт запрос — показываем ожидаемое состояние, чтобы значок не дёргался.
  const [on, setOn] = useOptimistic(pinned);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<number | null>(null);
  const toggle = () =>
    start(async () => {
      setOn(!on);
      try {
        const r = await pinChatAction(id, !on);
        if (r.error) throw new Error(r.error);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось", "error");
      }
    });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  return (
    <div
      // Чаты за экраном не раскладываем и не рисуем: в списке до 150 диалогов, на телефоне это заметно.
      className="relative [contain-intrinsic-size:auto_84px] [content-visibility:auto]"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 70) });
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        const { clientX: x, clientY: y } = e;
        press.current = window.setTimeout(() => setMenu({ x: Math.min(x, window.innerWidth - 220), y: Math.min(y, window.innerHeight - 70) }), 500);
      }}
      onPointerUp={() => press.current && window.clearTimeout(press.current)}
      onPointerMove={() => press.current && window.clearTimeout(press.current)}
      onPointerCancel={() => press.current && window.clearTimeout(press.current)}
    >
      <Link
        href={href}
        className={cn("relative mx-2 flex gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors duration-150", active || going ? "bg-rose/70" : "hover:bg-sunken/70 active:bg-sunken", going && "opacity-80")}
        aria-current={active ? "true" : undefined}
        aria-busy={going || undefined}
      >
        {active || going ? <span className={cn("absolute inset-y-2.5 -left-2 w-[3px] rounded-r-full bg-wine", going && "animate-pulse")} aria-hidden /> : null}
        <Reporter id={id} />
        {children}
        {on ? <Pin className="pointer-events-none absolute right-2.5 bottom-3 size-3.5 text-wine" fill="currentColor" aria-label="Закреплён" /> : null}
        {going ? <LoaderCircle className="absolute right-8 bottom-3 size-4 animate-spin text-wine" aria-label="Открываем диалог" /> : null}
      </Link>
      {menu
        ? createPortal(
            <div className="fixed z-[80] w-52 overflow-hidden rounded-[10px] border border-line bg-white p-1 text-sm text-ink shadow-soft" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                role="menuitem"
                className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-sunken max-lg:min-h-11"
                onClick={() => {
                  setMenu(null);
                  toggle();
                }}
              >
                {on ? <PinOff className="size-4 text-ink-soft" /> : <Pin className="size-4 text-ink-soft" />} {on ? "Открепить чат" : "Закрепить чат"}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Правая часть страницы чатов: пока идёт переход к другому диалогу — заготовка вместо прежней переписки. */
export function ChatSlot({ currentId, children }: { currentId: string | null; children: React.ReactNode }) {
  const { pending } = useContext(PendingContext);
  if (pending && pending !== currentId) return <ChatPaneSkeleton />;
  return <>{children}</>;
}

/** Заготовка открытого диалога: шапка, пузыри сообщений, поле ответа и боковая колонка. */
export function ChatPaneSkeleton() {
  const bubbles = [
    ["w-2/5", false],
    ["w-1/3", true],
    ["w-3/5", false],
    ["w-1/4", true],
    ["w-2/5", false],
  ] as const;
  return (
    <>
      <div className="hidden min-w-0 flex-1 flex-col lg:flex" aria-busy="true" aria-label="Загрузка переписки">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white px-5">
          <div className="skeleton size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end overflow-hidden bg-canvas px-6 py-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {bubbles.map(([w, mine], i) => (
              <div key={i} className={cn("flex", mine && "justify-end")}>
                <div className={cn("skeleton h-12 rounded-[14px]", w)} />
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-line bg-white px-4 py-3">
          <div className="skeleton mx-auto h-[7.5rem] w-full max-w-3xl rounded-[14px]" />
        </div>
      </div>
      <div className="hidden w-[300px] shrink-0 border-l border-line bg-white xl:block 2xl:w-[340px]">
        <div className="flex flex-col items-center gap-2 border-b border-line px-5 py-6">
          <div className="skeleton size-14 rounded-full" />
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-3 w-24" />
        </div>
        <div className="space-y-3 border-b border-line p-5">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-16 w-full rounded-[10px]" />
        </div>
        <div className="space-y-3 p-5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-10 w-full rounded-[10px]" />
        </div>
      </div>
    </>
  );
}

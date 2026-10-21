"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pin } from "lucide-react";
import { createContext, useContext, useEffect, useOptimistic, useState, useTransition } from "react";
import { pinChatAction } from "@/app/admin/chats/actions";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";

/**
 * Переключение между диалогами: страница чатов собирается на сервере (список, переписка, боковая колонка), и смена
 * ?c=… не показывает ничего, пока ответ не пришёл. Нажатый диалог сразу подсвечивается, а область переписки — заготовка.
 * Состояние «куда идём» берётся из useLinkStatus ссылки, поэтому само сбрасывается, когда переход закончен или отменён.
 */
const PendingContext = createContext<{ pending: string | null; setPending: (id: string | null) => void }>({ pending: null, setPending: () => {} });

export function ChatNavProvider({ className, children }: { className?: string; children: React.ReactNode }) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <PendingContext.Provider value={{ pending, setPending }}>
      <div className={className}>{children}</div>
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

/** Строка списка диалогов: ссылка, которая подсвечивается сразу при нажатии, и кнопка закрепления (у каждого сотрудника своя). */
export function ChatListLink({ id, href, active, pinned = false, children }: { id: string; href: string; active: boolean; pinned?: boolean; children: React.ReactNode }) {
  const { pending } = useContext(PendingContext);
  const going = pending === id;
  const router = useRouter();
  const [busy, start] = useTransition();
  // Пока идёт запрос — показываем ожидаемое состояние, чтобы кнопка не дёргалась.
  const [on, setOn] = useOptimistic(pinned);
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
  return (
    <div className="group relative">
      <Link href={href} className={cn("relative flex gap-3 px-4 py-3 transition", active || going ? "bg-[#f7ecee]" : "hover:bg-[#faf8f5]", going && "opacity-80")} aria-current={active ? "true" : undefined} aria-busy={going || undefined}>
        {active || going ? <span className={cn("absolute inset-y-0 left-0 w-[3px] bg-wine", going && "animate-pulse")} /> : null}
        <Reporter id={id} />
        {children}
        {going ? <LoaderCircle className="absolute right-10 bottom-3 size-4 animate-spin text-wine" aria-label="Открываем диалог" /> : null}
      </Link>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title={on ? "Открепить чат" : "Закрепить чат вверху списка"}
        aria-label={on ? "Открепить чат" : "Закрепить чат"}
        aria-pressed={on}
        className={cn("absolute right-3 bottom-2.5 rounded-full p-1 transition hover:bg-black/5 focus:opacity-100", on ? "text-wine opacity-100" : "text-muted opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-50")}
      >
        <Pin className="size-3.5" fill={on ? "currentColor" : "none"} />
      </button>
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
        <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-white px-4">
          <div className="skeleton size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden bg-[#f5f1eb] p-4">
          {bubbles.map(([w, mine], i) => (
            <div key={i} className={cn("flex", mine && "justify-end")}>
              <div className={cn("skeleton h-12 rounded-2xl", w)} />
            </div>
          ))}
        </div>
        <div className="border-t border-line bg-white p-3">
          <div className="skeleton h-11 w-full rounded-full" />
        </div>
      </div>
      <div className="hidden w-[320px] shrink-0 space-y-4 border-l border-line bg-[#faf8f5] p-4 2xl:block">
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
      </div>
    </>
  );
}

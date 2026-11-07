/** Заготовка «Чатов»: страница занимает всю высоту окна — входящие слева, переписка и детали справа, той же формы. */
import { ChatPaneSkeleton } from "@/components/admin/chat/ChatNav";

export default function Loading() {
  return (
    <div className="sk-delay crm-chat-root -mx-4 -my-5 flex overflow-hidden bg-white sm:-mx-6 lg:-my-7 lg:h-[calc(100dvh-3.5rem)] 2xl:-mx-8" aria-busy="true" aria-label="Загрузка">
      <div className="flex w-full shrink-0 flex-col border-r border-line bg-white lg:w-[340px] xl:w-[320px] 2xl:w-[360px]">
        <div className="space-y-3 px-4 pt-4 pb-3">
          <div className="skeleton h-7 w-24" />
          <div className="skeleton h-10 w-full rounded-[10px]" />
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-8 w-20 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-1 border-t border-line px-2 pt-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-[10px] px-2.5 py-3">
              <div className="skeleton size-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-2/5" />
                <div className="skeleton h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <ChatPaneSkeleton />
    </div>
  );
}

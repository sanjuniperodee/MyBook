import Link from "next/link";
import { Columns3 } from "lucide-react";
import { staffOptions } from "@/modules/access/ui";
import { requireStaff } from "@/server/access";
import { container } from "@/server/container";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { CalendarPage } from "./CalendarPage";
import { IcalFeed } from "./IcalFeed";

export const metadata = { title: "Календарь задач" };

/** Календарь задач со всех досок: месяц, неделя, день, перенос сроков перетаскиванием; подписка в своём календаре. */
export default async function TasksCalendarPage() {
  const staff = await requireStaff();
  const admins = await container().access.queries.allStaff();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Календарь задач"
        actions={
          <Link href="/admin/tasks/boards" className="btn btn-outline">
            <Columns3 className="size-4" aria-hidden /> Доски
          </Link>
        }
      >
        Задачи со сроком со всех досок. Перетащите карточку на другой день или час — срок поменяется.
      </PageHeader>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <CalendarPage staff={staffOptions(admins)} me={staff.user.id} />
        <aside className="flex flex-col gap-4 xl:sticky xl:top-[calc(var(--topbar-h)+1rem)]" aria-label="Мой календарь">
          <Panel title="Задачи в вашем календаре">
            <IcalFeed />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

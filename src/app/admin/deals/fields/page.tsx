import { requireStaff } from "@/server/access";
import { listFields } from "@/modules/workspace";
import { ListPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { FieldEditor } from "./FieldEditor";

export const metadata = { title: "Свои поля" };

export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireStaff("settings.manage");
  const entity = (await searchParams).e === "client" ? "client" : "deal";
  const fields = await listFields(entity);
  return (
    <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-5">
      <PageHeader back={{ href: "/admin/deals", label: "Сделки" }} title="Свои поля">
        Дополнительная информация в карточке: повод, дата события, для кого книга… Поля можно использовать в шаблонах сообщений: {"{"}Название поля{"}"}. Поля сделки «Повод», «Дата события» и «Для кого» заполняются сами из книги клиента, а бот-квалификатор записывает в поля ответы клиента.
      </PageHeader>
      <Segmented
        label="Чьи поля"
        className="w-fit"
        items={[
          { key: "deal", label: "Поля сделки", href: "/admin/deals/fields?e=deal", active: entity === "deal" },
          { key: "client", label: "Поля клиента", href: "/admin/deals/fields?e=client", active: entity === "client" },
        ]}
      />
      <Panel
        flush
        title={entity === "deal" ? "Поля сделки" : "Поля клиента"}
        description={`Показываются в карточке ${entity === "deal" ? "каждой сделки" : "каждого клиента"}; название можно вставить в шаблон сообщения`}
        actions={fields.length ? <span className="count">{fields.length}</span> : null}
      >
        {fields.length ? (
          <div className="divide-y divide-line">
            {fields.map((f) => (
              <FieldEditor key={f.id} entity={entity} field={{ id: f.id, key: f.key, label: f.label, type: f.type, options: f.options }} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={ListPlus} title="Своих полей пока нет">
            Добавьте первое ниже — оно появится в карточке {entity === "deal" ? "каждой сделки" : "каждого клиента"}.
          </EmptyState>
        )}
        <div className="rounded-b-[var(--r-panel)] border-t border-line bg-sunken/40">
          <FieldEditor entity={entity} field={null} />
        </div>
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { requireStaff } from "@/server/access";
import { listFields } from "@/lib/crm/fields";
import { cn } from "@/lib/utils";
import { FieldEditor } from "./FieldEditor";

export const metadata = { title: "Свои поля" };

export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireStaff("settings.manage");
  const entity = (await searchParams).e === "client" ? "client" : "deal";
  const fields = await listFields(entity);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/admin/deals" className="text-sm text-muted hover:text-ink">
        ← Сделки
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Свои поля</h1>
        <p className="mt-1 text-sm text-muted">
          Дополнительная информация в карточке: повод, дата события, для кого книга… Поля можно использовать в шаблонах сообщений: {"{"}Название поля{"}"}. Поля сделки «Повод», «Дата события» и «Для кого»
          заполняются сами из книги клиента, а бот-квалификатор записывает в поля ответы клиента.
        </p>
      </div>
      <div className="flex gap-2">
        {(
          [
            ["deal", "Поля сделки"],
            ["client", "Поля клиента"],
          ] as const
        ).map(([k, label]) => (
          <Link key={k} href={`/admin/deals/fields?e=${k}`} className={cn("rounded-full px-3 py-1.5 text-sm", entity === k ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
            {label}
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        {fields.map((f) => (
          <FieldEditor key={f.id} entity={entity} field={{ id: f.id, key: f.key, label: f.label, type: f.type, options: f.options }} />
        ))}
        <FieldEditor entity={entity} field={null} />
      </div>
    </div>
  );
}

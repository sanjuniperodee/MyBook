import Link from "next/link";
import { SearchX } from "lucide-react";

/** 404 внутри CRM: меню остаётся на месте. Сюда же попадают разделы, закрытые ролью сотрудника. */
export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <SearchX className="size-10 text-muted/60" strokeWidth={1.4} />
      <h1 className="text-lg font-semibold">Не найдено</h1>
      <p className="max-w-sm text-sm text-muted">Такой записи нет, или она недоступна вашей роли. Если доступ нужен для работы — попросите руководителя.</p>
      <Link href="/admin" className="btn btn-outline btn-sm mt-2">
        На главную CRM
      </Link>
    </div>
  );
}

/** Сотрудники в интерфейсе — чистые функции, годятся и для клиентских компонентов. Подпись — staffLabel в shared/domain/staff. */
import { staffLabel } from "@/shared/domain/staff";

/** Варианты «ответственного»: только активные сотрудники. */
export function staffOptions(admins: { id: string; name: string; email: string; disabled: boolean }[]) {
  return admins.filter((a) => !a.disabled).map((a) => ({ id: a.id, label: staffLabel(a) }));
}

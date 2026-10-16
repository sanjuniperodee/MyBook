/** Сотрудники в интерфейсе — чистые функции, годятся и для клиентских компонентов. */
import { staffLabel } from "@/shared/domain/staff";

/** Варианты «ответственного»: только активные сотрудники. */
export function staffOptions(admins: { id: string; name: string; email: string; disabled: boolean }[]) {
  return admins.filter((a) => !a.disabled).map((a) => ({ id: a.id, label: staffLabel(a) }));
}

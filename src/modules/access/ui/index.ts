/** Подписи сотрудников для интерфейса — чистые функции, годятся и для клиентских компонентов. */

export function adminLabel(a: { name: string; email: string } | null | undefined) {
  if (!a) return "—";
  return a.name && a.name !== "Администратор" ? a.name : a.email.split("@")[0];
}

/** Варианты «ответственного»: только активные сотрудники. */
export function staffOptions(admins: { id: string; name: string; email: string; disabled: boolean }[]) {
  return admins.filter((a) => !a.disabled).map((a) => ({ id: a.id, label: adminLabel(a) }));
}

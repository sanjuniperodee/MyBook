/** Подпись сотрудника в CRM — чистая функция, годится и для клиентских компонентов. */
export function staffLabel(a: { name: string; email: string } | null | undefined) {
  if (!a) return "—";
  return a.name && a.name !== "Администратор" ? a.name : a.email.split("@")[0];
}

import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { adminLabel } from "../crm";
import { notify } from "./notify";

/** Кого упомянули в тексте: «@Имя» — по отображаемому имени сотрудника (как в списках CRM). */
export function findMentions(text: string, staff: { id: string; label: string }[]) {
  const lower = text.toLowerCase();
  // Длинные имена первыми: «@Айгерим Сапарова» не должен засчитаться ещё и как «@Айгерим».
  const sorted = [...staff].sort((a, b) => b.label.length - a.label.length);
  const found = new Set<string>();
  let rest = lower;
  for (const s of sorted) {
    const tag = `@${s.label.toLowerCase()}`;
    if (rest.includes(tag)) {
      found.add(s.id);
      rest = rest.replaceAll(tag, " ");
    }
  }
  return [...found];
}

export async function mentionableStaff() {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false)));
  return rows.map((r) => ({ id: r.id, label: adminLabel(r) }));
}

/** Уведомить упомянутых (кроме автора). */
export async function notifyMentions(text: string, authorId: string, authorName: string, link: string, where: string) {
  if (!text.includes("@")) return;
  const ids = findMentions(text, await mentionableStaff()).filter((id) => id !== authorId);
  await notify(ids, { kind: "mention", title: `${authorName} упомянул(а) вас · ${where}`, body: text.slice(0, 300), link });
}

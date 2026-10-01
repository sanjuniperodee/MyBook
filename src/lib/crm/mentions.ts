import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { adminLabel } from "../crm";
import { notify } from "./notify";

import { findMentions } from "./mentions-logic";

export { findMentions };

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

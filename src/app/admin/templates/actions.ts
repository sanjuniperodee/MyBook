"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { container } from "@/server/container";
import { assertStaff } from "@/server/access";

const uuid = z.string().uuid();
const templateSchema = z.object({
  title: z.string().trim().min(1, "Введите название").max(60, "Название — не больше 60 знаков"),
  text: z.string().trim().min(1, "Введите текст шаблона").max(2000, "Текст — не больше 2000 знаков"),
});
/** Личных шаблонов на сотрудника — чтобы список оставался списком, а не свалкой. */
const MAX_TEMPLATES = 100;

const refresh = () => {
  revalidatePath("/admin/templates");
  revalidatePath("/admin/chats");
};

/** Создать личный шаблон (id пустой) или изменить свой. */
export async function saveMyTemplateAction(id: string, title: string, text: string): Promise<{ ok?: true; id?: string; error?: string }> {
  const staff = await assertStaff("chats.view");
  const parsed = templateSchema.safeParse({ title, text });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const repo = container().workspace.personalTemplates;
  if (id) {
    if (!(await repo.update(staff.user.id, uuid.parse(id), parsed.data))) return { error: "Шаблон не найден" };
    refresh();
    return { ok: true, id };
  }
  if ((await repo.list(staff.user.id)).length >= MAX_TEMPLATES) return { error: `Не больше ${MAX_TEMPLATES} личных шаблонов` };
  const created = await repo.add(staff.user.id, parsed.data);
  refresh();
  return { ok: true, id: created };
}

export async function deleteMyTemplateAction(id: string): Promise<{ ok?: true; error?: string }> {
  const staff = await assertStaff("chats.view");
  if (!(await container().workspace.personalTemplates.remove(staff.user.id, uuid.parse(id)))) return { error: "Шаблон не найден" };
  refresh();
  return { ok: true };
}

/** Копия шаблона (своего или общего) в личные. */
export async function duplicateTemplateAction(id: string): Promise<{ ok?: true; error?: string }> {
  const staff = await assertStaff("chats.view");
  const templates = await container().messaging.view.templates(staff.user.id);
  const src = templates.find((t) => t.id === uuid.parse(id));
  if (!src) return { error: "Шаблон не найден" };
  const repo = container().workspace.personalTemplates;
  if ((await repo.list(staff.user.id)).length >= MAX_TEMPLATES) return { error: `Не больше ${MAX_TEMPLATES} личных шаблонов` };
  await repo.add(staff.user.id, { title: `${src.title} (копия)`.slice(0, 60), text: src.text });
  refresh();
  return { ok: true };
}

/** Порядок личных шаблонов: id сверху вниз — в таком порядке они идут в списке «Шаблоны» в чате. */
export async function reorderMyTemplatesAction(ids: string[]): Promise<{ ok?: true; error?: string }> {
  const staff = await assertStaff("chats.view");
  await container().workspace.personalTemplates.reorder(staff.user.id, z.array(uuid).max(MAX_TEMPLATES).parse(ids));
  refresh();
  return { ok: true };
}

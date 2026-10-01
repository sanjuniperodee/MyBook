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

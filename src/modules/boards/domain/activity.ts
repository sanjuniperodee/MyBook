/** Строка журнала карточки по-человечески: «перенёс(ла) из «Макет» в «Печать»». Сайт и приложение — одна подпись. */
const dueLabel = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });

export function activityText(kind: string, data: Record<string, unknown>, labels: Map<string, string>) {
  const d = data as Record<string, string | undefined | string[]>;
  switch (kind) {
    case "created":
      return `создал(а) карточку в «${d.column}»`;
    case "moved":
      return d.from ? `перенёс(ла) из «${d.from}» в «${d.to}»${d.board ? ` на доску «${d.board}»` : ""}` : `перенёс(ла) в «${d.to}»`;
    case "done":
      return "отметил(а) выполненной";
    case "reopened":
      return "вернул(а) в работу";
    case "archived":
      return "убрал(а) в архив";
    case "restored":
      return "вернул(а) из архива";
    case "assignees":
      return "изменил(а) исполнителей";
    case "label.added":
      return `добавил(а) метку «${labels.get(String(d.labelId)) ?? "—"}»`;
    case "label.removed":
      return `снял(а) метку «${labels.get(String(d.labelId)) ?? "—"}»`;
    case "checklist.added":
      return `добавил(а) чек-лист «${d.title}»`;
    case "item.done":
      return `отметил(а) «${d.text}»`;
    case "item.undone":
      return `снял(а) отметку «${d.text}»`;
    case "file.added":
      return `приложил(а) «${d.name}»`;
    case "file.removed":
      return `удалил(а) вложение «${d.name}»`;
    case "rule":
      return `сработало правило «${d.name}»`;
    case "recurring":
      return "создана по повтору";
    case "updated":
      return d.dueAt !== undefined ? (d.dueAt ? `поставил(а) срок ${dueLabel(String(d.dueAt))}` : "убрал(а) срок") : d.title ? `переименовал(а) в «${d.title}»` : d.description ? "изменил(а) описание" : d.recurrence !== undefined ? "изменил(а) повтор" : "изменил(а) карточку";
    default:
      return kind;
  }
}


import { contextError } from "@/shared/domain";
import { isFailureKind, type FailureKind } from "./routing";

/**
 * Ошибка AI-помощника; message — текст, который можно показать менеджеру. params[0] — вид сбоя (FailureKind) для
 * маршрутизации продажника: повторить, перейти к запасному провайдеру или подняться на уровень выше.
 */
export const AssistantError = contextError<"notConfigured" | "refused" | "badResponse" | "unavailable" | "nothingToDo">("assistant", "AssistantError");
export type AssistantError = InstanceType<typeof AssistantError>;

/** Вид сбоя запроса к модели: из ошибки провайдера, а для прочих — по коду (неизвестная ошибка — как сбой сервера). */
export function failureKindOf(err: unknown): FailureKind {
  if (!AssistantError.is(err)) return "server";
  const kind = err.params[0];
  if (isFailureKind(kind)) return kind;
  if (err.code === "refused") return "refused";
  if (err.code === "notConfigured") return "not_configured";
  if (err.code === "badResponse") return "empty";
  return "server";
}

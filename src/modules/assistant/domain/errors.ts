import { contextError } from "@/shared/domain";

/** Ошибка AI-помощника; message — текст, который можно показать менеджеру. */
export const AssistantError = contextError<"notConfigured" | "refused" | "badResponse" | "unavailable" | "nothingToDo">("assistant", "AssistantError");
export type AssistantError = InstanceType<typeof AssistantError>;

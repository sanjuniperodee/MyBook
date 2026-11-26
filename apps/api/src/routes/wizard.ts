/**
 * Мастер новой книги для приложения — те же данные, что страница /books/new сайта: сборка вынесена в
 * authoring/ui/wizardView.ts (общая с бэкендом на Nest).
 */
import { isLocale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { buildBookWizardView, buildWizardDeadlineView } from "@/modules/authoring/ui/wizardView";
import type { Handlers } from "../app";

export const wizardHandlers: Pick<Handlers, "bookWizard" | "wizardDeadline"> = {
  async bookWizard({ user }) {
    const raw = await getLocale();
    const locale = isLocale(raw) ? raw : "ru";
    return buildBookWizardView(locale, await getMessages(), user!.name ?? "");
  },

  async wizardDeadline({ input }) {
    return buildWizardDeadlineView(input.occasion, input.date, await getMessages());
  },
};

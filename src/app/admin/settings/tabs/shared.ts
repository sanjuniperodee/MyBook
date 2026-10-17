import { env } from "@/config/env";

/** Адрес вебхука для вставки в чужой кабинет (с токеном, если он нужен). */
export const hook = (path: string, token?: string) => `${env.appUrl}${path}${token ? `?token=${token}` : ""}`;

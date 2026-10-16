"use client";

import { createContext } from "react";
import type { ClientMessages } from "./messages";

/** Словарь текущего языка страницы — его кладёт I18nProvider (i18n/dictionary/*). */
export const MessagesContext = createContext<ClientMessages | null>(null);

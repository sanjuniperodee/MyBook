"use client";

import type { ReactNode } from "react";
import { MessagesContext } from "../context";
import { uzClient } from "../messages/uz/client";

/** Словарь страницы на языке «uz»: свой чанк, грузится только на страницах этого языка. */
export default function UzDictionary({ children }: { children: ReactNode }) {
  return <MessagesContext.Provider value={uzClient}>{children}</MessagesContext.Provider>;
}

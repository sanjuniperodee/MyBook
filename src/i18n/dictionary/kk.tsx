"use client";

import type { ReactNode } from "react";
import { MessagesContext } from "../context";
import { kkClient } from "../messages/kk/client";

/** Словарь страницы на языке «kk»: свой чанк, грузится только на страницах этого языка. */
export default function KkDictionary({ children }: { children: ReactNode }) {
  return <MessagesContext.Provider value={kkClient}>{children}</MessagesContext.Provider>;
}

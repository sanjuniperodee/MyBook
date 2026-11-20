"use client";

import type { ReactNode } from "react";
import { MessagesContext } from "../context";
import { enClient } from "../messages/en/client";

/** Словарь страницы на языке «en»: свой чанк, грузится только на страницах этого языка. */
export default function EnDictionary({ children }: { children: ReactNode }) {
  return <MessagesContext.Provider value={enClient}>{children}</MessagesContext.Provider>;
}

"use client";

import type { ReactNode } from "react";
import { MessagesContext } from "../context";
import { ruClient } from "../messages/ru/client";

/** Словарь страницы на языке «ru»: свой чанк, грузится только на страницах этого языка. */
export default function RuDictionary({ children }: { children: ReactNode }) {
  return <MessagesContext.Provider value={ruClient}>{children}</MessagesContext.Provider>;
}

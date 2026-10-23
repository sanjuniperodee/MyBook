import "server-only";
import { getAiPacks } from "@/config/site";
import { ensureCatalog } from "@/server/catalog";

export interface DesignAiPackOffer {
  id: string;
  requests: number;
  price: number;
  featured: boolean;
}

/** Пакеты запросов к ИИ-дизайнеру, которые сейчас продаются (цены — из «Цен и тарифов»). */
export async function designAiPacks(): Promise<DesignAiPackOffer[]> {
  await ensureCatalog();
  return getAiPacks()
    .filter((p) => !p.hidden)
    .map((p) => ({ id: p.id, requests: p.requests, price: p.price, featured: !!p.featured }));
}

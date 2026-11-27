import type { Provider } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { BookRow } from "@/modules/authoring";
import { ordersApi, type OrdersApiCall } from "@/server/api-v1/orders";
import { ORDERS_API_PORTS, type OrdersApiPorts, type OrdersApiRoute, type OrdersCallMeta } from "../modules/orders/orders.tokens";
import { runInLegacyRequest, toLegacyStaff } from "./legacy-request";

/**
 * Выполнить маршрут общим кодом (src/server/api-v1/orders.ts — его же зовёт mybook-api) внутри `runInLegacyRequest`:
 * действия CRM, лимиты и язык видят того же пользователя, сотрудника, IP и язык без `next/headers`. Маршрутам сайта с
 * чеком (оплата, возврат) уходит запрос с тем же адресом и входом (Bearer — токен текущей сессии).
 */
function run<K extends OrdersApiRoute>(meta: OrdersCallMeta, name: K, input: Parsed<K>, book: BookRow | null = null): Promise<Output<K> | Response> {
  return runInLegacyRequest(meta, () => {
    const route = ordersApi[name] as unknown as (call: OrdersApiCall<K>) => Promise<Output<K> | Response>;
    return route({
      input,
      staff: meta.staff ? toLegacyStaff(meta.staff) : null,
      user: meta.user ?? meta.staff?.user ?? null,
      book,
      req: new Request(meta.url, { headers: meta.token ? { authorization: `Bearer ${meta.token}` } : {} }),
    });
  });
}

/** Адаптер порта Контекста 7A («заказы и деньги API v1») к общему коду маршрутов. */
export const legacyOrdersPorts: Provider<OrdersApiPorts> = {
  provide: ORDERS_API_PORTS,
  useFactory: (): OrdersApiPorts => ({ run }),
};

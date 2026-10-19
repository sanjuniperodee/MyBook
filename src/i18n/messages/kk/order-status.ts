import type { Messages } from "..";

/** Статусы заказа — в общем словаре, в CRM и в списках заказов (без словаря целиком). */
export const orderStatus: Messages["common"]["orderStatus"] = {
  pending_payment: "Төлемді күтуде",
  paid: "Төленді",
  in_production: "Өндірісте",
  shipped: "Жіберілді",
  delivered: "Жеткізілді",
  cancelled: "Бас тартылды",
};

/** Электронная нұсқа: төленген тапсырыс — орындалған, басып шығаратын не жіберетін ештеңе жоқ. */
export const orderStatusDigital: Messages["common"]["orderStatusDigital"] = {
  paid: "Орындалды · файлдар қолжетімді",
};

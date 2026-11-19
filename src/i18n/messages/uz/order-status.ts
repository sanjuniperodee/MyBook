import type { Messages } from "..";

/** Статусы заказа — в общем словаре, в CRM и в списках заказов (без словаря целиком). */
export const orderStatus: Messages["common"]["orderStatus"] = {
  pending_payment: "To‘lov kutilmoqda",
  paid: "To‘langan",
  in_production: "Ishlab chiqarilmoqda",
  shipped: "Jo‘natilgan",
  delivered: "Yetkazib berilgan",
  cancelled: "Bekor qilingan",
};

/** Электронная версия: оплаченный заказ — уже выполненный, печатать и отправлять нечего. */
export const orderStatusDigital: Messages["common"]["orderStatusDigital"] = {
  paid: "Bajarildi · fayllar mavjud",
};

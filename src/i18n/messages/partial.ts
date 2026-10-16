/**
 * Части словаря на любом языке — для браузерного кода, которому нужен не язык страницы (язык книги или
 * сертификата) или который работает без React (client-api, dates). Модуль не тянет словари целиком:
 * каждая часть — свой маленький файл в ru/ и kk/.
 */
import type { Locale } from "../config";
import { date as kkDate, errors as kkErrors } from "./kk/basics";
import { book as kkBook } from "./kk/book";
import { card as kkGiftCard } from "./kk/gift-card";
import { share as kkLetterShare } from "./kk/letter-share";
import { orderStatus as kkOrderStatus, orderStatusDigital as kkOrderStatusDigital } from "./kk/order-status";
import { plans as kkPlans } from "./kk/plans";
import { date as ruDate, errors as ruErrors } from "./ru/basics";
import { book as ruBook } from "./ru/book";
import { card as ruGiftCard } from "./ru/gift-card";
import { share as ruLetterShare } from "./ru/letter-share";
import { orderStatus as ruOrderStatus, orderStatusDigital as ruOrderStatusDigital } from "./ru/order-status";
import { plans as ruPlans } from "./ru/plans";

const parts = {
  ru: { book: ruBook, errors: ruErrors, date: ruDate, giftCard: ruGiftCard, letterShare: ruLetterShare, plans: ruPlans, orderStatus: ruOrderStatus, orderStatusDigital: ruOrderStatusDigital },
  kk: { book: kkBook, errors: kkErrors, date: kkDate, giftCard: kkGiftCard, letterShare: kkLetterShare, plans: kkPlans, orderStatus: kkOrderStatus, orderStatusDigital: kkOrderStatusDigital },
} satisfies Record<Locale, unknown>;

/** Подписи в самой книге: «Глава N», «Содержание», копирайт, финал — на языке книги. */
export const bookMessagesFor = (locale: Locale) => parts[locale].book;
/** Ошибки сети и запросов (common.errors). */
export const errorMessagesFor = (locale: Locale) => parts[locale].errors;
/** Дата словами (common.date). */
export const dateFor = (locale: Locale) => parts[locale].date;
/** Тексты сертификата (gift.card) — на языке, выбранном покупателем. */
export const giftCardMessagesFor = (locale: Locale) => parts[locale].giftCard;
/** Просьба написать письмо в книгу (books.letters.share) — на языке книги. */
export const letterShareFor = (locale: Locale) => parts[locale].letterShare;
/** Тарифы (common.plans) — например, на сертификате на языке покупателя. */
export const plansFor = (locale: Locale) => parts[locale].plans;
/** Статусы заказа (common.orderStatus) и оплаченной электронной версии (common.orderStatusDigital). */
export const orderStatusFor = (locale: Locale) => ({ all: parts[locale].orderStatus, digital: parts[locale].orderStatusDigital });

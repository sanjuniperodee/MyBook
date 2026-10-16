import type { ClientMessages } from "..";
import { auth } from "./auth";
import { book } from "./book";
import { books } from "./books";
import { catalog } from "./catalog";
import { checkout } from "./checkout";
import { common } from "./common";
import { editor } from "./editor";
import { gift } from "./gift";
import { invite } from "./invite";
import { landing } from "./landing";
import { orders } from "./orders";
import { review } from "./review";

/** Словарь для браузера: без серверных пространств — писем (mail), юридических текстов (legal) и ошибок API (api). */
export const kkClient: ClientMessages = { common, book, catalog, landing, auth, books, editor, checkout, orders, review, invite, gift };

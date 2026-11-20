import type { ClientMessages } from "..";
import { auth } from "./auth";
import { book } from "./book";
import { bookStudio } from "./book-studio";
import { books } from "./books";
import { catalog } from "./catalog";
import { checkout } from "./checkout";
import { common } from "./common";
import { design } from "./design";
import { editor } from "./editor";
import { gift } from "./gift";
import { help } from "./help";
import { invite } from "./invite";
import { landing } from "./landing";
import { orders } from "./orders";
import { pay } from "./pay";
import { review } from "./review";
import { secondary } from "./secondary";

/** Словарь для браузера: без серверных пространств — писем (mail), юридических текстов (legal) и ошибок API (api). */
export const enClient: ClientMessages = { common, book, catalog, landing, auth, books, editor, checkout, orders, review, invite, gift, pay, design, help, secondary, bookStudio };

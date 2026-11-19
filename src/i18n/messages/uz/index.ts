import type { Messages } from "..";
import { access } from "./access";
import { answerFile } from "./answer-file";
import { api } from "./api";
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
import { legal } from "./legal";
import { mail } from "./mail";
import { orders } from "./orders";
import { pay } from "./pay";
import { review } from "./review";
import { secondary } from "./secondary";

/**
 * Узбекский (латиница): кабинет, редактор, оформление, вход, письма, лендинг (landing) и юридические тексты (legal).
 */
export const uz: Messages = { common, book, catalog, landing, auth, books, editor, checkout, orders, review, invite, gift, legal, mail, api, pay, access, design, help, answerFile, secondary, bookStudio };

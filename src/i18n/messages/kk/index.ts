import type { Messages } from "..";
import { api } from "./api";
import { auth } from "./auth";
import { book } from "./book";
import { books } from "./books";
import { catalog } from "./catalog";
import { checkout } from "./checkout";
import { common } from "./common";
import { editor } from "./editor";
import { gift } from "./gift";
import { landing } from "./landing";
import { legal } from "./legal";
import { mail } from "./mail";
import { orders } from "./orders";
import { review } from "./review";
import { invite } from "./invite";

export const kk: Messages = { common, book, catalog, landing, auth, books, editor, checkout, orders, review, invite, gift, legal, mail, api };

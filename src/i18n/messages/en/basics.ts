/** Texts needed by the browser without the whole dictionary: network and request errors (client-api) and the date (dates). */
import type { Messages } from "..";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** “14 February” / “14 February 2027” */
export const date = (d: Date, withYear = false) => `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;

export const errors: Messages["common"]["errors"] = {
  generic: "That didn’t work. Please try again.",
  network: "No connection to the server. Check your internet and try again.",
  tooMany: "Too many attempts. Please try again later.",
  notFound: "Not found",
  forbidden: "No access",
  unauthorized: "Please log in to your account",
  badRequest: "Check the details you entered",
  server: "Something went wrong on our side. We are already looking into it.",
  bookLocked: "The book is already in an order — editing is closed",
  status: (code: number) => `Error ${code}`,
};

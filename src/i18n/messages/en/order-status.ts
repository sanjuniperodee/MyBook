import type { Messages } from "..";

/** Order statuses — in the shared dictionary, in the CRM and in order lists (without the whole dictionary). */
export const orderStatus: Messages["common"]["orderStatus"] = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  in_production: "In production",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Digital version: a paid order is already complete — there is nothing to print or ship. */
export const orderStatusDigital: Messages["common"]["orderStatusDigital"] = {
  paid: "Completed · files available",
};

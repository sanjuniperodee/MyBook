import "server-only";
import { deleteFile, getFile, putFile } from "@/shared/infrastructure/storage";
import type { ReceiptFiles } from "../../application";

/** Чеки оплат заказа — в общем файловом хранилище. */
export const storageReceiptFiles: ReceiptFiles = {
  put: (key, bytes) => putFile(key, bytes),
  remove: (key) => deleteFile(key),
  read: (key) => getFile(key).catch(() => null),
};

import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { site } from "@/config/site";
import { env } from "@/config/env";
import type { CodeGenerator, PaymentSettings } from "../../application/ports";

/** Без похожих символов (0/O, 1/I/L), чтобы код легко продиктовать. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const randomCodes: CodeGenerator = {
  giftCode() {
    const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    return `GIFT-${part()}-${part()}`;
  },
  giftToken: () => randomBytes(18).toString("base64url"),
};

export const envPaymentSettings: PaymentSettings = {
  provider: () => env.paymentProvider,
  currency: () => site.currency,
};

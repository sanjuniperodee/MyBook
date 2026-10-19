import { randomInt } from "node:crypto";

/** Без похожих символов (0/O, 1/l/I): пароль диктуют по телефону и переписывают в мессенджер. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Пароль для клиента, которому менеджер выдаёт доступ: 10 знаков, не короче правила сайта (8). */
export function generateAccessPassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

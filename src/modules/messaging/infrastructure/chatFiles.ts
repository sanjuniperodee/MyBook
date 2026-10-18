import "server-only";
import { randomUUID } from "node:crypto";
import { getFile, putFile } from "@/shared/infrastructure/storage";
import type { ChatFileStore } from "../application";

/** Файлы, которые сотрудник отправил из CRM, лежат в хранилище сайта; в сообщении — ссылка store:<ключ>. */
const PREFIX = "store:";
const KEY = /^chat-media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  zip: "application/zip",
};

const extOf = (name: string, mime: string) => {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName && MIME[fromName]) return fromName;
  return Object.entries(MIME).find(([, m]) => m === mime.split(";")[0])?.[0] ?? "bin";
};

export const chatFiles: ChatFileStore = {
  owns: (mediaUrl) => !!mediaUrl && mediaUrl.startsWith(PREFIX),
  async save(conversationId, file) {
    const key = `chat-media/${conversationId}/${randomUUID()}.${extOf(file.name, file.mime)}`;
    await putFile(key, file.data);
    return `${PREFIX}${key}`;
  },
  async read(mediaUrl) {
    const key = mediaUrl.slice(PREFIX.length);
    if (!KEY.test(key)) return null;
    try {
      const data = await getFile(key);
      return { data: new Uint8Array(data), mime: MIME[key.split(".").pop() ?? ""] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  },
};

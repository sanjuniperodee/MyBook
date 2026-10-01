import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { getTheme, isThemeId } from "@/lib/content/themes";
import { MAX_UPLOAD_BYTES, processUpload } from "@/lib/images";
import { deleteFile, deletePrefix, getFile, putFile } from "@/lib/storage";
import type { ThemeId } from "@/lib/content/types";
import type { FileStore, IdGenerator, ImageProcessor, ThemeCatalog } from "../application/ports";

/** Банк вопросов из src/lib/content: ключ вопроса — theme.chapter.N. */
export const contentThemes: ThemeCatalog = {
  isTheme: (id) => isThemeId(id),
  get(themeId, language) {
    const t = getTheme(themeId as ThemeId, language);
    return {
      id: t.id,
      recipientGender: t.recipientGender,
      titleSuggestions: t.titleSuggestions,
      defaultCover: t.defaultCover,
      questions: t.chapters.flatMap((ch) => ch.questions.map(([prompt, title, hint], i) => ({ chapter: ch.key, key: `${t.id}.${ch.key}.${i + 1}`, prompt, title, hint: hint ?? null }))),
    };
  },
};

export const sharpImages: ImageProcessor = {
  maxUploadBytes: MAX_UPLOAD_BYTES,
  process: processUpload,
  async rotate(full, thumb) {
    const [f, t] = await Promise.all([sharp(full).rotate(90).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer(), sharp(thumb).rotate(90).jpeg({ quality: 82, mozjpeg: true }).toBuffer()]);
    return { full: f, thumb: t };
  },
};

export const storageFiles: FileStore = { get: getFile, put: putFile, delete: deleteFile, deletePrefix };

export const randomIds: IdGenerator = {
  uuid: () => randomUUID(),
  inviteToken: () => randomBytes(12).toString("base64url"),
  revision: () => randomUUID().slice(0, 8),
};

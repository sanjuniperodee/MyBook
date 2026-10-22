import { z } from "zod";
import { CROP_ZOOM_MAX } from "@/lib/book/photo-crop";
import { uuid } from "@/server/input";

/** Правка фото из редактора — одна (PATCH …/photos/[pid]) или пачкой (POST …/photos/batch): правила места проверяет домен (Photo.update). */
export const photoPatchSchema = z
  .object({
    caption: z.string().trim().max(200),
    layout: z.enum(["full", "bleed", "half", "grid"]),
    questionId: uuid.nullable(),
    inline: z
      .object({
        width: z.number().min(25).max(100),
        align: z.enum(["left", "center", "right"]),
        anchor: z.number().int().min(-1).max(10_000).nullable(),
        aspect: z.enum(["original", "1:1", "4:3", "3:4", "16:9"]),
        focusX: z.number().min(0).max(1),
        focusY: z.number().min(0).max(1),
        frame: z.enum(["none", "line", "polaroid", "round"]),
        page: z.boolean().optional(),
        pageFit: z.literal("contain").optional(),
      })
      .strict()
      .nullable(),
    // Кадр автора: точка (доли снимка) и приближение; пределы приводит домен (normalizeCrop).
    chapter: z.string().regex(/^[\w-]{1,80}$/).nullable(),
    opener: z.boolean(),
    crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(CROP_ZOOM_MAX) }).strict().nullable(),
  })
  .partial()
  .strict();

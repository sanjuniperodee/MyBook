import { z } from "zod";

/**
 * Схема запроса к ИИ-дизайнеру обложки и страниц — общая для сайта (/api/books/{id}/design-ai) и бэкенда NestJS.
 */
const common = {
  mode: z.enum(["edit", "create", "variants", "review"]).default("edit"),
  prompt: z.string().trim().max(500),
  history: z
    .array(
      z.object({ prompt: z.string().max(500), reply: z.string().max(600) }),
    )
    .max(4)
    .default([]),
};

export const designAiBody = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("pages"),
    ...common,
    state: z.object({
      interior: z.string().max(40),
      style: z.record(z.string(), z.unknown()),
    }),
    chapters: z
      .array(z.object({ key: z.string().max(90), title: z.string().max(120) }))
      .max(60)
      .default([]),
  }),
  z.object({
    target: z.literal("cover"),
    ...common,
    state: z.object({
      template: z.string().max(40),
      design: z.record(z.string(), z.unknown()),
    }),
  }),
]);

export type DesignAiBody = z.infer<typeof designAiBody>;

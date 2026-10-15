import type { Locale } from "@/i18n/config";
import type { ThemeId } from "../types";
import type { OccasionId } from "../../occasions";

export interface LandingContent {
  /** Короткое имя для ссылок в футере. */
  label: string;
  h1: string;
  accent: string;
  metaTitle: string;
  metaDescription: string;
  lead: string;
  why: { title: string; text: string }[];
  cover: { title: string; names: string; subtitle?: string };
  faq: [string, string][];
}

export interface Landing {
  slug: string;
  theme: ThemeId;
  occasion?: OccasionId;
  coverTemplate: string;
  authorGender: "m" | "f";
  recipientGender: "m" | "f";
  content: Record<Locale, LandingContent>;
}

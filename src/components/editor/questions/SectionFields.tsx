"use client";

import { forwardRef, useState } from "react";
import { ChevronDown, StickyNote } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import type { EditorQuestion } from "@/lib/book/editor-model";
import { cssFont, type Typography } from "@/lib/book/fonts";
import { SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { cn } from "@/lib/class-names";
import type { Patch } from "./draft";

/**
 * Раздел своей книги: заголовок в книге — крупное поле (h1 листа), под ним свёрнутая «Подсказка для себя».
 * Заголовок может быть пустым — в книге на его месте разделитель; подсказка в книгу не попадает.
 */
export const SectionFields = forwardRef<HTMLInputElement, { question: EditorQuestion; language: Locale; typography: Typography; editable: boolean; onPatch: (patch: Patch) => void }>(function SectionFields(
  { question: q, language, typography, editable, onPatch },
  titleRef,
) {
  const t = useMessages().editor.blank;
  // Подсказка раскрыта, если уже есть; своё раскрытие запоминается для раздела (key на разделе сбрасывает его).
  const [hintOpen, setHintOpen] = useState(!!q.prompt.trim());
  const noTitle = !q.defaultTitle.trim();
  return (
    <div>
      <input
        ref={titleRef}
        value={q.defaultTitle}
        onChange={(e) => onPatch({ title: e.target.value })}
        readOnly={!editable}
        maxLength={SECTION_TITLE_MAX}
        lang={language}
        placeholder={t.titlePlaceholder}
        aria-label={t.titleAria}
        className="fs-keep w-full bg-transparent text-2xl leading-tight font-medium text-ink outline-none placeholder:text-muted/50 sm:text-[38px]"
        style={{ fontFamily: cssFont(typography.heading), fontStyle: typography.headingItalic ? "italic" : "normal" }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {noTitle ? (
          <span className="text-muted">{t.noTitleNote}</span>
        ) : editable ? (
          <button type="button" className="py-1 text-wine hover:underline max-sm:py-2" onClick={() => onPatch({ title: "" })}>
            {t.clearTitle}
          </button>
        ) : null}
      </div>
      <button type="button" className="mt-3 inline-flex items-center gap-1.5 py-1 text-sm text-wine hover:underline max-sm:py-2" aria-expanded={hintOpen} onClick={() => setHintOpen((v) => !v)}>
        <StickyNote className="size-4" /> {t.hint}
        <ChevronDown className={cn("size-3.5 transition", hintOpen && "rotate-180")} />
      </button>
      {hintOpen ? (
        <textarea
          value={q.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
          readOnly={!editable}
          maxLength={SECTION_PROMPT_MAX}
          rows={2}
          lang={language}
          placeholder={editable ? t.hintPlaceholder : ""}
          aria-label={t.hintAria}
          className="input mt-2 min-h-16 resize-none text-[15px] leading-relaxed"
        />
      ) : null}
    </div>
  );
});

"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import type { EditorQuestion } from "@/lib/book/editor-model";
import { cssFont, type Typography } from "@/lib/book/fonts";
import type { Patch } from "./draft";

/** Заголовок ответа, как он будет в книге: свой текст, сброс к вопросу, скрыть совсем. */
export function HeadingField({ question: q, language, typography, editable, onPatch }: { question: EditorQuestion; language: Locale; typography: Typography; editable: boolean; onPatch: (patch: Patch) => void }) {
  const t = useMessages().editor;
  return (
    <div className="mt-6 flex items-end gap-2 border-b border-line pb-1.5 focus-within:border-wine/50 sm:mt-8">
      <div className="min-w-0 flex-1">
        <label htmlFor={`heading-${q.id}`} className="block text-xs text-muted">{t.headingInBook}</label>
        <input
          id={`heading-${q.id}`}
          value={q.hideHeading ? "" : (q.displayText ?? q.defaultTitle)}
          placeholder={q.hideHeading ? t.headingHidden : q.defaultTitle}
          lang={language}
          onChange={(e) => onPatch({ displayText: e.target.value })}
          onBlur={() => q.displayText !== null && !q.displayText.trim() && onPatch({ displayText: null })}
          disabled={!editable || q.hideHeading}
          maxLength={200}
          className="fs-keep mt-0.5 w-full bg-transparent text-lg outline-none disabled:text-muted"
          style={{ fontFamily: cssFont(typography.heading), fontStyle: typography.headingItalic ? "italic" : "normal" }}
        />
      </div>
      {q.displayText !== null && q.displayText !== q.defaultTitle && !q.hideHeading ? (
        <button className="min-h-11 shrink-0 px-1 text-xs text-wine hover:underline sm:min-h-9" onClick={() => onPatch({ displayText: null })}>
          {t.headingReset}
        </button>
      ) : null}
      <button
        className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-sunken hover:text-ink sm:size-9"
        onClick={() => onPatch({ hideHeading: !q.hideHeading })}
        disabled={!editable}
        title={q.hideHeading ? t.headingShow : t.headingHide}
        aria-label={q.hideHeading ? t.headingShow : t.headingHide}
        aria-pressed={q.hideHeading}
      >
        {q.hideHeading ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

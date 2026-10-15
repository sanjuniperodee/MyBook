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
    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-dashed border-line px-4 py-3 sm:mt-8">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] tracking-wider text-muted uppercase">{t.headingInBook}</div>
        <input
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
        <button className="mt-3.5 shrink-0 py-1 text-xs text-wine hover:underline" onClick={() => onPatch({ displayText: null })}>
          {t.headingReset}
        </button>
      ) : null}
      <button
        className="-mt-1 shrink-0 rounded-lg p-3 text-muted hover:bg-cream hover:text-ink sm:mt-1.5 sm:p-1.5"
        onClick={() => onPatch({ hideHeading: !q.hideHeading })}
        disabled={!editable}
        title={q.hideHeading ? t.headingShow : t.headingHide}
      >
        {q.hideHeading ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

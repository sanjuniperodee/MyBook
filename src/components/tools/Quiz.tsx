"use client";

import { useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Link, useLocale } from "@/i18n/client";
import { toolUi } from "@/lib/content/tools/ui";
import { questionsToAsk, quizBand, quizPercent, type Answer, type QuizData } from "@/lib/tools/quiz";
import { cn } from "@/lib/class-names";
import { CopyButton } from "./Choice";

/** Тест «как хорошо вы знаете…»: по одному утверждению на экран, в конце — процент и вопросы, которые стоит задать. */
export function Quiz({ quiz, ctaHref, ctaLabel }: { quiz: QuizData; ctaHref: string; ctaLabel: string }) {
  const ui = toolUi[useLocale()].quiz;
  const total = quiz.items.length;
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Answer[]>([]);

  if (step < 0) {
    return (
      <div className="card p-8 text-center sm:p-12">
        <p className="mx-auto max-w-md leading-relaxed text-ink-soft">{ui.intro(total)}</p>
        <button type="button" className="btn btn-primary btn-lg mt-6" onClick={() => setStep(0)}>
          {ui.start}
        </button>
      </div>
    );
  }

  if (step >= total) {
    const percent = quizPercent(answers, total);
    const band = quizBand(percent);
    const ask = questionsToAsk(quiz.items, answers);
    return (
      <div className="card p-6 sm:p-8" aria-live="polite">
        <div className="rounded-3xl bg-gradient-to-br from-rose/60 to-cream px-6 py-8 text-center">
          <div className="text-xs font-semibold tracking-[0.18em] text-wine uppercase">{ui.resultTitle}</div>
          <div className="mt-3 font-serif text-7xl leading-none font-medium text-wine tabular-nums" data-testid="quiz-percent">
            {ui.percent(percent)}
          </div>
          <div className="mt-3 font-serif text-2xl text-ink">{ui.bands[band]}</div>
          <p className="mx-auto mt-3 max-w-lg leading-relaxed text-ink-soft">{ui.bandText(band, quiz.who)}</p>
        </div>

        <h3 className="mt-8 font-serif text-2xl font-medium">{ui.askTitle}</h3>
        {ask.length ? (
          <>
            <p className="mt-1 text-sm text-muted">{ui.askLead}</p>
            <ol className="mt-4 space-y-2">
              {ask.slice(0, 8).map((a, i) => (
                <li key={a.ask} className={cn("flex gap-3 rounded-2xl border p-4 leading-relaxed", a.level === 0 ? "border-wine/25 bg-rose/30" : "border-line bg-white")}>
                  <span className="font-serif text-wine">{i + 1}.</span>
                  <span>{a.ask}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-2 text-muted">{ui.perfect}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={ctaHref} className="btn btn-primary">
            {ctaLabel}
          </Link>
          <CopyButton text={ui.shareText(percent, quiz.who)} label={ui.copy} done={ui.copied} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setAnswers([]);
              setStep(-1);
            }}
          >
            <RotateCcw className="size-4" /> {ui.retry}
          </button>
        </div>
      </div>
    );
  }

  const item = quiz.items[step];
  const choose = (a: Answer) => {
    const next = [...answers];
    next[step] = a;
    setAnswers(next);
    setStep(step + 1);
  };

  return (
    <div className="card p-6 sm:p-10">
      <div className="flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step}>
          <div className="h-full rounded-full bg-wine transition-all" style={{ width: `${(step / total) * 100}%` }} />
        </div>
        <span className="text-sm text-muted tabular-nums">
          {step + 1} / {total}
        </span>
      </div>
      <p className="mt-8 min-h-[4.5rem] font-serif text-2xl leading-snug sm:text-3xl" data-testid="quiz-question">
        {ui.question(step + 1, total, item.know)}
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {([2, 1, 0] as const).map((a, i) => (
          <button key={a} type="button" className={cn("btn btn-lg", a === 2 ? "btn-primary" : "btn-outline")} onClick={() => choose(a)}>
            {ui.answers[i]}
          </button>
        ))}
      </div>
      {step > 0 ? (
        <button type="button" className="btn btn-ghost btn-sm mt-5" onClick={() => setStep(step - 1)}>
          <ArrowLeft className="size-4" /> {ui.back}
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Link, useLocale } from "@/i18n/client";
import { toolUi } from "@/lib/content/tools/ui";
import { questionsToAsk, quizBand, quizPercent, type Answer, type QuizData } from "@/lib/tools/quiz";
import { cn } from "@/lib/class-names";
import { CopyButton, Figure, Workbench } from "./Workbench";

/** Тест «как хорошо вы знаете…»: по одному утверждению на экран, в конце — процент и вопросы, которые стоит задать. */
export function Quiz({ quiz, ctaHref, ctaLabel }: { quiz: QuizData; ctaHref: string; ctaLabel: string }) {
  const ui = toolUi[useLocale()].quiz;
  const total = quiz.items.length;
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Answer[]>([]);

  if (step < 0) {
    return (
      <div className="overflow-clip rounded-[14px] border border-line bg-white px-5 py-10 text-center sm:px-10 sm:py-14">
        <p className="mx-auto max-w-lg font-serif text-2xl leading-snug text-ink sm:text-[28px]">{ui.intro(total)}</p>
        <button type="button" className="btn btn-primary btn-lg mt-8 w-full sm:w-auto" onClick={() => setStep(0)}>
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
      <Workbench
        cta={false}
        stickyResult={false}
        inputTitle={ui.resultTitle}
        resultTitle={ui.askTitle}
        input={
          <div aria-live="polite">
            <Figure value={ui.percent(percent)} caption={ui.bands[band]} testId="quiz-percent" />
            <p className="mt-4 leading-relaxed text-ink-soft">{ui.bandText(band, quiz.who)}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={ctaHref} className="btn btn-primary btn-lg w-full sm:w-auto">
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
        }
        result={
          ask.length ? (
            <div>
              <p className="text-sm text-muted">{ui.askLead}</p>
              <ol className="mt-3 divide-y divide-line border-y border-line">
                {ask.slice(0, 8).map((a, i) => (
                  <li key={a.ask} className={cn("flex gap-3 py-3 leading-relaxed", a.level === 0 && "-mx-3 bg-rose px-3")}>
                    <span className="w-5 shrink-0 font-serif text-lg text-wine tabular-nums">{i + 1}</span>
                    <span>{a.ask}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-ink-soft">{ui.perfect}</p>
          )
        }
      />
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
    <div className="overflow-clip rounded-[14px] border border-line bg-white">
      {/* Прогресс — десять делений, пройденные закрашены; под ними — номер вопроса. */}
      <div className="px-5 pt-5 sm:px-10 sm:pt-7">
        <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step}>
          {quiz.items.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-[2px]", i < step ? "bg-wine" : i === step ? "bg-wine/45" : "bg-line")} />
          ))}
        </div>
        <div className="mt-3 text-sm text-muted tabular-nums">
          {step + 1} / {total}
        </div>
      </div>
      <p className="min-h-[7.5rem] px-5 pt-6 font-serif text-[28px] leading-[1.2] text-ink sm:px-10 sm:text-[38px]" data-testid="quiz-question">
        {ui.question(step + 1, total, item.know)}
      </p>
      <div className="grid gap-3 px-5 py-8 sm:grid-cols-3 sm:px-10">
        {([2, 1, 0] as const).map((a, i) => (
          <button key={a} type="button" className={cn("btn btn-lg h-14 sm:h-16", a === 2 ? "btn-primary" : "btn-outline")} onClick={() => choose(a)}>
            {ui.answers[i]}
          </button>
        ))}
      </div>
      {step > 0 ? (
        <div className="border-t border-line px-5 py-3 sm:px-10">
          <button type="button" className="btn btn-ghost btn-sm -ml-3" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="size-4" /> {ui.back}
          </button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useMessages } from "@/i18n/client";

/** Скелет редактора: полоса, оглавление слева, лист по центру и страница справа — как в QuestionsEditor, чтобы переход не «прыгал». */
export default function Loading() {
  const t = useMessages().editor.chrome;
  return (
    <div aria-busy="true" aria-label={t.loading}>
      <div className="h-12 border-b border-line/70 bg-paper/90 max-sm:h-14">
        <div className="mx-auto flex h-full max-w-[96rem] items-center gap-3 px-4 sm:px-6">
          <div className="skeleton size-9 rounded-[10px]" />
          <div className="skeleton h-4 w-40 sm:w-56" />
          <div className="ml-auto hidden items-center gap-3 lg:flex">
            <div className="skeleton h-3 w-36" />
            <div className="skeleton h-8 w-24 rounded-[8px]" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[96rem] gap-8 px-4 pt-4 sm:px-6 sm:pt-6 min-[1100px]:grid-cols-[minmax(0,1fr)_320px] min-[1281px]:grid-cols-[248px_minmax(0,1fr)_320px] xl:gap-10">
        <div className="hidden space-y-3 min-[1281px]:block">
          <div className="skeleton h-10 rounded-[10px]" />
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
        </div>
        <div className="mx-auto w-full max-w-[46rem] min-w-0">
          <div className="rounded-[14px] border border-line bg-white px-5 py-8 sm:px-10 sm:py-14 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
            <div className="skeleton h-9 w-11/12 sm:h-11" />
            <div className="skeleton mt-3 h-9 w-2/3 sm:h-11" />
            <div className="skeleton mt-5 h-4 w-3/4" />
            <div className="mt-10 space-y-3">
              <div className="skeleton h-5" />
              <div className="skeleton h-5" />
              <div className="skeleton h-5 w-4/5" />
              <div className="skeleton h-5 w-2/3" />
            </div>
          </div>
        </div>
        <div className="hidden space-y-4 min-[1100px]:block">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-[26rem] rounded-[12px]" />
        </div>
      </div>
    </div>
  );
}

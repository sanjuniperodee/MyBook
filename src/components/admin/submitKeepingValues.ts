import { startTransition, type FormEvent } from "react";

/**
 * onSubmit для формы с useActionState вместо action формы. После action формы React 19 сбрасывает неуправляемые поля —
 * при ошибке сервера набранное пропадало бы. Здесь действие вызывается из перехода, форма не сбрасывается; очистить её
 * после успеха — забота формы (reset() по state.ok).
 */
export function submitKeepingValues(dispatch: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
}

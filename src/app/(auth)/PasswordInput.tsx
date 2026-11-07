"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useMessages } from "@/i18n/client";

/**
 * Поле пароля с кнопкой «показать»: на телефоне пароль легко набрать с опечаткой. Вставка и менеджеры паролей
 * работают как с обычным полем (name, autoComplete — снаружи); кнопка не отправляет форму.
 */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const f = useMessages().auth.fields;
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className="input pr-12" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? f.hidePassword : f.showPassword}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-wine"
      >
        {shown ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </div>
  );
}
